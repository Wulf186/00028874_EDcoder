// ==================== ENCODER LOGIC ====================

import pako from 'pako';

// Compress buffer using zlib
export const compressZlib = (arrayBuffer) => {
  try {
    const uncompressed = new Uint8Array(arrayBuffer);
    const compressed = pako.deflate(uncompressed);
    return compressed.buffer;
  } catch (e) {
    throw new Error(`Zlib compression failed: ${e.message}`);
  }
};

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

export const calculateStreams = (carriers) => {
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

export const checkHasULCA = (carriers) => {
    const ulCount = carriers.filter(c => c.ulclass > 0).length;
    return ulCount > 1 || carriers.some(c => c.ulclass > 2);
  };

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
export const needsExtendedFormat = (carriers) => {
    return carriers.some(c => c.ant !== 2 && c.ant !== 0);
  };

  // Encode using original grouping logic from decoded file
export const encodeWithOriginalGrouping = ({ encodeEntries, formatVersion, originalGroups }) => {
    if (!originalGroups || originalGroups.length === 0) {
      throw new Error('No original grouping data available');
    }

    console.log('encodeWithOriginalGrouping called');
    console.log('originalGroups count:', originalGroups.length);
    console.log('encodeEntries count:', encodeEntries.length);

    // Normalize carriers array to 6 elements
    const normalizeCarriers = (carriers) => {
      const result = [];
      for (let i = 0; i < 6; i++) {
        result.push(carriers[i] || { band: 0, bclass: 0, ant: 0, ulclass: 0 });
      }
      return result;
    };

    // Build DL key for comparison
    const getDLKeyFromCarriers = (carriers) => {
      const norm = normalizeCarriers(carriers);
      return norm.map(c => `${c.band}:${c.bclass}:${c.ant}`).join('|');
    };

    const getGroupDLKey = (group) => {
      const parts = [];
      for (let i = 0; i < 6; i++) {
        parts.push(`${group.band[i] || 0}:${group.bclass[i] || 0}:${group.ant[i] || 0}`);
      }
      return parts.join('|');
    };

    // Strategy: Use groupIdx if available, otherwise fall back to DL key matching
    // This preserves the exact original structure including duplicate DL groups
    
    const encodingGroups = [];
    const usedEntries = new Set();

    // First pass: match entries to groups by groupIdx (preserves duplicates)
    for (let groupIdx = 0; groupIdx < originalGroups.length; groupIdx++) {
      const group = originalGroups[groupIdx];
      const matchingEntries = [];
      
      for (let i = 0; i < encodeEntries.length; i++) {
        if (usedEntries.has(i)) continue;
        const entry = encodeEntries[i];
        
        // Match by groupIdx if available
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

    // Second pass: match remaining entries by DL key (for new/edited entries)
    if (usedEntries.size < encodeEntries.length) {
      // Group remaining entries by DL key
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

      // Try to match to existing encoding groups by DL key
      for (const [dlKey, entriesForKey] of remainingByDL) {
        let matched = false;
        
        // Find an existing group with same DL key
        for (const group of encodingGroups) {
          const groupDLKey = getGroupDLKey({ band: group.band, bclass: group.bclass, ant: group.ant });
          if (groupDLKey === dlKey) {
            // Add to existing group
            for (const { entry, index } of entriesForKey) {
              group.entries.push(entry);
              usedEntries.add(index);
            }
            matched = true;
            break;
          }
        }
        
        // If no existing group, create a new one
        if (!matched) {
          const firstEntry = entriesForKey[0].entry;
          const normalized = normalizeCarriers(firstEntry.carriers);
          const needsExtended = normalized.some(c => c.ant !== 2 && c.ant !== 0 && c.band !== 0);
          
          encodingGroups.push({
            descType: needsExtended ? 201 : 137,
            band: normalized.map(c => c.band),
            bclass: normalized.map(c => c.bclass),
            ant: normalized.map(c => c.ant),
            entries: entriesForKey.map(e => e.entry)
          });
          
          entriesForKey.forEach(e => usedEntries.add(e.index));
        }
      }
    }

    console.log('Final encodingGroups count:', encodingGroups.length);
    console.log('Total entries used:', usedEntries.size);

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
            writeUint8(2);  // UL MIMO is always 2 in this format
          } else {
            writeUint16(0);
            writeUint8(0);
            writeUint8(0);
          }
          
          if (ulCarriers.length > 1) {
            writeUint16(ulCarriers[1].band);
            writeUint8(ulCarriers[1].ulclass);
            writeUint8(2);  // UL MIMO is always 2 in this format
          } else {
            writeUint16(0);
            writeUint8(0);
            writeUint8(0);
          }
          
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
  };

  // Encode with grouping optimization and mixed formats
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
  };
