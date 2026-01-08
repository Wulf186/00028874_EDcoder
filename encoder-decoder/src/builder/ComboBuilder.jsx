import React, { useState, useMemo } from 'react';

// Helper to generate all permutations of selected bands
const generatePermutations = (arr, length) => {
  if (length === 1) return arr.map(item => [item]);

  const result = [];
  arr.forEach((item, index) => {
    const remaining = [...arr.slice(0, index), ...arr.slice(index + 1)];
    const perms = generatePermutations(remaining, length - 1);
    perms.forEach(perm => result.push([item, ...perm]));
  });

  return result;
};

// Helper to calculate streams from combo string
const calculateStreamsFromCombo = (bandConfigs) => {
  let streams = 0;
  for (const config of bandConfigs) {
    const classValue = config.bclass.charCodeAt(0) - 0x40; // A=1, B=2, C=3, etc.
    const carriers = classValue;
    streams += carriers * config.mimo;
  }
  return streams;
};

// Generate all priority variants for a combo
const generatePriorityVariants = (bandConfigs) => {
  const variants = [];
  const numBands = bandConfigs.length;

  if (numBands === 1) {
    // Single band - no priority marker needed
    const combo = `${bandConfigs[0].band}${bandConfigs[0].bclass}${bandConfigs[0].mimo}`;
    variants.push({
      comboStr: combo,
      bandConfigs,
      priorityIndex: -1
    });
  } else if (numBands === 2) {
    // 2-band combo: generate 3 variants (no priority, first priority, second priority)
    // Variant 1: No priority marker
    const combo1 = bandConfigs.map(c => `${c.band}${c.bclass}${c.mimo}`).join('-');
    variants.push({
      comboStr: combo1,
      bandConfigs,
      priorityIndex: -1
    });

    // Variant 2: First band has priority
    const combo2 = `${bandConfigs[0].band}${bandConfigs[0].bclass}${bandConfigs[0].mimo}A-${bandConfigs[1].band}${bandConfigs[1].bclass}${bandConfigs[1].mimo}`;
    variants.push({
      comboStr: combo2,
      bandConfigs,
      priorityIndex: 0
    });

    // Variant 3: Second band has priority
    const combo3 = `${bandConfigs[0].band}${bandConfigs[0].bclass}${bandConfigs[0].mimo}-${bandConfigs[1].band}${bandConfigs[1].bclass}${bandConfigs[1].mimo}A`;
    variants.push({
      comboStr: combo3,
      bandConfigs,
      priorityIndex: 1
    });
  } else {
    // 3+ band combo: generate variants with priority at each position
    for (let priorityIdx = 0; priorityIdx < numBands; priorityIdx++) {
      const comboParts = bandConfigs.map((c, idx) => {
        const base = `${c.band}${c.bclass}${c.mimo}`;
        return idx === priorityIdx ? base + 'A' : base;
      });
      variants.push({
        comboStr: comboParts.join('-'),
        bandConfigs,
        priorityIndex: priorityIdx
      });
    }
  }

  return variants;
};

