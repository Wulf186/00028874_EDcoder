import React, { useState, useMemo, useCallback } from 'react';
import {
  classToCC,
  classLetterToNum,
  classNumToLetter,
  calculateStreams,
  hasULCA,
  getComboKey,
  sortCarriersByBand,
  validateCombo,
  getValidationSummary,
  DEVICE_PROFILES,
  DEFAULT_PROFILE,
  getBandDuplexMode,
  DUPLEX_MODE,
  getCommonBands,
  analyzeBandDuplexModes
} from '../shared/index.js';

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate all combinations of k items from array (not permutations)
 * This is "n choose k" - order doesn't matter
 */
const generateCombinations = (arr, k) => {
  const result = [];

  function combine(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }

  combine(0, []);
  return result;
};

/**
 * Generate all permutations of array
 */
const generateAllPermutations = (arr) => {
  if (arr.length <= 1) return [arr];

  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const perms = generateAllPermutations(remaining);
    for (const perm of perms) {
      result.push([current, ...perm]);
    }
  }
  return result;
};

/**
 * Calculate streams using unified formula: sum(CC_count * MIMO)
 */
const calculateStreamsFromConfigs = (configs) => {
  return configs.reduce((total, config) => {
    const ccCount = classToCC(config.bclass);
    return total + ccCount * config.mimo;
  }, 0);
};

/**
 * Build combo string from configs (without PCell marker in string)
 */
const buildComboString = (configs, includeUL = true) => {
  return configs.map(c => {
    let str = `${c.band}${c.bclass}${c.mimo}`;
    if (includeUL && c.ulca) {
      str += 'A'; // UL class A
    }
    return str;
  }).join('-');
};

/**
 * Convert configs to carriers for encoder
 */
const configsToCarriers = (configs) => {
  return configs.map(c => ({
    band: c.band,
    bclass: classLetterToNum(c.bclass),
    ant: c.mimo,
    ulclass: c.ulca ? 1 : 0, // UL class A = 1
    // New format fields
    dlClass: c.bclass,
    mimoDl: c.mimo,
    ulClass: c.ulca ? 'A' : null
  }));
};

// ==================== MAIN COMPONENT ====================

