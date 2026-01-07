import { useCallback } from 'react';
import { calculateStreams, checkHasULCA, parseComboFile, parseComboString, compressZlib } from '../encoder/28874encoder';

// ==================== FILE HANDLERS ====================

export const useFileHandlers = ({
  activeTab,
  decodeFile,
  recalculateStreams,
  setDecodeError,
  setDecodeResults,
  setEncodeEntries,
  setEncodeError,
  setIsDragging,
  setOriginalGroups
}) => {
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
  }, [decodeFile, setDecodeError, setDecodeResults]);

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
  }, [recalculateStreams, setEncodeEntries, setEncodeError, setOriginalGroups]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (activeTab === 'decoder') {
      handleDecodeFile(file);
    } else {
      handleEncodeFile(file, false);
    }
  }, [activeTab, handleDecodeFile, handleEncodeFile, setIsDragging]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, [setIsDragging]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, [setIsDragging]);

  return {
    handleDecodeFile,
    handleEncodeFile,
    handleDrop,
    handleDragOver,
    handleDragLeave
  };
};

// ==================== ENCODER TABLE OPERATIONS ====================

export const useEncoderTableHandlers = ({
  setEncodeEntries,
  setOriginalGroups
}) => {
  const addNewEntry = useCallback(() => {
    const newEntry = {
      text: '',
      carriers: [],
      streams: 0,
      hasULCA: false,
      isEditing: true
    };
    setEncodeEntries(prev => [...prev, newEntry]);
  }, [setEncodeEntries]);

  const updateEntryText = useCallback((index, newText) => {
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
  }, [setEncodeEntries]);

  const updateEntryStreams = useCallback((index, newStreams) => {
    setEncodeEntries(entries => entries.map((entry, i) => {
      if (i === index) {
        return { ...entry, streams: parseInt(newStreams) || 0 };
      }
      return entry;
    }));
  }, [setEncodeEntries]);

  const updateEntryULCA = useCallback((index, hasULCA) => {
    setEncodeEntries(entries => entries.map((entry, i) => {
      if (i === index) {
        return { ...entry, hasULCA };
      }
      return entry;
    }));
  }, [setEncodeEntries]);

  const deleteEntry = useCallback((index) => {
    setEncodeEntries(entries => entries.filter((_, i) => i !== index));
  }, [setEncodeEntries]);

  const startEditing = useCallback((index) => {
    setEncodeEntries(entries => entries.map((e, i) =>
      i === index ? { ...e, isEditing: true } : e
    ));
  }, [setEncodeEntries]);

  const clearAllEntries = useCallback(() => {
    setEncodeEntries([]);
    setOriginalGroups(null);
  }, [setEncodeEntries, setOriginalGroups]);

  const recalculateAllStreams = useCallback(() => {
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
  }, [setEncodeEntries]);

  return {
    addNewEntry,
    updateEntryText,
    updateEntryStreams,
    updateEntryULCA,
    deleteEntry,
    startEditing,
    clearAllEntries,
    recalculateAllStreams
  };
};

// ==================== EXPORT FUNCTIONS ====================

export const useExportHandlers = ({
  decodeResults,
  encodeEntries,
  encodeToBuffer,
  recalculateStreams,
  setActiveTab,
  setAutoDescriptorType,
  setDecodeError,
  setDescriptorType,
  setEncodeEntries,
  setEncodeError,
  setFormatVersion,
  setOriginalGroups,
  setPreserveOriginalGrouping,
  useCompression
}) => {
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
  }, [decodeResults, setDecodeError]);

  const handleEncodeExport = useCallback(() => {
    try {
      let buffer = encodeToBuffer();

      // Apply compression if enabled
      if (useCompression) {
        const originalSize = buffer.byteLength;
        buffer = compressZlib(buffer);
        const compressedSize = buffer.byteLength;
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        console.log(`Compressed: ${originalSize} → ${compressedSize} bytes (-${ratio}%)`);
      }

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
  }, [encodeToBuffer, setEncodeError, useCompression]);

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
  }, [encodeEntries, setEncodeError]);

  const handleCopyToClipboard = useCallback(() => {
    if (!decodeResults || decodeResults.combos.length === 0) return;

    const lines = decodeResults.combos.map(c =>
      `${c.text} ${c.streams}${c.hasULCA ? '*' : ''}`
    );

    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => alert('Copied to clipboard!'))
      .catch(err => setDecodeError('Copy failed: ' + err.message));
  }, [decodeResults, setDecodeError]);

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
  }, [
    decodeResults,
    recalculateStreams,
    setActiveTab,
    setAutoDescriptorType,
    setDescriptorType,
    setEncodeEntries,
    setFormatVersion,
    setOriginalGroups,
    setPreserveOriginalGrouping
  ]);

  return {
    handleDecodeExport,
    handleEncodeExport,
    handleExportTxt,
    handleCopyToClipboard,
    transferToEncoder
  };
};
