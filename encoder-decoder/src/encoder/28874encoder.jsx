// ==================== ENCODER LOGIC ====================

import pako from 'pako';
import {
  classToCC,
  classLetterToNum,
  classNumToLetter,
  calculateStreams as sharedCalculateStreams,
  hasULCA as sharedHasULCA,
  getULCarriers,
  getDLKey,
  sortCarriersByBand,
  validateCombo,
  DEFAULT_LIMITS
} from '../shared/index.js';

// ==================== COMPRESSION ====================

/**
 * Compress buffer using zlib
 */
export const compressZlib = (arrayBuffer) => {
  try {
    const uncompressed = new Uint8Array(arrayBuffer);
    const compressed = pako.deflate(uncompressed);
    return compressed.buffer;
  } catch (e) {
    throw new Error(`Zlib compression failed: ${e.message}`);
  }
};

// ==================== PARSING ====================

/**
 * Parse a combo string into carriers array
 * Format: BAND + CLASS + [MIMO] + [ULCLASS]
 * Example: "3A4A-7B2-20A2C"
 */
export const parseComboString = (comboStr) => {
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

// ==================== STREAMS CALCULATION ====================

/**
 * Calculate streams using unified formula: sum(CC_count * MIMO)
 * CC_count: A=1, B=2, C=3, D=4, E=5, F=6
 *
 * This is the CORRECT formula. The old formula (bclass-1)*ant was WRONG.
 */
export const calculateStreams = (carriers) => {
  if (!carriers || carriers.length === 0) return 0;

  let total = 0;
  for (const c of carriers) {
    const ccCount = classToCC(c.bclass);
    const mimo = c.ant || 2;
    total += ccCount * mimo;
  }
  return total;
};

// ==================== UL CA DETECTION ====================

/**
 * Check if carriers have UL CA
 * UL CA exists when more than one carrier has UL configured
 *
 * FIXED: The old logic "ulCount > 1 || ulclass > 2" was incorrect.
 * UL CA simply means multiple UL carriers.
 */
export const checkHasULCA = (carriers) => {
  if (!carriers || carriers.length === 0) return false;

  const ulCount = carriers.filter(c => c.ulclass > 0).length;
  return ulCount > 1;
};

// ==================== FILE PARSING ====================

/**
 * Parse combo text file into entries
 */
export const parseComboFile = (text, shouldRecalculate) => {
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
        const dlKey = getDLKey(carriers);

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

// ==================== FORMAT DETECTION ====================

/**
 * Determine if a combo needs extended format (201/202)
 * Extended format is needed when MIMO != 2
 */
export const needsExtendedFormat = (carriers) => {
  return carriers.some(c => c.ant !== 2 && c.ant !== 0);
};

/**
 * Determine if a combo needs full format (333/334)
 * Full format is needed for MIMO > 4 or special cases
 */
export const needsFullFormat = (carriers) => {
  return carriers.some(c => c.ant > 4);
};

/**
 * Determine the minimum required format for carriers
 * Returns: 137, 201, or 333
 */
export const determineMinimumFormat = (carriers) => {
  if (needsFullFormat(carriers)) return 333;
  if (needsExtendedFormat(carriers)) return 201;
  return 137;
};

// ==================== VALIDATION ====================

/**
 * Validate carriers before encoding
 * Returns { valid, errors, warnings }
 */
export const validateForEncoding = (carriers, options = {}) => {
  const {
    maxCC = 6,
    maxDLCC = DEFAULT_LIMITS.maxDLCC,
    maxULSCell = DEFAULT_LIMITS.maxULSCell,
    maxTotalUL = DEFAULT_LIMITS.maxTotalUL
  } = options;

  const result = validateCombo(carriers, { maxCC, maxDLCC, maxULSCell, maxTotalUL });

  // Additional encoding-specific checks
  const totalCC = carriers.reduce((sum, c) => sum + classToCC(c.bclass), 0);
  if (totalCC > 6) {
    result.errors.push({
      code: 'EXCEED_NV_LIMIT',
      message: `Total CC count (${totalCC}) exceeds NV format limit of 6`,
      severity: 'error'
    });
    result.valid = false;
  }

  return result;
};

// ==================== NORMALIZATION ====================

/**
 * Normalize carriers to canonical order (sorted by band)
 * This ensures deterministic output
 */
export const normalizeCarriers = (carriers) => {
  if (!carriers || carriers.length === 0) return [];

  // Sort by band number, then by class
  return [...carriers].sort((a, b) => {
    if (a.band !== b.band) return a.band - b.band;
    return a.bclass - b.bclass;
  });
};

/**
 * Pad carriers array to 6 elements
 */
export const padCarriers = (carriers) => {
  const result = [];
  for (let i = 0; i < 6; i++) {
    result.push(carriers[i] || { band: 0, bclass: 0, ant: 0, ulclass: 0 });
  }
  return result;
};

// ==================== ENCODING WITH ORIGINAL GROUPING ====================

/**
 * Encode using original grouping logic from decoded file
 */
export const encodeWithOriginalGrouping = ({ encodeEntries, formatVersion, originalGroups }) => {
  if (!originalGroups || originalGroups.length === 0) {
    throw new Error('No original grouping data available');
  }

  console.log('encodeWithOriginalGrouping called');
  console.log('originalGroups count:', originalGroups.length);
  console.log('encodeEntries count:', encodeEntries.length);

  const encodingGroups = [];
  const usedEntries = new Set();

  // Build DL key for comparison
  const getDLKeyFromCarriers = (carriers) => {
    const padded = padCarriers(carriers);
    return padded.map(c => `${c.band}:${c.bclass}:${c.ant}`).join('|');
  };

  const getGroupDLKey = (group) => {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      parts.push(`${group.band[i] || 0}:${group.bclass[i] || 0}:${group.ant[i] || 0}`);
    }
    return parts.join('|');
  };

  // First pass: match entries to groups by groupIdx
  for (let groupIdx = 0; groupIdx < originalGroups.length; groupIdx++) {
    const group = originalGroups[groupIdx];
    const matchingEntries = [];

    for (let i = 0; i < encodeEntries.length; i++) {
      if (usedEntries.has(i)) continue;
      const entry = encodeEntries[i];

      if (entry.groupIdx === groupIdx) {
        matchingEntries.push(entry);
        usedEntries.add(i);
      }
    }

    if (matchingEntries.length > 0) {
      encodingGroups.push({
        descType: group.descType,
        band: [...group.band],
        bclass: [...group.bclass],
        ant: [...group.ant],
        entries: matchingEntries
      });
    }
  }

  console.log('After groupIdx matching:', encodingGroups.length, 'groups,', usedEntries.size, 'entries used');

  // Second pass: match remaining entries by DL key
  if (usedEntries.size < encodeEntries.length) {
    const remainingByDL = new Map();

    for (let i = 0; i < encodeEntries.length; i++) {
      if (usedEntries.has(i)) continue;
      const entry = encodeEntries[i];
      if (!entry.carriers || entry.carriers.length === 0) continue;

      const dlKey = getDLKeyFromCarriers(entry.carriers);
      if (!remainingByDL.has(dlKey)) {
        remainingByDL.set(dlKey, []);
      }
      remainingByDL.get(dlKey).push({ entry, index: i });
    }

    for (const [dlKey, entriesForKey] of remainingByDL) {
      let matched = false;

      for (const group of encodingGroups) {
        const groupDLKey = getGroupDLKey({ band: group.band, bclass: group.bclass, ant: group.ant });
        if (groupDLKey === dlKey) {
          for (const { entry, index } of entriesForKey) {
            group.entries.push(entry);
            usedEntries.add(index);
          }
          matched = true;
          break;
        }
      }

      if (!matched) {
        const firstEntry = entriesForKey[0].entry;
        const padded = padCarriers(firstEntry.carriers);
        const needsExt = padded.some(c => c.ant !== 2 && c.ant !== 0 && c.band !== 0);

        encodingGroups.push({
          descType: needsExt ? 201 : 137,
          band: padded.map(c => c.band),
          bclass: padded.map(c => c.bclass),
          ant: padded.map(c => c.ant),
          entries: entriesForKey.map(e => e.entry)
        });

        entriesForKey.forEach(e => usedEntries.add(e.index));
      }
    }
  }

  console.log('Final encodingGroups count:', encodingGroups.length);
  console.log('Total entries used:', usedEntries.size);

  // Sort groups for deterministic output
  encodingGroups.sort((a, b) => {
    const keyA = a.band.join(':');
    const keyB = b.band.join(':');
    return keyA.localeCompare(keyB);
  });

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
      writeUint16(137);
      for (let i = 0; i < 6; i++) {
        writeUint16(group.band[i] || 0);
        writeUint8(group.bclass[i] || 0);
      }

      // Sort entries for deterministic output
      const sortedEntries = [...group.entries].sort((a, b) => {
        const keyA = a.text || '';
        const keyB = b.text || '';
        return keyA.localeCompare(keyB);
      });

      for (const entry of sortedEntries) {
        const carriers = padCarriers(entry.carriers);
        const ulCarriers = carriers.filter(c => c.ulclass > 0).slice(0, DEFAULT_LIMITS.maxTotalUL);

        // Warn if UL carriers are being truncated
        const allUL = carriers.filter(c => c.ulclass > 0);
        if (allUL.length > DEFAULT_LIMITS.maxTotalUL) {
          console.warn(`Entry "${entry.text}" has ${allUL.length} UL carriers, truncating to ${DEFAULT_LIMITS.maxTotalUL}`);
        }

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
      writeUint16(201);
      for (let i = 0; i < 6; i++) {
        writeUint16(group.band[i] || 0);
        writeUint8(group.bclass[i] || 0);
        writeUint8(group.ant[i] || 0);
      }

      const sortedEntries = [...group.entries].sort((a, b) => {
        const keyA = a.text || '';
        const keyB = b.text || '';
        return keyA.localeCompare(keyB);
      });

      for (const entry of sortedEntries) {
        const carriers = padCarriers(entry.carriers);
        const ulCarriers = carriers.filter(c => c.ulclass > 0).slice(0, DEFAULT_LIMITS.maxTotalUL);

        const allUL = carriers.filter(c => c.ulclass > 0);
        if (allUL.length > DEFAULT_LIMITS.maxTotalUL) {
          console.warn(`Entry "${entry.text}" has ${allUL.length} UL carriers, truncating to ${DEFAULT_LIMITS.maxTotalUL}`);
        }

        writeUint16(202);

        if (ulCarriers.length > 0) {
          writeUint16(ulCarriers[0].band);
          writeUint8(ulCarriers[0].ulclass);
          writeUint8(2); // UL MIMO - typically 2 for UL
        } else {
          writeUint16(0);
          writeUint8(0);
          writeUint8(0);
        }

        if (ulCarriers.length > 1) {
          writeUint16(ulCarriers[1].band);
          writeUint8(ulCarriers[1].ulclass);
          writeUint8(2);
        } else {
          writeUint16(0);
          writeUint8(0);
          writeUint8(0);
        }

        writeZeros(16);
      }
    } else if (group.descType === 333) {
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

      const sortedEntries = [...group.entries].sort((a, b) => {
        const keyA = a.text || '';
        const keyB = b.text || '';
        return keyA.localeCompare(keyB);
      });

      for (const entry of sortedEntries) {
        const carriers = padCarriers(entry.carriers);
        const ulCarriers = carriers.filter(c => c.ulclass > 0).slice(0, DEFAULT_LIMITS.maxTotalUL);

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
};

// ==================== MAIN ENCODING FUNCTION ====================

/**
 * Encode entries to binary buffer with grouping optimization and mixed formats
 */
export const encodeToBuffer = ({
  encodeEntries,
  formatVersion,
  descriptorType,
  optimizeGrouping,
  autoDescriptorType,
  preserveOriginalGrouping,
  originalGroups
}) => {
  if (encodeEntries.length === 0) {
    throw new Error('No entries to encode');
  }

  console.log('encodeToBuffer called');
  console.log('preserveOriginalGrouping:', preserveOriginalGrouping);
  console.log('originalGroups:', originalGroups ? originalGroups.length : 'null');

  // Use original grouping if enabled and available
  if (preserveOriginalGrouping && originalGroups && originalGroups.length > 0) {
    console.log('Using encodeWithOriginalGrouping');
    return encodeWithOriginalGrouping({ encodeEntries, formatVersion, originalGroups });
  }

  console.log('Using auto-detect mode');

  // Validate all entries before encoding
  for (const entry of encodeEntries) {
    if (!entry.carriers || entry.carriers.length === 0) continue;
    const validation = validateForEncoding(entry.carriers);
    if (!validation.valid) {
      console.warn(`Validation warnings for "${entry.text}":`, validation.errors);
    }
  }

  // Separate entries by format type if auto-detect is enabled
  let entries137 = [];
  let entries201 = [];
  let entries333 = [];

  for (const entry of encodeEntries) {
    if (!entry.carriers || entry.carriers.length === 0) continue;

    const minFormat = autoDescriptorType
      ? determineMinimumFormat(entry.carriers)
      : descriptorType;

    if (minFormat === 333) {
      entries333.push(entry);
    } else if (minFormat === 201 || (autoDescriptorType && needsExtendedFormat(entry.carriers))) {
      entries201.push(entry);
    } else {
      entries137.push(entry);
    }
  }

  // If not auto-detect, use specified format
  if (!autoDescriptorType) {
    if (descriptorType === 137) {
      entries137 = [...encodeEntries];
      entries201 = [];
      entries333 = [];
    } else if (descriptorType === 333) {
      entries333 = [...encodeEntries];
      entries137 = [];
      entries201 = [];
    } else {
      entries201 = [...encodeEntries];
      entries137 = [];
      entries333 = [];
    }
  }

  // Group entries by DL key (with canonical ordering)
  const groupByDL = (entries) => {
    if (!optimizeGrouping) {
      return entries.map(e => [e]);
    }

    const groupMap = new Map();
    for (const entry of entries) {
      if (!entry.carriers || entry.carriers.length === 0) continue;

      // Normalize carriers for canonical key
      const normalized = normalizeCarriers(entry.carriers);
      const dlKey = getDLKey(normalized);

      if (!groupMap.has(dlKey)) {
        groupMap.set(dlKey, []);
      }
      groupMap.get(dlKey).push(entry);
    }

    // Sort groups by key for deterministic output
    const sortedKeys = Array.from(groupMap.keys()).sort();
    return sortedKeys.map(key => groupMap.get(key));
  };

  const groups137 = groupByDL(entries137);
  const groups201 = groupByDL(entries201);
  const groups333 = groupByDL(entries333);

  // Calculate buffer size
  let totalSize = 4; // Header
  let numDescriptors = 0;

  for (const group of groups137) {
    totalSize += 20; // One 137 descriptor
    totalSize += group.length * 20; // 138 descriptors
    numDescriptors += 1 + group.length;
  }

  for (const group of groups201) {
    totalSize += 26; // One 201 descriptor
    totalSize += group.length * 26; // 202 descriptors
    numDescriptors += 1 + group.length;
  }

  for (const group of groups333) {
    totalSize += 68; // One 333 descriptor
    totalSize += group.length * 68; // 334 descriptors
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

  // Write 137/138 groups
  for (const group of groups137) {
    const firstEntry = group[0];
    const carriers = padCarriers(normalizeCarriers(firstEntry.carriers));

    writeUint16(137);
    for (let i = 0; i < 6; i++) {
      writeUint16(carriers[i].band);
      writeUint8(carriers[i].bclass);
    }

    // Sort entries for deterministic output
    const sortedEntries = [...group].sort((a, b) => (a.text || '').localeCompare(b.text || ''));

    for (const entry of sortedEntries) {
      const entryCarriers = padCarriers(entry.carriers);
      const ulCarriers = entryCarriers.filter(c => c.ulclass > 0).slice(0, DEFAULT_LIMITS.maxTotalUL);

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
    const carriers = padCarriers(normalizeCarriers(firstEntry.carriers));

    writeUint16(201);
    for (let i = 0; i < 6; i++) {
      writeUint16(carriers[i].band);
      writeUint8(carriers[i].bclass);
      writeUint8(carriers[i].ant);
    }

    const sortedEntries = [...group].sort((a, b) => (a.text || '').localeCompare(b.text || ''));

    for (const entry of sortedEntries) {
      const entryCarriers = padCarriers(entry.carriers);
      const ulCarriers = entryCarriers.filter(c => c.ulclass > 0).slice(0, DEFAULT_LIMITS.maxTotalUL);

      writeUint16(202);

      if (ulCarriers.length > 0) {
        writeUint16(ulCarriers[0].band);
        writeUint8(ulCarriers[0].ulclass);
        writeUint8(2); // UL MIMO
      } else {
        writeUint16(0);
        writeUint8(0);
        writeUint8(0);
      }

      if (ulCarriers.length > 1) {
        writeUint16(ulCarriers[1].band);
        writeUint8(ulCarriers[1].ulclass);
        writeUint8(2); // UL MIMO
      } else {
        writeUint16(0);
        writeUint8(0);
        writeUint8(0);
      }

      writeZeros(16);
    }
  }

  // Write 333/334 groups
  for (const group of groups333) {
    const firstEntry = group[0];
    const carriers = padCarriers(normalizeCarriers(firstEntry.carriers));

    writeUint16(333);
    for (let i = 0; i < 6; i++) {
      writeUint16(carriers[i].band);
      writeUint8(carriers[i].bclass);

      const antStr = (carriers[i].ant || 0).toString();
      for (let j = 0; j < 8; j++) {
        if (j < antStr.length) {
          writeUint8(parseInt(antStr[j], 10));
        } else {
          writeUint8(0);
        }
      }
    }

    const sortedEntries = [...group].sort((a, b) => (a.text || '').localeCompare(b.text || ''));

    for (const entry of sortedEntries) {
      const entryCarriers = padCarriers(entry.carriers);
      const ulCarriers = entryCarriers.filter(c => c.ulclass > 0).slice(0, DEFAULT_LIMITS.maxTotalUL);

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

  return buffer;
};