export default function ComboBuilder({ onAddToEncoder }) {
  // Band selection and configuration
  const [selectedBandConfigs, setSelectedBandConfigs] = useState([]);
  // Config for next band to add
  const [newBandConfig, setNewBandConfig] = useState({
    band: 3,
    bclass: 'A',
    mimo: 2,
    ulca: false
  });

  // Generation options
  const [generateAllLengths, setGenerateAllLengths] = useState(false);
  const [shouldGeneratePermutations, setShouldGeneratePermutations] = useState(false); // Off by default
  const [generatePCellVariants, setGeneratePCellVariants] = useState(true);

  // Results
  const [generatedCombos, setGeneratedCombos] = useState([]);

  // Device profile
  const [selectedProfile, setSelectedProfile] = useState('default');

  // Get current profile
  const currentProfile = useMemo(() => {
    if (selectedProfile === 'default') return DEFAULT_PROFILE;
    return DEVICE_PROFILES[selectedProfile] || DEFAULT_PROFILE;
  }, [selectedProfile]);

  // Common bands with duplex mode info
  const availableBands = useMemo(() => {
    const common = getCommonBands();
    return common.map(b => ({
      band: b.band,
      name: b.name,
      duplexMode: b.duplexMode
    }));
  }, []);

  const classOptions = ['A', 'B', 'C', 'D', 'E', 'F'];
  const mimoOptions = [2, 4];

  // Analyze selected bands for duplex mode mixing
  const bandAnalysis = useMemo(() => {
    const bands = selectedBandConfigs.map(c => c.band);
    return analyzeBandDuplexModes(bands);
  }, [selectedBandConfigs]);

  // Add a band configuration
  const addBandConfig = useCallback(() => {
    setSelectedBandConfigs(prev => [...prev, { ...newBandConfig, id: Date.now() }]);
  }, [newBandConfig]);

  // Remove a band configuration
  const removeBandConfig = useCallback((id) => {
    setSelectedBandConfigs(prev => prev.filter(c => c.id !== id));
  }, []);

  // Update a band configuration
  const updateBandConfig = useCallback((id, field, value) => {
    setSelectedBandConfigs(prev => prev.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    ));
  }, []);

  // Duplicate a band config (for intra-band non-contiguous)
  const duplicateBandConfig = useCallback((id) => {
    const config = selectedBandConfigs.find(c => c.id === id);
    if (config) {
      setSelectedBandConfigs(prev => [...prev, { ...config, id: Date.now(), bclass: 'A' }]);
    }
  }, [selectedBandConfigs]);

  // Generate combinations
  const generateCombinations_handler = useCallback(() => {
    if (selectedBandConfigs.length === 0) {
      alert('Please add at least one band configuration');
      return;
    }

    // For single band with class > A, it's intra-band CA
    if (selectedBandConfigs.length === 1) {
      const config = selectedBandConfigs[0];
      const ccCount = classToCC(config.bclass);
      if (ccCount === 1) {
        alert('Single band with Class A is not CA. Use Class B or higher for intra-band CA, or add more bands.');
        return;
      }
    }

    const combos = [];
    const seenKeys = new Set(); // For deduplication in unique mode

    // Determine which lengths to generate
    const minLength = 1;
    const maxLength = selectedBandConfigs.length;
    const lengths = generateAllLengths
      ? Array.from({ length: maxLength }, (_, i) => i + 1)
      : [maxLength];

    for (const length of lengths) {
      // Get all combinations (or permutations if enabled) of this length
      let configSets;

      if (length === selectedBandConfigs.length) {
        // Use all configs
        configSets = shouldGeneratePermutations
          ? generateAllPermutations(selectedBandConfigs)
          : [selectedBandConfigs];
      } else {
        // Get combinations of this length
        const indexCombinations = generateCombinations(
          selectedBandConfigs.map((_, i) => i),
          length
        );

        configSets = [];
        for (const indices of indexCombinations) {
          const configs = indices.map(i => selectedBandConfigs[i]);
          if (shouldGeneratePermutations) {
            const perms = generateAllPermutations(configs);
            configSets.push(...perms);
          } else {
            configSets.push(configs);
          }
        }
      }

      for (const configs of configSets) {
        // Check if single-band config has class A (not CA)
        if (configs.length === 1 && classToCC(configs[0].bclass) === 1) {
          continue; // Skip non-CA single band
        }

        // Normalize for canonical key (sort by band)
        const sortedConfigs = [...configs].sort((a, b) => a.band - b.band);
        const canonicalKey = sortedConfigs.map(c =>
          `${c.band}:${c.bclass}:${c.mimo}`
        ).join('|');

        // In unique mode, skip if we've seen this combo
        if (!shouldGeneratePermutations && seenKeys.has(canonicalKey)) {
          continue;
        }
        seenKeys.add(canonicalKey);

        // Generate PCell variants if enabled
        const pcellVariants = generatePCellVariants
          ? Array.from({ length: configs.length }, (_, i) => i)
          : [null]; // null = no PCell specified

        for (const pcellIdx of pcellVariants) {
          const carriers = configsToCarriers(configs);
          const streams = calculateStreamsFromConfigs(configs);
          const ulCarriers = configs.filter(c => c.ulca);

          // Build combo string
          const comboStr = buildComboString(configs);

          // Validate combo
          const validation = validateCombo(carriers, {
            maxDLCC: currentProfile.maxDLCC,
            maxULSCell: currentProfile.maxULSCell,
            maxTotalUL: currentProfile.maxTotalUL,
            pcellIndex: pcellIdx || 0
          });

          combos.push({
            text: comboStr,
            streams,
            hasULCA: ulCarriers.length > 1,
            bandConfigs: configs,
            carriers,
            pcellIndex: pcellIdx,
            validation,
            canonicalKey
          });
        }
      }
    }

    setGeneratedCombos(combos);
  }, [selectedBandConfigs, generateAllLengths, shouldGeneratePermutations, generatePCellVariants, currentProfile]);

  // Add generated combos to encoder
  const addToEncoder = useCallback(() => {
    if (generatedCombos.length === 0) {
      alert('No combinations generated yet');
      return;
    }

    // Filter out invalid combos (errors, not warnings)
    const validCombos = generatedCombos.filter(c => c.validation.valid);

    if (validCombos.length === 0) {
      alert('No valid combinations to add. Please fix validation errors.');
      return;
    }

    // Convert to encoder format
    const entries = validCombos.map(combo => {
      // Build combo string with PCell marker for display
      let displayText = combo.text;
      if (combo.pcellIndex !== null && combo.pcellIndex >= 0) {
        // Add PCell marker to the display string
        const parts = displayText.split('-');
        if (parts[combo.pcellIndex]) {
          parts[combo.pcellIndex] += 'A';
          displayText = parts.join('-');
        }
      }

      return {
        text: displayText,
        carriers: combo.carriers,
        streams: combo.streams,
        hasULCA: combo.hasULCA,
        pcellIndex: combo.pcellIndex
      };
    });

    onAddToEncoder(entries);
  }, [generatedCombos, onAddToEncoder]);

  // Statistics
  const comboStats = useMemo(() => {
    if (generatedCombos.length === 0) return null;

    const validCount = generatedCombos.filter(c => c.validation.valid).length;
    const warningCount = generatedCombos.filter(c => c.validation.warnings.length > 0).length;
    const errorCount = generatedCombos.filter(c => !c.validation.valid).length;
    const maxStreams = Math.max(...generatedCombos.map(c => c.streams), 0);
    const uniqueDL = new Set(generatedCombos.map(c => c.canonicalKey)).size;

    return {
      total: generatedCombos.length,
      valid: validCount,
      warnings: warningCount,
      errors: errorCount,
      maxStreams,
      uniqueDL
    };
  }, [generatedCombos]);

  // Get band display class based on duplex mode
  const getBandColorClass = (band) => {
    const mode = getBandDuplexMode(band);
    if (mode === DUPLEX_MODE.TDD) return 'bg-orange-600 hover:bg-orange-500';
    if (mode === DUPLEX_MODE.SDL) return 'bg-yellow-600 hover:bg-yellow-500';
    return 'bg-purple-600 hover:bg-purple-500'; // FDD
  };

  return (
    <div className="space-y-6">
      {/* Device Profile Selection */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3 text-purple-300">Device Profile</h2>
        <select
          value={selectedProfile}
          onChange={(e) => setSelectedProfile(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
        >
          <option value="default">Default (Max 5 DL CC, 1 UL SCell)</option>
          {Object.entries(DEVICE_PROFILES).map(([key, profile]) => (
            <option key={key} value={key}>
              {profile.name} (Max {profile.maxDLCC} DL CC, {profile.maxULSCell} UL SCell)
            </option>
          ))}
        </select>
        <p className="text-gray-500 text-xs mt-2">
          Profile limits: {currentProfile.maxDLCC} DL CC, {currentProfile.maxULSCell} UL SCell, {currentProfile.maxTotalUL} total UL
        </p>
      </div>

      {/* Add Band Section */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4 text-purple-300">Add Band</h2>

        <div className="grid grid-cols-5 gap-3 mb-4">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Band</label>
            <select
              value={newBandConfig.band}
              onChange={(e) => setNewBandConfig(prev => ({ ...prev, band: parseInt(e.target.value) }))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm"
            >
              {availableBands.map(b => (
                <option key={b.band} value={b.band}>
                  B{b.band} ({b.duplexMode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-400 text-xs mb-1">Class</label>
            <select
              value={newBandConfig.bclass}
              onChange={(e) => setNewBandConfig(prev => ({ ...prev, bclass: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm"
            >
              {classOptions.map(cls => (
                <option key={cls} value={cls}>{cls} ({classToCC(cls)} CC)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-400 text-xs mb-1">MIMO</label>
            <select
              value={newBandConfig.mimo}
              onChange={(e) => setNewBandConfig(prev => ({ ...prev, mimo: parseInt(e.target.value) }))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm"
            >
              {mimoOptions.map(mimo => (
                <option key={mimo} value={mimo}>{mimo}x{mimo}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={newBandConfig.ulca}
                onChange={(e) => setNewBandConfig(prev => ({ ...prev, ulca: e.target.checked }))}
                className="w-4 h-4 accent-purple-500"
              />
              <span className="text-gray-300 text-sm">UL CA</span>
            </label>
          </div>

          <div className="flex items-end">
            <button
              onClick={addBandConfig}
              className="w-full py-2 bg-green-600 hover:bg-green-500 rounded font-medium transition-colors"
            >
              + Add
            </button>
          </div>
        </div>

        {/* FDD/TDD Warning */}
        {bandAnalysis.isMixed && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded text-red-200 text-sm">
            Warning: Mixing FDD and TDD bands is not allowed in LTE CA combos!
          </div>
        )}

        {/* Selected Bands */}
        {selectedBandConfigs.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-gray-300 font-medium">
              Selected Bands ({selectedBandConfigs.length})
              {selectedBandConfigs.length === 1 && classToCC(selectedBandConfigs[0].bclass) > 1 && (
                <span className="text-purple-400 ml-2 text-sm">→ Intra-band CA</span>
              )}
            </h3>
            {selectedBandConfigs.map((config, idx) => (
              <div key={config.id} className="bg-gray-700 rounded p-3 flex items-center gap-4">
                <span className={`px-3 py-1 rounded text-white font-medium ${getBandColorClass(config.band)}`}>
                  B{config.band}
                </span>
                <span className="text-gray-300">
                  Class {config.bclass} ({classToCC(config.bclass)} CC)
                </span>
                <span className="text-gray-300">{config.mimo}x{config.mimo} MIMO</span>
                {config.ulca && <span className="text-blue-400">UL CA</span>}
                <span className="text-gray-500 text-sm">
                  = {classToCC(config.bclass) * config.mimo} streams
                </span>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => duplicateBandConfig(config.id)}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                    title="Duplicate for intra-band non-contiguous"
                  >
                    +CC
                  </button>
                  <button
                    onClick={() => removeBandConfig(config.id)}
                    className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            {/* Total CC and Streams Preview */}
            <div className="mt-2 p-2 bg-gray-700/50 rounded text-sm">
              <span className="text-gray-400">Total: </span>
              <span className="text-yellow-300">
                {selectedBandConfigs.reduce((sum, c) => sum + classToCC(c.bclass), 0)} CC
              </span>
              <span className="text-gray-400"> / </span>
              <span className="text-green-300">
                {calculateStreamsFromConfigs(selectedBandConfigs)} streams max
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Generation Options */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4 text-purple-300">Generation Options</h2>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={shouldGeneratePermutations}
              onChange={(e) => setShouldGeneratePermutations(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <div>
              <span className="text-gray-300">Generate all permutations (order matters)</span>
              <p className="text-gray-500 text-xs">
                When disabled (recommended), treats combos as sets. E.g., 3A-7A = 7A-3A.
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={generatePCellVariants}
              onChange={(e) => setGeneratePCellVariants(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <div>
              <span className="text-gray-300">Generate PCell variants</span>
              <p className="text-gray-500 text-xs">
                Creates variants with each band as PCell (Primary Cell).
              </p>
            </div>
          </label>

          {selectedBandConfigs.length >= 2 && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={generateAllLengths}
                onChange={(e) => setGenerateAllLengths(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <div>
                <span className="text-gray-300">
                  Generate all combo lengths (1 to {selectedBandConfigs.length} bands)
                </span>
                <p className="text-gray-500 text-xs">
                  Creates combos of all sizes, not just using all selected bands.
                </p>
              </div>
            </label>
          )}
        </div>

        <button
          onClick={generateCombinations_handler}
          disabled={selectedBandConfigs.length === 0}
          className={`w-full mt-4 py-3 rounded-lg font-medium transition-colors ${
            selectedBandConfigs.length > 0
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Generate Combinations
        </button>
      </div>

      {/* Results Section */}
      {generatedCombos.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-purple-300">
              Generated Combinations
            </h2>
            <button
              onClick={addToEncoder}
              disabled={comboStats && comboStats.valid === 0}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                comboStats && comboStats.valid > 0
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              Add {comboStats?.valid || 0} Valid to Encoder
            </button>
          </div>

          {/* Statistics */}
          {comboStats && (
            <div className="mb-4 p-3 bg-gray-700 rounded grid grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Total</div>
                <div className="text-xl font-semibold text-purple-300">{comboStats.total}</div>
              </div>
              <div>
                <div className="text-gray-400">Valid</div>
                <div className="text-xl font-semibold text-green-300">{comboStats.valid}</div>
              </div>
              <div>
                <div className="text-gray-400">Errors</div>
                <div className={`text-xl font-semibold ${comboStats.errors > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {comboStats.errors}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Unique DL</div>
                <div className="text-xl font-semibold text-blue-300">{comboStats.uniqueDL}</div>
              </div>
              <div>
                <div className="text-gray-400">Max Streams</div>
                <div className="text-xl font-semibold text-yellow-300">{comboStats.maxStreams}</div>
              </div>
            </div>
          )}

          {/* Combo List */}
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-800">
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 pr-2 w-10">#</th>
                  <th className="pb-2 pr-4">Combination</th>
                  <th className="pb-2 pr-4 w-20">Streams</th>
                  <th className="pb-2 pr-4 w-16">UL CA</th>
                  <th className="pb-2 pr-4 w-24">PCell</th>
                  <th className="pb-2 w-32">Status</th>
                </tr>
              </thead>
              <tbody>
                {generatedCombos.map((combo, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-700/50 hover:bg-gray-700/30 ${
                      !combo.validation.valid ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="py-2 pr-2 text-gray-500">{i + 1}</td>
                    <td className="py-2 pr-4 font-mono text-green-300">
                      {combo.text}
                      {combo.pcellIndex !== null && (
                        <span className="text-purple-400 ml-1">[P{combo.pcellIndex + 1}]</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-yellow-300">{combo.streams}</td>
                    <td className="py-2 pr-4">
                      {combo.hasULCA && <span className="text-blue-400">*</span>}
                    </td>
                    <td className="py-2 pr-4 text-gray-400 text-xs">
                      {combo.pcellIndex !== null
                        ? `B${combo.bandConfigs[combo.pcellIndex]?.band}`
                        : '-'}
                    </td>
                    <td className="py-2">
                      {combo.validation.valid ? (
                        combo.validation.warnings.length > 0 ? (
                          <span className="text-yellow-400 text-xs" title={combo.validation.warnings.map(w => w.message).join('\n')}>
                            Warning
                          </span>
                        ) : (
                          <span className="text-green-400 text-xs">OK</span>
                        )
                      ) : (
                        <span className="text-red-400 text-xs" title={combo.validation.errors.map(e => e.message).join('\n')}>
                          {combo.validation.errors[0]?.code || 'Error'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-sm text-blue-200">
        <h3 className="font-semibold mb-2">How it works:</h3>
        <ul className="space-y-1 list-disc list-inside">
          <li>Add bands with their class (CC count), MIMO, and UL CA settings</li>
          <li>For <strong>intra-band CA</strong>: Add one band with Class B+ or add same band twice (+CC button)</li>
          <li>By default, generates <strong>unique combos</strong> (order doesn't matter)</li>
          <li>Enable "permutations" only if band order matters for your use case</li>
          <li>PCell variants mark which band is the Primary Cell</li>
          <li><span className="text-purple-400">Purple</span> = FDD, <span className="text-orange-400">Orange</span> = TDD, <span className="text-yellow-400">Yellow</span> = SDL</li>
          <li>Streams = sum(CC_count × MIMO) for each band</li>
          <li>Invalid combos (FDD+TDD mix, CC limits exceeded) are marked and excluded from export</li>
        </ul>
      </div>
    </div>
  );
}
