import React, { useState, useCallback } from 'react';

export default function NVItemEncoderDecoder() {
  const [activeTab, setActiveTab] = useState('decoder');
  
  // Decoder state
  const [decodeResults, setDecodeResults] = useState(null);
  const [decodeError, setDecodeError] = useState(null);
  
  // Encoder state
  const [encodeEntries, setEncodeEntries] = useState([]);
  const [encodeError, setEncodeError] = useState(null);
  const [formatVersion, setFormatVersion] = useState(7);
  const [descriptorType, setDescriptorType] = useState(201);
  const [recalculateStreams, setRecalculateStreams] = useState(false);
  const [optimizeGrouping, setOptimizeGrouping] = useState(true);
  const [autoDescriptorType, setAutoDescriptorType] = useState(true); // Auto-select 137 or 201 per combo
  const [preserveOriginalGrouping, setPreserveOriginalGrouping] = useState(false);
  const [originalGroups, setOriginalGroups] = useState(null); // Stored from decoder
  
  const [isDragging, setIsDragging] = useState(false);

  // ==================== DECODER LOGIC ====================
  
  const decodeFile = useCallback((arrayBuffer) => {
    const data = new DataView(arrayBuffer);
    const fileSize = arrayBuffer.byteLength;
    let fptr = 0;
    
    const output = {
      fileSize,
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

        if (bclass[i] === 1) {
          st += ant[i];
        } else if (ant[i] > 10) {
          let temp = ant[i];
          while (temp > 0) {
            st += temp % 10;
            temp = Math.floor(temp / 10);
          }
        } else {
          st += (bclass[i] - 1) * ant[i];
        }

        hasCarrier = true;
      }

      if (!hasCarrier) return null;

      return {
        text: comboStr,
        streams: st,
        hasULCA: ulca > 0,
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
  }, []);

  // ==================== ENCODER LOGIC ====================

  const parseComboString = (comboStr) => {
    const carriers = [];
    const parts = comboStr.trim().split('-');
    
    for (const part of parts) {
      if (!part) continue;
      
      const match = part.match(/^(\d+)([A-Z])(\d+)?([A-Z])?$/i);
      
      if (!match) {
        throw new Error(`Invalid carrier format: ${part}`);
      }
      
      const band = parseInt(match[1], 10);
      const bclass = match[2].toUpperCase().charCodeAt(0) - 0x40;
      const ant = match[3] ? parseInt(match[3], 10) : 2;
      const ulclass = match[4] ? match[4].toUpperCase().charCodeAt(0) - 0x40 : 0;
      
      carriers.push({ band, bclass, ant, ulclass });
    }
    
    return carriers;
  };

  const calculateStreams = (carriers) => {
    let st = 0;
    for (const c of carriers) {
      if (c.bclass === 1) {
        st += c.ant;
      } else if (c.ant > 10) {
        let temp = c.ant;
        while (temp > 0) {
          st += temp % 10;
          temp = Math.floor(temp / 10);
        }
      } else {
        st += (c.bclass - 1) * c.ant;
      }
    }
    return st;
  };

  const checkHasULCA = (carriers) => {
    const ulCount = carriers.filter(c => c.ulclass > 0).length;
    return ulCount > 1 || carriers.some(c => c.ulclass > 2);
  };

  const parseComboFile = (text, shouldRecalculate) => {
    const lines = text.split('\n');
    const entries = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Input file') || trimmed.startsWith('Format') || 
          trimmed.startsWith('Number') || trimmed.startsWith('Max streams')) {
        continue;
      }
      
      const match = trimmed.match(/^([A-Z0-9-]+)\s+(\d+)(\*)?/i);
      if (match) {
        try {
          const comboStr = match[1];
          const fileStreams = parseInt(match[2], 10);
          const fileHasULCA = match[3] === '*';
          const carriers = parseComboString(comboStr);
          
          const streams = shouldRecalculate ? calculateStreams(carriers) : fileStreams;
          const hasULCA = shouldRecalculate ? checkHasULCA(carriers) : fileHasULCA;
          
          // Generate DL key for grouping (normalized to 6 elements)
          const normalizedForKey = [];
          for (let i = 0; i < 6; i++) {
            normalizedForKey.push(carriers[i] || { band: 0, bclass: 0, ant: 0, ulclass: 0 });
          }
          const dlKey = normalizedForKey.map(c => `${c.band}:${c.bclass}:${c.ant}`).join('|');
          
          entries.push({
            text: comboStr,
            carriers,
            streams,
            hasULCA,
            dlKey,
            descType: 201 // Default, will be set based on settings
          });
        } catch (e) {
          console.warn(`Skipping invalid line: ${trimmed}`, e);
        }
      }
    }
    
    return entries;
  };

  // Determine if a combo needs 201/202 format (has non-2 MIMO)
  const needsExtendedFormat = (carriers) => {
    return carriers.some(c => c.ant !== 2 && c.ant !== 0);
  };

  // Encode using original grouping logic from decoded file
  const encodeWithOriginalGrouping = useCallback(() => {
    if (!originalGroups || originalGroups.length === 0) {
      throw new Error('No original grouping data available');
    }

    console.log('encodeWithOriginalGrouping called');
    console.log('originalGroups count:', originalGroups.length);
    console.log('encodeEntries count:', encodeEntries.length);

    // Build DL key for entry (without ulclass - only band:bclass:ant)
    const getDLKeyFromCarriers = (carriers) => {
      const parts = [];
      for (let i = 0; i < 6; i++) {
        const c = carriers[i] || { band: 0, bclass: 0, ant: 0 };
        parts.push(`${c.band}:${c.bclass}:${c.ant}`);
      }
      return parts.join('|');
    };

    // Build DL key from group data
    const getGroupDLKey = (group) => {
      const parts = [];
      for (let i = 0; i < 6; i++) {
        parts.push(`${group.band[i] || 0}:${group.bclass[i] || 0}:${group.ant[i] || 0}`);
      }
      return parts.join('|');
    };

    // Normalize carriers array to 6 elements
    const normalizeCarriers = (carriers) => {
      const result = [];
      for (let i = 0; i < 6; i++) {
        result.push(carriers[i] || { band: 0, bclass: 0, ant: 0, ulclass: 0 });
      }
      return result;
    };

    // Create a map of entries by their DL key (normalized)
    const entriesByDL = new Map();
    
    for (let i = 0; i < encodeEntries.length; i++) {
      const entry = encodeEntries[i];
      if (!entry.carriers || entry.carriers.length === 0) continue;
      
      const normalizedCarriers = normalizeCarriers(entry.carriers);
      const dlKey = getDLKeyFromCarriers(normalizedCarriers);
      
      if (!entriesByDL.has(dlKey)) {
        entriesByDL.set(dlKey, []);
      }
      entriesByDL.get(dlKey).push({ entry, index: i, normalizedCarriers });
    }

    console.log('Unique DL keys in entries:', entriesByDL.size);

    // Build groups for encoding using original group structure
    const encodingGroups = [];
    const usedEntries = new Set();

    // Process original groups - match entries by DL key
    for (const group of originalGroups) {
      const groupDLKey = getGroupDLKey(group);
      const matchingEntries = entriesByDL.get(groupDLKey) || [];
      
      // Get entries that haven't been used yet
      const availableEntries = matchingEntries.filter(m => !usedEntries.has(m.index));
      
      if (availableEntries.length > 0) {
        encodingGroups.push({
          descType: group.descType,
          band: [...group.band],
          bclass: [...group.bclass],
          ant: [...group.ant],
          entries: availableEntries.map(m => m.entry)
        });
        
        // Mark these entries as used
        availableEntries.forEach(m => usedEntries.add(m.index));
      }
    }

    console.log('encodingGroups count:', encodingGroups.length);
    console.log('Total entries used:', usedEntries.size);

    // Add new groups for entries not matching any original group
    const remainingByDL = new Map();
    for (let i = 0; i < encodeEntries.length; i++) {
      if (usedEntries.has(i)) continue;
      
      const entry = encodeEntries[i];
      if (!entry.carriers || entry.carriers.length === 0) continue;
      
      const normalizedCarriers = normalizeCarriers(entry.carriers);
      const dlKey = getDLKeyFromCarriers(normalizedCarriers);
      
      if (!remainingByDL.has(dlKey)) {
        remainingByDL.set(dlKey, { carriers: normalizedCarriers, entries: [] });
      }
      remainingByDL.get(dlKey).entries.push(entry);
    }

    // Create new groups for remaining entries
    for (const [dlKey, data] of remainingByDL) {
      // Determine descriptor type based on MIMO values
      const needsExtended = data.carriers.some(c => c.ant !== 2 && c.ant !== 0 && c.band !== 0);
      const descType = needsExtended ? 201 : 137;
      
      const band = data.carriers.map(c => c.band);
      const bclass = data.carriers.map(c => c.bclass);
      const ant = data.carriers.map(c => c.ant);
      
      encodingGroups.push({
        descType,
        band,
        bclass,
        ant,
        entries: data.entries
      });
    }

    // Calculate buffer size
    let totalSize = 4; // Header
    let numDescriptors = 0;
    
    for (const group of encodingGroups) {
      if (group.descType === 137) {
        totalSize += 20;
        totalSize += group.entries.length * 20;
        numDescriptors += 1 + group.entries.length;
      } else if (group.descType === 201) {
        totalSize += 26;
        totalSize += group.entries.length * 26;
        numDescriptors += 1 + group.entries.length;
      } else if (group.descType === 333) {
        totalSize += 68;
        totalSize += group.entries.length * 68;
        numDescriptors += 1 + group.entries.length;
      }
    }

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    const writeUint16 = (val) => {
      view.setUint16(offset, val & 0xffff, true);
      offset += 2;
    };

    const writeUint8 = (val) => {
      view.setUint8(offset, val & 0xff);
      offset += 1;
    };

    const writeZeros = (n) => {
      for (let i = 0; i < n; i++) {
        view.setUint8(offset++, 0);
      }
    };

    // Write header
    writeUint16(formatVersion);
    writeUint16(numDescriptors);

    // Write each group
    for (const group of encodingGroups) {
      if (group.descType === 137) {
        // Write DL descriptor (137)
        writeUint16(137);
        for (let i = 0; i < 6; i++) {
          writeUint16(group.band[i] || 0);
          writeUint8(group.bclass[i] || 0);
        }

        // Write UL descriptors (138) for each entry
        for (const entry of group.entries) {
          const carriers = normalizeCarriers(entry.carriers);
          const ulCarriers = carriers.filter(c => c.ulclass > 0).slice(0, 2);

          writeUint16(138);
          
          if (ulCarriers.length > 0) {
            writeUint16(ulCarriers[0].band);
            writeUint8(ulCarriers[0].ulclass);
          } else {
            writeUint16(0);
            writeUint8(0);
          }
          
          if (ulCarriers.length > 1) {
            writeUint16(ulCarriers[1].band);
            writeUint8(ulCarriers[1].ulclass);
          } else {
            writeUint16(0);
            writeUint8(0);
          }
          
          writeZeros(12);
        }
      } else if (group.descType === 201) {
        // Write DL descriptor (201)
        writeUint16(201);
        for (let i = 0; i < 6; i++) {
          writeUint16(group.band[i] || 0);
          writeUint8(group.bclass[i] || 0);
          writeUint8(group.ant[i] || 0);
        }

        // Write UL descriptors (202) for each entry
        for (const entry of group.entries) {
          const carriers = normalizeCarriers(entry.carriers);
          const ulCarriers = carriers.filter(c => c.ulclass > 0).slice(0, 2);

          writeUint16(202);
          
          if (ulCarriers.length > 0) {
            writeUint16(ulCarriers[0].band);
            writeUint8(ulCarriers[0].ulclass);
          } else {
            writeUint16(0);
            writeUint8(0);
          }
          writeUint8(0);
          
          if (ulCarriers.length > 1) {
            writeUint16(ulCarriers[1].band);
            writeUint8(ulCarriers[1].ulclass);
          } else {
            writeUint16(0);
            writeUint8(0);
          }
          writeUint8(0);
          
          writeZeros(16);
        }
      } else if (group.descType === 333) {
        // Write DL descriptor (333)
        writeUint16(333);
        for (let i = 0; i < 6; i++) {
          writeUint16(group.band[i] || 0);
          writeUint8(group.bclass[i] || 0);
          
          const antStr = (group.ant[i] || 0).toString();
          for (let j = 0; j < 8; j++) {
            if (j < antStr.length) {
              writeUint8(parseInt(antStr[j], 10));
            } else {
              writeUint8(0);
            }
          }
        }

        // Write UL descriptors (334) for each entry
        for (const entry of group.entries) {
          const carriers = normalizeCarriers(entry.carriers);
          const ulCarriers = carriers.filter(c => c.ulclass > 0).slice(0, 2);

          writeUint16(334);
          
          if (ulCarriers.length > 0) {
            writeUint16(ulCarriers[0].band);
            writeUint8(ulCarriers[0].ulclass);
          } else {
            writeUint16(0);
            writeUint8(0);
          }
          writeZeros(8);
          
          if (ulCarriers.length > 1) {
            writeUint16(ulCarriers[1].band);
            writeUint8(ulCarriers[1].ulclass);
          } else {
            writeUint16(0);
            writeUint8(0);
          }
          writeZeros(8);
          
          writeZeros(44);
        }
      }
    }

    return buffer;
  }, [encodeEntries, formatVersion, originalGroups]);

  // Encode with grouping optimization and mixed formats
  const encodeToBuffer = useCallback(() => {
    if (encodeEntries.length === 0) {
      throw new Error('No entries to encode');
    }

    console.log('encodeToBuffer called');
    console.log('preserveOriginalGrouping:', preserveOriginalGrouping);
    console.log('originalGroups:', originalGroups ? originalGroups.length : 'null');

    // Use original grouping if enabled and available
    if (preserveOriginalGrouping && originalGroups && originalGroups.length > 0) {
      console.log('Using encodeWithOriginalGrouping');
      return encodeWithOriginalGrouping();
    }

    console.log('Using auto-detect mode');

    // Separate entries by format type if auto-detect is enabled
    let entries137 = [];
    let entries201 = [];
    
    if (autoDescriptorType) {
      for (const entry of encodeEntries) {
        if (needsExtendedFormat(entry.carriers)) {
          entries201.push(entry);
        } else {
          entries137.push(entry);
        }
      }
    } else if (descriptorType === 137) {
      entries137 = [...encodeEntries];
    } else {
      entries201 = [...encodeEntries];
    }

    // Group entries by DL key
    const groupByDL = (entries) => {
      if (!optimizeGrouping) {
        return entries.map(e => [e]);
      }
      const groupMap = new Map();
      for (const entry of entries) {
        const dlKey = entry.dlKey || entry.carriers.map(c => `${c.band}:${c.bclass}:${c.ant}`).join('|');
        if (!groupMap.has(dlKey)) {
          groupMap.set(dlKey, []);
        }
        groupMap.get(dlKey).push(entry);
      }
      return Array.from(groupMap.values());
    };

    const groups137 = groupByDL(entries137);
    const groups201 = groupByDL(entries201);

    // Calculate buffer size
    let totalSize = 4; // Header
    let numDescriptors = 0;
    
    // 137/138 groups
    for (const group of groups137) {
      totalSize += 20; // One 137 descriptor
      totalSize += group.length * 20; // 138 descriptors
      numDescriptors += 1 + group.length;
    }
    
    // 201/202 groups
    for (const group of groups201) {
      totalSize += 26; // One 201 descriptor
      totalSize += group.length * 26; // 202 descriptors
      numDescriptors += 1 + group.length;
    }

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    const writeUint16 = (val) => {
      view.setUint16(offset, val & 0xffff, true);
      offset += 2;
    };

    const writeUint8 = (val) => {
      view.setUint8(offset, val & 0xff);
      offset += 1;
    };

    const writeZeros = (n) => {
      for (let i = 0; i < n; i++) {
        view.setUint8(offset++, 0);
      }
    };

    // Write header
    writeUint16(formatVersion);
    writeUint16(numDescriptors);

    // Write 137/138 groups first
    for (const group of groups137) {
      const firstEntry = group[0];
      const carriers = [...firstEntry.carriers];
      
      while (carriers.length < 6) {
        carriers.push({ band: 0, bclass: 0, ant: 0, ulclass: 0 });
      }

      // Write DL descriptor (137)
      writeUint16(137);
      for (let i = 0; i < 6; i++) {
        writeUint16(carriers[i].band);
        writeUint8(carriers[i].bclass);
      }

      // Write UL descriptors (138) for each combo
      for (const entry of group) {
        const entryCarriers = [...entry.carriers];
        while (entryCarriers.length < 6) {
          entryCarriers.push({ band: 0, bclass: 0, ant: 0, ulclass: 0 });
        }
        
        const ulCarriers = entryCarriers.filter(c => c.ulclass > 0).slice(0, 2);

        writeUint16(138);
        
        if (ulCarriers.length > 0) {
          writeUint16(ulCarriers[0].band);
          writeUint8(ulCarriers[0].ulclass);
        } else {
          writeUint16(0);
          writeUint8(0);
        }
        
        if (ulCarriers.length > 1) {
          writeUint16(ulCarriers[1].band);
          writeUint8(ulCarriers[1].ulclass);
        } else {
          writeUint16(0);
          writeUint8(0);
        }
        
        writeZeros(12);
      }
    }

    // Write 201/202 groups
    for (const group of groups201) {
      const firstEntry = group[0];
      const carriers = [...firstEntry.carriers];
      
      while (carriers.length < 6) {
        carriers.push({ band: 0, bclass: 0, ant: 0, ulclass: 0 });
      }

      // Write DL descriptor (201)
      writeUint16(201);
      for (let i = 0; i < 6; i++) {
        writeUint16(carriers[i].band);
        writeUint8(carriers[i].bclass);
        writeUint8(carriers[i].ant);
      }

      // Write UL descriptors (202) for each combo
      for (const entry of group) {
        const entryCarriers = [...entry.carriers];
        while (entryCarriers.length < 6) {
          entryCarriers.push({ band: 0, bclass: 0, ant: 0, ulclass: 0 });
        }
        
        const ulCarriers = entryCarriers.filter(c => c.ulclass > 0).slice(0, 2);

        writeUint16(202);
        
        if (ulCarriers.length > 0) {
          writeUint16(ulCarriers[0].band);
          writeUint8(ulCarriers[0].ulclass);
        } else {
          writeUint16(0);
          writeUint8(0);
        }
        writeUint8(0);
        
        if (ulCarriers.length > 1) {
          writeUint16(ulCarriers[1].band);
          writeUint8(ulCarriers[1].ulclass);
        } else {
          writeUint16(0);
          writeUint8(0);
        }
        writeUint8(0);
        
        writeZeros(16);
      }
    }

    return buffer;
  }, [encodeEntries, formatVersion, descriptorType, optimizeGrouping, autoDescriptorType, preserveOriginalGrouping, originalGroups, encodeWithOriginalGrouping]);

  // ==================== FILE HANDLERS ====================

  const handleDecodeFile = useCallback((file) => {
    if (!file) return;
    setDecodeError(null);
    setDecodeResults(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = decodeFile(e.target.result);
        setDecodeResults(result);
      } catch (err) {
        setDecodeError(err.message);
      }
    };
    reader.onerror = () => setDecodeError('Failed to read file');
    reader.readAsArrayBuffer(file);
  }, [decodeFile]);

  const handleEncodeFile = useCallback((file, append = false) => {
    if (!file) return;
    setEncodeError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const newEntries = parseComboFile(e.target.result, recalculateStreams);
        if (newEntries.length === 0) {
          throw new Error('No valid combos found in file');
        }
        
        if (append) {
          setEncodeEntries(prev => [...prev, ...newEntries]);
        } else {
          setEncodeEntries(newEntries);
          // Text file doesn't have grouping info
          setOriginalGroups(null);
        }
      } catch (err) {
        setEncodeError(err.message);
      }
    };
    reader.onerror = () => setEncodeError('Failed to read file');
    reader.readAsText(file);
  }, [recalculateStreams]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (activeTab === 'decoder') {
      handleDecodeFile(file);
    } else {
      handleEncodeFile(file, false);
    }
  }, [activeTab, handleDecodeFile, handleEncodeFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // ==================== ENCODER TABLE OPERATIONS ====================

  const addNewEntry = () => {
    const newEntry = {
      text: '',
      carriers: [],
      streams: 0,
      hasULCA: false,
      isEditing: true
    };
    setEncodeEntries(prev => [...prev, newEntry]);
  };

  const updateEntryText = (index, newText) => {
    setEncodeEntries(entries => entries.map((entry, i) => {
      if (i === index) {
        try {
          const carriers = parseComboString(newText);
          const dlKey = carriers.map(c => `${c.band}:${c.bclass}:${c.ant}`).join('|');
          return {
            ...entry,
            text: newText,
            carriers,
            dlKey,
            streams: calculateStreams(carriers),
            hasULCA: checkHasULCA(carriers),
            isEditing: false,
            error: null
          };
        } catch (e) {
          return { ...entry, text: newText, error: e.message, isEditing: false };
        }
      }
      return entry;
    }));
    // Editing combo text invalidates original structure
    // (UL class changes are OK, but band/class changes break DL grouping)
  };

  const updateEntryStreams = (index, newStreams) => {
    setEncodeEntries(entries => entries.map((entry, i) => {
      if (i === index) {
        return { ...entry, streams: parseInt(newStreams) || 0 };
      }
      return entry;
    }));
  };

  const updateEntryULCA = (index, hasULCA) => {
    setEncodeEntries(entries => entries.map((entry, i) => {
      if (i === index) {
        return { ...entry, hasULCA };
      }
      return entry;
    }));
  };

  const deleteEntry = (index) => {
    setEncodeEntries(entries => entries.filter((_, i) => i !== index));
  };

  const startEditing = (index) => {
    setEncodeEntries(entries => entries.map((e, i) => 
      i === index ? { ...e, isEditing: true } : e
    ));
  };

  const clearAllEntries = () => {
    setEncodeEntries([]);
    setOriginalGroups(null);
  };

  const recalculateAllStreams = () => {
    setEncodeEntries(entries => entries.map(entry => {
      if (entry.carriers && entry.carriers.length > 0) {
        return {
          ...entry,
          streams: calculateStreams(entry.carriers),
          hasULCA: checkHasULCA(entry.carriers)
        };
      }
      return entry;
    }));
  };

  // ==================== EXPORT FUNCTIONS ====================

  const handleDecodeExport = useCallback(() => {
    if (!decodeResults || decodeResults.combos.length === 0) return;
    
    try {
      const lines = [
        `Input file size: ${decodeResults.fileSize} bytes`,
        `Format verson: ${decodeResults.formatVersion}`,
        `Number of descriptors: ${decodeResults.numDescriptors}`,
        ''
      ];
      
      decodeResults.combos.forEach(c => {
        lines.push(`${c.text} ${c.streams}${c.hasULCA ? '*' : ' '}`);
      });
      
      lines.push('');
      lines.push(`Number of combos: ${decodeResults.numCombos}`);
      lines.push(`Max streams per combo: ${decodeResults.maxStreams}`);
      
      const text = lines.join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = '28874_decoded.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      setDecodeError('Export failed: ' + err.message);
    }
  }, [decodeResults]);

  const handleEncodeExport = useCallback(() => {
    try {
      const buffer = encodeToBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = '00028874';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      setEncodeError('Export failed: ' + err.message);
    }
  }, [encodeToBuffer]);

  const handleExportTxt = useCallback(() => {
    if (encodeEntries.length === 0) return;
    
    try {
      const lines = encodeEntries.map(e => 
        `${e.text} ${e.streams}${e.hasULCA ? '*' : ''}`
      );
      
      const text = lines.join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'combos.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      setEncodeError('Export failed: ' + err.message);
    }
  }, [encodeEntries]);

  const handleCopyToClipboard = useCallback(() => {
    if (!decodeResults || decodeResults.combos.length === 0) return;
    
    const lines = decodeResults.combos.map(c => 
      `${c.text} ${c.streams}${c.hasULCA ? '*' : ''}`
    );
    
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => alert('Copied to clipboard!'))
      .catch(err => setDecodeError('Copy failed: ' + err.message));
  }, [decodeResults]);

  const transferToEncoder = useCallback(() => {
    if (!decodeResults || decodeResults.combos.length === 0) return;
    
    console.log('transferToEncoder called');
    console.log('decodeResults.groups:', decodeResults.groups ? decodeResults.groups.length : 'undefined');
    
    // Store original groups for preserving structure
    if (decodeResults.groups && decodeResults.groups.length > 0) {
      console.log('Setting originalGroups with', decodeResults.groups.length, 'groups');
      setOriginalGroups(decodeResults.groups);
      setPreserveOriginalGrouping(true);
    } else {
      console.log('No groups found, setting originalGroups to null');
      setOriginalGroups(null);
      setPreserveOriginalGrouping(false);
    }
    
    // Enable auto-detect if file uses mixed formats
    const stats = decodeResults.descriptorStats;
    const has137 = stats[137] > 0 || stats[138] > 0;
    const has201 = stats[201] > 0 || stats[202] > 0;
    
    if (has137 && has201) {
      setAutoDescriptorType(true);
    } else if (has201) {
      setAutoDescriptorType(false);
      setDescriptorType(201);
    } else {
      setAutoDescriptorType(false);
      setDescriptorType(137);
    }
    
    // Set format version from original
    setFormatVersion(decodeResults.formatVersion);
    
    // Helper to normalize carriers to 6 elements
    const normalizeCarriersForKey = (carriers) => {
      const result = [];
      for (let i = 0; i < 6; i++) {
        if (i < carriers.length) {
          result.push(carriers[i]);
        } else {
          result.push({ band: 0, bclass: 0, ant: 0, ulclass: 0 });
        }
      }
      return result;
    };
    
    const entries = decodeResults.combos.map((combo) => {
      try {
        const carriers = parseComboString(combo.text);
        // Normalize to 6 elements to match originalGroups key format
        const normalized = normalizeCarriersForKey(carriers);
        const dlKey = normalized.map(c => `${c.band}:${c.bclass}:${c.ant}`).join('|');
        return {
          text: combo.text,
          carriers,
          dlKey,
          streams: recalculateStreams ? calculateStreams(carriers) : combo.streams,
          hasULCA: recalculateStreams ? checkHasULCA(carriers) : combo.hasULCA,
          descType: combo.descType,
          groupIdx: combo.groupIdx
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    
    setEncodeEntries(entries);
    setActiveTab('encoder');
  }, [decodeResults, recalculateStreams]);

  // ==================== RENDER ====================

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-2 text-blue-400">28874 Encoder/Decoder</h1>
        <p className="text-gray-400 text-sm mb-6">
          NV item 00028874 (LTE CA Band Combinations)
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('decoder')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'decoder'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📥 Decoder
          </button>
          <button
            onClick={() => setActiveTab('encoder')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'encoder'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📤 Encoder
          </button>
        </div>

        {/* File Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-blue-400 bg-blue-900/20'
              : 'border-gray-600 hover:border-gray-500'
          }`}
        >
          <input
            type="file"
            id="fileInput"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (activeTab === 'decoder') {
                handleDecodeFile(file);
              } else {
                handleEncodeFile(file, false);
              }
              e.target.value = '';
            }}
          />
          <label htmlFor="fileInput" className="cursor-pointer">
            <div className="text-4xl mb-3">📁</div>
            <p className="text-gray-300">Drop file here or click to select</p>
            <p className="text-gray-500 text-sm mt-1">
              {activeTab === 'decoder' ? 'Binary NV item file' : 'Text file with combo list (replaces current)'}
            </p>
          </label>
        </div>

        {/* Encoder: Add file button */}
        {activeTab === 'encoder' && encodeEntries.length > 0 && (
          <div className="mt-2 flex gap-2">
            <input
              type="file"
              id="appendFileInput"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                handleEncodeFile(file, true);
                e.target.value = '';
              }}
            />
            <label 
              htmlFor="appendFileInput" 
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded cursor-pointer text-sm"
            >
              ➕ Add from file
            </label>
          </div>
        )}

        {/* ==================== DECODER TAB ==================== */}
        {activeTab === 'decoder' && (
          <>
            {decodeError && (
              <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300">
                {decodeError}
              </div>
            )}

            {decodeResults && (
              <div className="mt-6 space-y-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-3 text-blue-300">File Information</h2>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-400">File size:</div>
                    <div>{decodeResults.fileSize} bytes</div>
                    <div className="text-gray-400">Format version:</div>
                    <div>{decodeResults.formatVersion}</div>
                    <div className="text-gray-400">Number of descriptors:</div>
                    <div>{decodeResults.numDescriptors}</div>
                    <div className="text-gray-400">Number of combos:</div>
                    <div className="text-green-400 font-semibold">{decodeResults.numCombos}</div>
                    <div className="text-gray-400">Max streams per combo:</div>
                    <div className="text-yellow-400 font-semibold">{decodeResults.maxStreams}</div>
                    <div className="text-gray-400">DL groups:</div>
                    <div>{decodeResults.groups?.length || 0}</div>
                  </div>
                  
                  {/* Descriptor statistics */}
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-gray-400 text-sm mb-2">Descriptor types:</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {decodeResults.descriptorStats[137] > 0 && (
                        <span className="px-2 py-1 bg-gray-700 rounded">137: {decodeResults.descriptorStats[137]}</span>
                      )}
                      {decodeResults.descriptorStats[138] > 0 && (
                        <span className="px-2 py-1 bg-gray-700 rounded">138: {decodeResults.descriptorStats[138]}</span>
                      )}
                      {decodeResults.descriptorStats[201] > 0 && (
                        <span className="px-2 py-1 bg-blue-700 rounded">201: {decodeResults.descriptorStats[201]}</span>
                      )}
                      {decodeResults.descriptorStats[202] > 0 && (
                        <span className="px-2 py-1 bg-blue-700 rounded">202: {decodeResults.descriptorStats[202]}</span>
                      )}
                      {decodeResults.descriptorStats[333] > 0 && (
                        <span className="px-2 py-1 bg-purple-700 rounded">333: {decodeResults.descriptorStats[333]}</span>
                      )}
                      {decodeResults.descriptorStats[334] > 0 && (
                        <span className="px-2 py-1 bg-purple-700 rounded">334: {decodeResults.descriptorStats[334]}</span>
                      )}
                    </div>
                  </div>
                </div>

                {decodeResults.errors.length > 0 && (
                  <div className="bg-red-900/30 border border-red-800 rounded-lg p-4">
                    <h2 className="text-lg font-semibold mb-2 text-red-400">Errors</h2>
                    {decodeResults.errors.map((err, i) => (
                      <div key={i} className="text-red-300 text-sm">{err}</div>
                    ))}
                  </div>
                )}

                {decodeResults.combos.length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h2 className="text-lg font-semibold mb-3 text-blue-300">
                      Band Combinations ({decodeResults.combos.length})
                    </h2>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-800">
                          <tr className="text-left text-gray-400 border-b border-gray-700">
                            <th className="pb-2 pr-4 w-12">#</th>
                            <th className="pb-2 pr-4">Combination</th>
                            <th className="pb-2 pr-4 w-20">Streams</th>
                            <th className="pb-2 pr-4 w-16">UL CA</th>
                            <th className="pb-2 w-16">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {decodeResults.combos.map((combo, i) => (
                            <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                              <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                              <td className="py-2 pr-4 font-mono text-green-300">{combo.text}</td>
                              <td className="py-2 pr-4 text-yellow-300">{combo.streams}</td>
                              <td className="py-2 pr-4">
                                {combo.hasULCA && <span className="text-blue-400">*</span>}
                              </td>
                              <td className="py-2 text-gray-500 text-xs">{combo.descType}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {decodeResults.combos.length > 0 && (
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={handleDecodeExport}
                      className="flex-1 min-w-32 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
                    >
                      💾 Export TXT
                    </button>
                    <button
                      onClick={handleCopyToClipboard}
                      className="flex-1 min-w-32 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                    >
                      📋 Copy
                    </button>
                    <button
                      onClick={transferToEncoder}
                      className="flex-1 min-w-32 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
                    >
                      ➡️ To Encoder
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ==================== ENCODER TAB ==================== */}
        {activeTab === 'encoder' && (
          <>
            {encodeError && (
              <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300">
                {encodeError}
              </div>
            )}

            <div className="mt-6 space-y-4">
              {/* Encoder Settings */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-3 text-green-300">Settings</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Format Version</label>
                    <input
                      type="number"
                      value={formatVersion}
                      onChange={(e) => setFormatVersion(parseInt(e.target.value) || 7)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Descriptor Type</label>
                    <select
                      value={descriptorType}
                      onChange={(e) => setDescriptorType(parseInt(e.target.value))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value={137}>137/138 (No MIMO, compact)</option>
                      <option value={201}>201/202 (1-byte MIMO)</option>
                      <option value={333}>333/334 (8-byte MIMO)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recalculateStreams}
                      onChange={(e) => setRecalculateStreams(e.target.checked)}
                      className="w-4 h-4 accent-green-500"
                    />
                    <span className="text-gray-300">Recalculate Streams & UL CA from combo string</span>
                    <span className="text-gray-500 text-xs">(otherwise take from file)</span>
                  </label>
                  
                  <label className={`flex items-center gap-3 ${originalGroups ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={preserveOriginalGrouping}
                      onChange={(e) => setPreserveOriginalGrouping(e.target.checked)}
                      disabled={!originalGroups}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <span className={originalGroups ? 'text-orange-300 font-medium' : 'text-gray-400'}>
                      Preserve original file structure
                    </span>
                    <span className="text-gray-500 text-xs">
                      {originalGroups ? `(${originalGroups.length} groups)` : '(no source data)'}
                    </span>
                  </label>
                  
                  {!preserveOriginalGrouping && (
                    <>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={optimizeGrouping}
                          onChange={(e) => setOptimizeGrouping(e.target.checked)}
                          className="w-4 h-4 accent-green-500"
                        />
                        <span className="text-gray-300">Optimize grouping</span>
                        <span className="text-gray-500 text-xs">(group combos with same DL, smaller file)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoDescriptorType}
                          onChange={(e) => setAutoDescriptorType(e.target.checked)}
                          className="w-4 h-4 accent-green-500"
                        />
                        <span className="text-gray-300">Auto-detect descriptor type</span>
                        <span className="text-gray-500 text-xs">(137/138 for MIMO=2, 201/202 otherwise)</span>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Entries Table */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold text-green-300">
                    Combinations ({encodeEntries.length})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={addNewEntry}
                      className="px-4 py-1 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition-colors"
                    >
                      + Add
                    </button>
                    {encodeEntries.length > 0 && (
                      <>
                        <button
                          onClick={recalculateAllStreams}
                          className="px-4 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium transition-colors"
                          title="Recalculate Streams & UL CA for all entries"
                        >
                          🔄 Recalc
                        </button>
                        <button
                          onClick={clearAllEntries}
                          className="px-4 py-1 bg-red-700 hover:bg-red-600 rounded text-sm font-medium transition-colors"
                        >
                          Clear All
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {encodeEntries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No combinations yet.</p>
                    <p className="text-sm mt-1">Load a file or add entries manually.</p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-800">
                        <tr className="text-left text-gray-400 border-b border-gray-700">
                          <th className="pb-2 pr-2 w-12">#</th>
                          <th className="pb-2 pr-2">Combination</th>
                          <th className="pb-2 pr-2 w-20">Streams</th>
                          <th className="pb-2 pr-2 w-16">UL CA</th>
                          <th className="pb-2 w-20">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {encodeEntries.map((entry, index) => (
                          <tr key={index} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td className="py-2 pr-2 text-gray-500">{index + 1}</td>
                            <td className="py-2 pr-2">
                              {entry.isEditing ? (
                                <input
                                  type="text"
                                  defaultValue={entry.text}
                                  autoFocus
                                  onBlur={(e) => updateEntryText(index, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      updateEntryText(index, e.target.value);
                                    }
                                  }}
                                  className="w-full bg-gray-700 border border-gray-500 rounded px-2 py-1 font-mono text-green-300"
                                  placeholder="e.g. 2A2A-4A2-5B2"
                                />
                              ) : (
                                <span 
                                  className={`font-mono cursor-pointer ${entry.error ? 'text-red-400' : 'text-green-300'}`}
                                  title={entry.error || 'Click to edit'}
                                  onClick={() => startEditing(index)}
                                >
                                  {entry.text || '(empty)'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                value={entry.streams}
                                onChange={(e) => updateEntryStreams(index, e.target.value)}
                                className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-yellow-300 text-center"
                              />
                            </td>
                            <td className="py-2 pr-2 text-center">
                              <input
                                type="checkbox"
                                checked={entry.hasULCA}
                                onChange={(e) => updateEntryULCA(index, e.target.checked)}
                                className="w-4 h-4 accent-blue-500"
                              />
                            </td>
                            <td className="py-2">
                              <button
                                onClick={() => deleteEntry(index)}
                                className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Export Buttons */}
              {encodeEntries.length > 0 && (
                <div className="space-y-3">
                  {preserveOriginalGrouping && originalGroups && (
                    <div className="p-3 bg-orange-900/30 border border-orange-700 rounded-lg text-orange-300 text-sm">
                      ℹ️ Using original grouping logic ({originalGroups.length} groups from source file)
                    </div>
                  )}
                  {preserveOriginalGrouping && !originalGroups && (
                    <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-300 text-sm">
                      ⚠️ No original grouping data available (loaded from text file). Using auto-detect mode.
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={handleEncodeExport}
                      className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors text-lg"
                    >
                      📦 Export Binary (00028874)
                    </button>
                    <button
                      onClick={handleExportTxt}
                      className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                    >
                      💾 Export TXT
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <footer className="mt-8 text-center text-gray-500 text-xs">
          Original C code © 2019 VVE, Edits © 2019 Andrea Mennillo
        </footer>
      </div>
    </div>
  );
}