export default function ComboBuilder({ onAddToEncoder }) {
  // Band configuration state
  const [selectedBands, setSelectedBands] = useState([]);
  const [bandConfigs, setBandConfigs] = useState({});
  const [generatedCombos, setGeneratedCombos] = useState([]);
  const [generateAllLengths, setGenerateAllLengths] = useState(false);

  // Common LTE bands
  const availableBands = [1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 20, 25, 26, 28, 29, 30, 38, 39, 40, 41, 42, 43, 66, 71];
  const classOptions = ['A', 'B', 'C', 'D', 'E', 'F'];
  const mimoOptions = [2, 4];

  // Toggle band selection
  const toggleBand = (band) => {
    setSelectedBands(prev => {
      if (prev.includes(band)) {
        return prev.filter(b => b !== band);
      } else {
        return [...prev, band].sort((a, b) => a - b);
      }
    });

    // Initialize default config for new band
    if (!bandConfigs[band]) {
      setBandConfigs(prev => ({
        ...prev,
        [band]: { bclass: 'A', mimo: 2, ulca: false }
      }));
    }
  };

  // Update band configuration
  const updateBandConfig = (band, field, value) => {
    setBandConfigs(prev => ({
      ...prev,
      [band]: {
        ...prev[band],
        [field]: value
      }
    }));
  };

  // Generate all combinations
  const generateCombinations = () => {
    if (selectedBands.length < 2) {
      alert('Please select at least 2 bands');
      return;
    }

    const combos = [];

    // Determine which lengths to generate
    const lengths = generateAllLengths
      ? Array.from({ length: selectedBands.length - 1 }, (_, i) => i + 2) // [2, 3, ..., selectedBands.length]
      : [selectedBands.length]; // Only use all selected bands

    for (const length of lengths) {
      // Generate all permutations of selected bands with current length
      const permutations = generatePermutations(selectedBands, length);

      for (const perm of permutations) {
        // Build band configs array for this permutation
        const configs = perm.map(band => ({
          band,
          bclass: bandConfigs[band]?.bclass || 'A',
          mimo: bandConfigs[band]?.mimo || 2,
          ulca: bandConfigs[band]?.ulca || false
        }));

        // Generate priority variants
        const variants = generatePriorityVariants(configs);

        // Add all variants to combos list
        for (const variant of variants) {
          const streams = calculateStreamsFromCombo(variant.bandConfigs);

          // Check if any band has UL CA
          const hasULCA = variant.bandConfigs.some(c => c.ulca);

          combos.push({
            text: variant.comboStr,
            streams,
            hasULCA,
            bandConfigs: variant.bandConfigs,
            priorityIndex: variant.priorityIndex
          });
        }
      }
    }

    setGeneratedCombos(combos);
  };

  // Add generated combos to encoder
  const addToEncoder = () => {
    if (generatedCombos.length === 0) {
      alert('No combinations generated yet');
      return;
    }

    // Pass combos to encoder
    onAddToEncoder(generatedCombos);
  };

  const comboStats = useMemo(() => {
    if (generatedCombos.length === 0) return null;

    const maxStreams = Math.max(...generatedCombos.map(c => c.streams));
    const uniqueDLCombos = new Set(generatedCombos.map(c => {
      return c.bandConfigs.map(b => `${b.band}${b.bclass}${b.mimo}`).join('-');
    })).size;

    return {
      total: generatedCombos.length,
      maxStreams,
      uniqueDL: uniqueDLCombos
    };
  }, [generatedCombos]);

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4 text-purple-300">Combo Configuration</h2>

        {/* Band Selection */}
        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2">
            Select bands ({selectedBands.length} selected)
            {selectedBands.length >= 2 && (
              <span className="text-purple-400 ml-2">
                → Will generate {generateAllLengths ? `2 to ${selectedBands.length}` : selectedBands.length}-band combos
              </span>
            )}
          </label>
          <div className="grid grid-cols-6 gap-2">
            {availableBands.map(band => (
              <button
                key={band}
                onClick={() => toggleBand(band)}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  selectedBands.includes(band)
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                B{band}
              </button>
            ))}
          </div>
        </div>

        {/* Band Configuration */}
        {selectedBands.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-gray-300 font-medium mb-2">Band Settings</h3>
            {selectedBands.map(band => (
              <div key={band} className="bg-gray-700 rounded p-3">
                <div className="grid grid-cols-4 gap-3 items-center">
                  <div className="font-semibold text-purple-300">Band {band}</div>

                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Class</label>
                    <select
                      value={bandConfigs[band]?.bclass || 'A'}
                      onChange={(e) => updateBandConfig(band, 'bclass', e.target.value)}
                      className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-white text-sm"
                    >
                      {classOptions.map(cls => (
                        <option key={cls} value={cls}>
                          {cls} ({String.fromCharCode(64 + cls.charCodeAt(0) - 64)}×20 MHz)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 text-xs mb-1">MIMO</label>
                    <select
                      value={bandConfigs[band]?.mimo || 2}
                      onChange={(e) => updateBandConfig(band, 'mimo', parseInt(e.target.value))}
                      className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-white text-sm"
                    >
                      {mimoOptions.map(mimo => (
                        <option key={mimo} value={mimo}>{mimo}x{mimo}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bandConfigs[band]?.ulca || false}
                        onChange={(e) => updateBandConfig(band, 'ulca', e.target.checked)}
                        className="w-4 h-4 accent-purple-500"
                      />
                      <span className="text-gray-300 text-sm">UL CA</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Generation Options */}
        {selectedBands.length >= 3 && (
          <div className="mt-4 mb-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={generateAllLengths}
                onChange={(e) => setGenerateAllLengths(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <span className="text-gray-300">Generate all combo lengths (2 to {selectedBands.length} bands)</span>
            </label>
            <p className="text-gray-500 text-xs mt-1 ml-7">
              When enabled, generates all possible lengths. When disabled, only generates {selectedBands.length}-band combos.
            </p>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={generateCombinations}
          disabled={selectedBands.length < 2}
          className={`w-full mt-4 py-3 rounded-lg font-medium transition-colors ${
            selectedBands.length >= 2
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
              Generated Combinations ({comboStats.total})
            </h2>
            <button
              onClick={addToEncoder}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
            >
              Add to Encoder
            </button>
          </div>

          {/* Statistics */}
          {comboStats && (
            <div className="mb-4 p-3 bg-gray-700 rounded grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Total combinations</div>
                <div className="text-xl font-semibold text-purple-300">{comboStats.total}</div>
              </div>
              <div>
                <div className="text-gray-400">Unique DL configs</div>
                <div className="text-xl font-semibold text-blue-300">{comboStats.uniqueDL}</div>
              </div>
              <div>
                <div className="text-gray-400">Max streams</div>
                <div className="text-xl font-semibold text-yellow-300">{comboStats.maxStreams}</div>
              </div>
            </div>
          )}

          {/* Combo List */}
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-800">
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 pr-4 w-12">#</th>
                  <th className="pb-2 pr-4">Combination</th>
                  <th className="pb-2 pr-4 w-20">Streams</th>
                  <th className="pb-2 pr-4 w-16">UL CA</th>
                  <th className="pb-2 w-32">Priority</th>
                </tr>
              </thead>
              <tbody>
                {generatedCombos.map((combo, i) => (
                  <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                    <td className="py-2 pr-4 font-mono text-green-300">{combo.text}</td>
                    <td className="py-2 pr-4 text-yellow-300">{combo.streams}</td>
                    <td className="py-2 pr-4">
                      {combo.hasULCA && <span className="text-blue-400">*</span>}
                    </td>
                    <td className="py-2 text-gray-500 text-xs">
                      {combo.priorityIndex >= 0
                        ? `Band ${combo.bandConfigs[combo.priorityIndex].band}`
                        : 'None'}
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
          <li>Select bands you want to use (minimum 2 bands)</li>
          <li>Configure each band's class (bandwidth), MIMO, and UL CA settings</li>
          <li>By default, generates combos using all selected bands</li>
          <li>Enable "Generate all combo lengths" to create 2-band, 3-band, etc. up to all selected bands</li>
          <li>The builder generates all permutations with priority marker variants:
            <ul className="ml-6 mt-1 space-y-0.5">
              <li className="text-xs">• 2-band combos: 3 variants (no priority, first priority, second priority)</li>
              <li className="text-xs">• 3+ band combos: N variants (priority at each position)</li>
            </ul>
          </li>
          <li>Streams are calculated automatically based on class and MIMO</li>
          <li>Click "Add to Encoder" to add all generated combos to the encoder tab</li>
        </ul>
      </div>
    </div>
  );
}
