// ==================== DECODER LOGIC ====================

import pako from 'pako';
import { classToCC } from '../shared/index.js';

// Check if data is zlib compressed
const isZlibCompressed = (data) => {
  if (data.byteLength < 2) return false;
  const view = new DataView(data);
  const firstByte = view.getUint8(0);
  const secondByte = view.getUint8(1);

  // Check for zlib header (0x78 followed by 0x01, 0x5E, 0x9C, or 0xDA)
  return firstByte === 0x78 && [0x01, 0x5E, 0x9C, 0xDA].includes(secondByte);
};

// Decompress zlib data
const decompressZlib = (arrayBuffer) => {
  try {
    const compressed = new Uint8Array(arrayBuffer);
    const decompressed = pako.inflate(compressed);
    return decompressed.buffer;
  } catch (e) {
    throw new Error(`Zlib decompression failed: ${e.message}`);
  }
};

export const decodeFile = (arrayBuffer) => {
  let processedBuffer = arrayBuffer;
  let wasCompressed = false;
  let originalSize = arrayBuffer.byteLength;

  // Check if file is zlib compressed and decompress
  if (isZlibCompressed(arrayBuffer)) {
    try {
      processedBuffer = decompressZlib(arrayBuffer);
      wasCompressed = true;
    } catch (e) {
      throw new Error(`Failed to decompress file: ${e.message}`);
    }
  }
  const data = new DataView(processedBuffer);
  const fileSize = processedBuffer.byteLength;
  let fptr = 0;

  const output = {
    fileSize,
    originalSize,
    wasCompressed,
    compressionRatio: wasCompressed ? ((1 - originalSize / fileSize) * 100).toFixed(1) : null,
    formatVersion: 0,
    numDescriptors: 0,
    combos: [],
    numCombos: 0,
    maxStreams: 0,
    errors: [],
    descriptorStats: { 137: 0, 138: 0, 201: 0, 202: 0, 333: 0, 334: 0 },
    // Store original grouping info
    groups: [] // Array of { descType, dlData, combos: [...] }
  };

  const readUint16 = () => {
    if (fptr + 2 > fileSize) throw new Error('Unexpected end of file');
    const val = data.getUint16(fptr, true) & 0xffff;
    fptr += 2;
    return val;
  };

  const readUint8 = () => {
    if (fptr + 1 > fileSize) throw new Error('Unexpected end of file');
    const val = data.getUint8(fptr) & 0xff;
    fptr += 1;
    return val;
  };

  const skipBytes = (n) => {
    fptr += n;
  };

  const buildCombo = (band, bclass, ant, ulclass, ulca, showMimo, descType, groupIdx) => {
    let comboStr = '';
    let st = 0;
    let hasCarrier = false;

    for (let i = 0; i < 6; i++) {
      if (band[i] === 0) continue;

      if (hasCarrier) comboStr += '-';

      comboStr += `${band[i]}`;
      comboStr += String.fromCharCode(bclass[i] + 0x40);

      if (showMimo && ant[i] !== 0) {
        comboStr += ant[i];
      }

      if (ulclass[i] !== 0) {
        comboStr += String.fromCharCode(ulclass[i] + 0x40);
      }

      // CORRECT formula: streams = CC_count * MIMO
      // CC_count = bclass (A=1, B=2, C=3, etc.)
      // OLD WRONG formula was: (bclass-1)*ant for bclass > 1
      const ccCount = classToCC(bclass[i]);
      const mimo = ant[i] || 2;
      st += ccCount * mimo;

      hasCarrier = true;
    }

    if (!hasCarrier) return null;

    // Determine hasULCA: UL CA exists when more than one carrier has UL
    // OLD WRONG logic: ulca > 0 (which was set by ulClass > 2 condition)
    // CORRECT logic: count carriers with ulclass > 0, UL CA if count > 1
    let ulCount = 0;
    for (let i = 0; i < 6; i++) {
      if (ulclass[i] > 0) ulCount++;
    }
    const hasULCA = ulCount > 1;

    return {
      text: comboStr,
      streams: st,
      hasULCA: hasULCA,
      descType: descType,
      groupIdx: groupIdx,
      dlKey: band.map((b, i) => `${b}:${bclass[i]}:${ant[i]}`).join('|'),
      rawBand: [...band],
      rawBclass: [...bclass],
      rawAnt: [...ant],
      rawUlclass: [...ulclass]
    };
  };

  try {
    output.formatVersion = readUint16();
    output.numDescriptors = readUint16();

    let band = [0, 0, 0, 0, 0, 0];
    let bclass = [0, 0, 0, 0, 0, 0];
    let ulclass = [0, 0, 0, 0, 0, 0];
    let ant = [0, 0, 0, 0, 0, 0];
    let currentDescType = 137;
    let currentGroupIdx = -1;

    while (fptr < fileSize) {
      const item16 = readUint16();

      if (item16 === 333) {
        output.descriptorStats[333]++;
        currentDescType = 333;
        band = [0, 0, 0, 0, 0, 0];
        bclass = [0, 0, 0, 0, 0, 0];
        ulclass = [0, 0, 0, 0, 0, 0];
        ant = [0, 0, 0, 0, 0, 0];
        let descok = false;

        for (let i = 0; i < 6; i++) {
          const bandVal = readUint16();
          if (bandVal !== 0) {
            band[i] = bandVal;
            descok = true;
          }
          bclass[i] = readUint8();

          let antVal = 0;
          for (let j = 0; j < 8; j++) {
            const antByte = readUint8();
            if (antByte !== 0) {
              antVal = antVal * 10 + antByte;
            }
          }
          ant[i] = antVal;
        }

        if (!descok) {
          output.errors.push('Incorrect format: no any downlink carrier in combo');
          break;
        }

        // Start new group
        currentGroupIdx = output.groups.length;
        output.groups.push({
          descType: 333,
          band: [...band],
          bclass: [...bclass],
          ant: [...ant],
          combos: []
        });
        continue;
      }

      if (item16 === 334) {
        output.descriptorStats[334]++;
        let ulca = 0;
        ulclass = [0, 0, 0, 0, 0, 0];

        let ulBand = readUint16();
        let ulClass = readUint8();
        skipBytes(8);

        for (let i = 0; i < 6; i++) {
          if (ulBand === band[i] && bclass[i] >= 0) {
            ulclass[i] = ulClass;
            if (ulClass > 2) ulca = 1;
            break;
          }
        }

        ulBand = readUint16();
        ulClass = readUint8();
        skipBytes(8);

        if (ulBand !== 0) {
          for (let i = 0; i < 6; i++) {
            if (ulBand === band[i] && bclass[i] >= 0) {
              ulclass[i] = ulClass;
              ulca++;
              break;
            }
          }
        }

        skipBytes(44);

        const combo = buildCombo(band, bclass, ant, ulclass, ulca, true, 333, currentGroupIdx);
        if (combo) {
          output.combos.push(combo);
          output.groups[currentGroupIdx].combos.push(output.numCombos);
          output.numCombos++;
          if (combo.streams > output.maxStreams) {
            output.maxStreams = combo.streams;
          }
        }
        continue;
      }

      if (item16 === 201) {
        output.descriptorStats[201]++;
        currentDescType = 201;
        band = [0, 0, 0, 0, 0, 0];
        bclass = [0, 0, 0, 0, 0, 0];
        ulclass = [0, 0, 0, 0, 0, 0];
        ant = [0, 0, 0, 0, 0, 0];
        let descok = false;

        for (let i = 0; i < 6; i++) {
          const bandVal = readUint16();
          if (bandVal !== 0) {
            band[i] = bandVal;
            descok = true;
          }
          bclass[i] = readUint8();
          ant[i] = readUint8();
        }

        if (!descok) {
          output.errors.push('Incorrect format: no any downlink carrier in combo');
          break;
        }

        // Start new group
        currentGroupIdx = output.groups.length;
        output.groups.push({
          descType: 201,
          band: [...band],
          bclass: [...bclass],
          ant: [...ant],
          combos: []
        });
        continue;
      }

      if (item16 === 202) {
        output.descriptorStats[202]++;
        let ulca = 0;
        ulclass = [0, 0, 0, 0, 0, 0];

        let ulBand = readUint16();
        let ulClass = readUint8();
        skipBytes(1);

        for (let i = 0; i < 6; i++) {
          if (ulBand === band[i] && bclass[i] >= 0) {
            ulclass[i] = ulClass;
            if (ulClass > 2) ulca = 1;
            break;
          }
        }

        ulBand = readUint16();
        ulClass = readUint8();
        skipBytes(1);

        if (ulBand !== 0) {
          for (let i = 0; i < 6; i++) {
            if (ulBand === band[i] && bclass[i] >= 0) {
              ulclass[i] = ulClass;
              ulca++;
              break;
            }
          }
        }

        skipBytes(16);

        const combo = buildCombo(band, bclass, ant, ulclass, ulca, true, 201, currentGroupIdx);
        if (combo) {
          output.combos.push(combo);
          output.groups[currentGroupIdx].combos.push(output.numCombos);
          output.numCombos++;
          if (combo.streams > output.maxStreams) {
            output.maxStreams = combo.streams;
          }
        }
        continue;
      }

      if (item16 === 137) {
        output.descriptorStats[137]++;
        currentDescType = 137;
        band = [0, 0, 0, 0, 0, 0];
        bclass = [0, 0, 0, 0, 0, 0];
        ulclass = [0, 0, 0, 0, 0, 0];
        ant = [0, 0, 0, 0, 0, 0];
        let descok = false;

        for (let i = 0; i < 6; i++) {
          const bandVal = readUint16();
          if (bandVal !== 0) {
            band[i] = bandVal;
            ant[i] = 2;
            descok = true;
          }
          bclass[i] = readUint8();
        }

        if (!descok) {
          output.errors.push('Incorrect format: no any downlink carrier in combo');
          break;
        }

        // Start new group
        currentGroupIdx = output.groups.length;
        output.groups.push({
          descType: 137,
          band: [...band],
          bclass: [...bclass],
          ant: [...ant],
          combos: []
        });
        continue;
      }

      if (item16 === 138) {
        output.descriptorStats[138]++;
        let ulca = 0;
        ulclass = [0, 0, 0, 0, 0, 0];

        let ulBand = readUint16();
        let ulClass = readUint8();

        for (let i = 0; i < 6; i++) {
          if (ulBand === band[i] && bclass[i] >= 0) {
            ulclass[i] = ulClass;
            if (ulClass > 2) ulca = 1;
            break;
          }
        }

        ulBand = readUint16();
        ulClass = readUint8();

        if (ulBand !== 0) {
          for (let i = 0; i < 6; i++) {
            if (ulBand === band[i] && bclass[i] >= 0) {
              ulclass[i] = ulClass;
              ulca++;
              break;
            }
          }
        }

        skipBytes(12);

        const combo = buildCombo(band, bclass, ant, ulclass, ulca, true, 137, currentGroupIdx);
        if (combo) {
          output.combos.push(combo);
          output.groups[currentGroupIdx].combos.push(output.numCombos);
          output.numCombos++;
          if (combo.streams > output.maxStreams) {
            output.maxStreams = combo.streams;
          }
        }
        continue;
      }

      output.errors.push(
        `Incorrect format: incorrect descriptor type ${item16} (137, 138, 201, 202, 333 or 334 expected). File offset=0x${(fptr - 2).toString(16)}.`
      );
      break;
    }
  } catch (e) {
    output.errors.push(e.message);
  }

  return output;
};
