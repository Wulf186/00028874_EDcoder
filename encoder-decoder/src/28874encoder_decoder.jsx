import React, { useState, useCallback } from 'react';
import { decodeFile } from './decoder/28874decoder';
import { encodeToBuffer } from './encoder/28874encoder';
import { useEncoderTableHandlers, useExportHandlers, useFileHandlers } from './utils/utils';
import ComboBuilder from './builder/ComboBuilder';

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
  const [useCompression, setUseCompression] = useState(false); // Compress with zlib
  
  const [isDragging, setIsDragging] = useState(false);
  const buildEncodeBuffer = useCallback(() => (
    encodeToBuffer({
      encodeEntries,
      formatVersion,
      descriptorType,
      optimizeGrouping,
      autoDescriptorType,
      preserveOriginalGrouping,
      originalGroups
    })
  ), [
    encodeEntries,
    formatVersion,
    descriptorType,
    optimizeGrouping,
    autoDescriptorType,
    preserveOriginalGrouping,
    originalGroups
  ]);

  const {
    handleDecodeFile,
    handleEncodeFile,
    handleDrop,
    handleDragOver,
    handleDragLeave
  } = useFileHandlers({
    activeTab,
    decodeFile,
    recalculateStreams,
    setDecodeError,
    setDecodeResults,
    setEncodeEntries,
    setEncodeError,
    setIsDragging,
    setOriginalGroups
  });

  const {
    addNewEntry,
    updateEntryText,
    updateEntryStreams,
    updateEntryULCA,
    deleteEntry,
    startEditing,
    clearAllEntries,
    recalculateAllStreams
  } = useEncoderTableHandlers({
    setEncodeEntries,
    setOriginalGroups
  });

  const {
    handleDecodeExport,
    handleEncodeExport,
    handleExportTxt,
    handleCopyToClipboard,
    transferToEncoder
  } = useExportHandlers({
    decodeResults,
    encodeEntries,
    encodeToBuffer: buildEncodeBuffer,
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
  });
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
          <button
            onClick={() => setActiveTab('builder')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'builder'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            🔧 Combo Builder
          </button>
        </div>

        {/* File Upload Area - only show for decoder and encoder tabs */}
        {activeTab !== 'builder' && (
          <>
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
          </>
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
                    {decodeResults.wasCompressed && (
                      <>
                        <div className="text-gray-400">Compression:</div>
                        <div className="text-green-400 font-semibold">
                          zlib ({decodeResults.originalSize} → {decodeResults.fileSize} bytes, -{decodeResults.compressionRatio}%)
                        </div>
                      </>
                    )}
                    <div className="text-gray-400">File size:</div>
                    <div>{decodeResults.fileSize} bytes {decodeResults.wasCompressed && <span className="text-xs text-gray-500">(decompressed)</span>}</div>
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

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCompression}
                      onChange={(e) => setUseCompression(e.target.checked)}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="text-blue-300 font-medium">Compress with zlib</span>
                    <span className="text-gray-500 text-xs">(reduce file size by ~50-70%)</span>
                  </label>
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

        {/* ==================== BUILDER TAB ==================== */}
        {activeTab === 'builder' && (
          <ComboBuilder
            onAddToEncoder={(combos) => {
              // Convert generated combos to encoder entry format
              const newEntries = combos.map(combo => {
                try {
                  const carriers = combo.bandConfigs.map(bc => ({
                    band: bc.band,
                    bclass: bc.bclass.charCodeAt(0) - 0x40,
                    ant: bc.mimo,
                    ulclass: bc.ulca ? 1 : 0
                  }));

                  const dlKey = carriers.map(c => `${c.band}:${c.bclass}:${c.ant}`).join('|');

                  return {
                    text: combo.text,
                    carriers,
                    streams: combo.streams,
                    hasULCA: combo.hasULCA,
                    dlKey,
                    descType: 201 // Default
                  };
                } catch (e) {
                  console.error('Error converting combo:', e);
                  return null;
                }
              }).filter(Boolean);

              // Add to encoder entries
              setEncodeEntries(prev => [...prev, ...newEntries]);

              // Clear original groups when adding from builder
              setOriginalGroups(null);

              // Switch to encoder tab to show results
              setActiveTab('encoder');

              // Show confirmation
              alert(`Added ${newEntries.length} combinations to encoder`);
            }}
          />
        )}

        <footer className="mt-8 text-center text-gray-500 text-xs">
          Original C code © 2019 VVE, Edits © 2019 Andrea Mennillo
        </footer>
      </div>
    </div>
  );
}

