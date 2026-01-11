/**
 * LTE Band Database
 *
 * Contains information about all LTE bands including:
 * - Duplex mode (FDD, TDD, SDL)
 * - Frequency ranges (DL/UL)
 * - Common names/regions
 *
 * Source: 3GPP TS 36.101
 */

// Duplex modes
export const DUPLEX_MODE = {
  FDD: 'FDD',
  TDD: 'TDD',
  SDL: 'SDL'  // Supplementary Downlink (DL only)
};

/**
 * Complete LTE band database
 * Key: band number
 * Value: { duplexMode, dlFreqLow, dlFreqHigh, ulFreqLow, ulFreqHigh, name }
 */
export const BANDS = {
  // FDD Bands (1-32, 65-76, 85, 87-88)
  1:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 2110, dlFreqHigh: 2170, ulFreqLow: 1920, ulFreqHigh: 1980, name: 'IMT 2100' },
  2:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1930, dlFreqHigh: 1990, ulFreqLow: 1850, ulFreqHigh: 1910, name: 'PCS 1900' },
  3:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1805, dlFreqHigh: 1880, ulFreqLow: 1710, ulFreqHigh: 1785, name: 'DCS 1800' },
  4:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 2110, dlFreqHigh: 2155, ulFreqLow: 1710, ulFreqHigh: 1755, name: 'AWS-1' },
  5:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 869, dlFreqHigh: 894, ulFreqLow: 824, ulFreqHigh: 849, name: 'CLR 850' },
  6:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 875, dlFreqHigh: 885, ulFreqLow: 830, ulFreqHigh: 840, name: 'UMTS 800' },
  7:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 2620, dlFreqHigh: 2690, ulFreqLow: 2500, ulFreqHigh: 2570, name: 'IMT-E 2600' },
  8:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 925, dlFreqHigh: 960, ulFreqLow: 880, ulFreqHigh: 915, name: 'E-GSM 900' },
  9:  { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1844.9, dlFreqHigh: 1879.9, ulFreqLow: 1749.9, ulFreqHigh: 1784.9, name: 'Japan 1800' },
  10: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 2110, dlFreqHigh: 2170, ulFreqLow: 1710, ulFreqHigh: 1770, name: 'AWS-1+' },
  11: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1475.9, dlFreqHigh: 1495.9, ulFreqLow: 1427.9, ulFreqHigh: 1447.9, name: 'Japan 1500 Lower' },
  12: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 729, dlFreqHigh: 746, ulFreqLow: 699, ulFreqHigh: 716, name: 'US 700 Lower A/B/C' },
  13: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 746, dlFreqHigh: 756, ulFreqLow: 777, ulFreqHigh: 787, name: 'US 700 Upper C' },
  14: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 758, dlFreqHigh: 768, ulFreqLow: 788, ulFreqHigh: 798, name: 'US 700 Public Safety' },
  17: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 734, dlFreqHigh: 746, ulFreqLow: 704, ulFreqHigh: 716, name: 'US 700 Lower B/C' },
  18: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 860, dlFreqHigh: 875, ulFreqLow: 815, ulFreqHigh: 830, name: 'Japan 800 Lower' },
  19: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 875, dlFreqHigh: 890, ulFreqLow: 830, ulFreqHigh: 845, name: 'Japan 800 Upper' },
  20: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 791, dlFreqHigh: 821, ulFreqLow: 832, ulFreqHigh: 862, name: 'EU 800 DD' },
  21: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1495.9, dlFreqHigh: 1510.9, ulFreqLow: 1447.9, ulFreqHigh: 1462.9, name: 'Japan 1500 Upper' },
  22: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 3510, dlFreqHigh: 3590, ulFreqLow: 3410, ulFreqHigh: 3490, name: '3500' },
  23: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 2180, dlFreqHigh: 2200, ulFreqLow: 2000, ulFreqHigh: 2020, name: 'S-band' },
  24: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1525, dlFreqHigh: 1559, ulFreqLow: 1626.5, ulFreqHigh: 1660.5, name: 'L-band' },
  25: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1930, dlFreqHigh: 1995, ulFreqLow: 1850, ulFreqHigh: 1915, name: 'PCS 1900+' },
  26: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 859, dlFreqHigh: 894, ulFreqLow: 814, ulFreqHigh: 849, name: 'CLR 850+' },
  27: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 852, dlFreqHigh: 869, ulFreqLow: 807, ulFreqHigh: 824, name: 'US 800 SMR' },
  28: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 758, dlFreqHigh: 803, ulFreqLow: 703, ulFreqHigh: 748, name: 'APT 700' },
  29: { duplexMode: DUPLEX_MODE.SDL, dlFreqLow: 717, dlFreqHigh: 728, ulFreqLow: null, ulFreqHigh: null, name: 'US 700 Lower D/E' },
  30: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 2350, dlFreqHigh: 2360, ulFreqLow: 2305, ulFreqHigh: 2315, name: 'WCS 2300' },
  31: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 462.5, dlFreqHigh: 467.5, ulFreqLow: 452.5, ulFreqHigh: 457.5, name: '450 PMR' },
  32: { duplexMode: DUPLEX_MODE.SDL, dlFreqLow: 1452, dlFreqHigh: 1496, ulFreqLow: null, ulFreqHigh: null, name: 'L-band SDL' },

  // TDD Bands (33-53)
  33: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 1900, dlFreqHigh: 1920, ulFreqLow: 1900, ulFreqHigh: 1920, name: 'TDD 1900' },
  34: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 2010, dlFreqHigh: 2025, ulFreqLow: 2010, ulFreqHigh: 2025, name: 'TDD 2000' },
  35: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 1850, dlFreqHigh: 1910, ulFreqLow: 1850, ulFreqHigh: 1910, name: 'TDD PCS Lower' },
  36: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 1930, dlFreqHigh: 1990, ulFreqLow: 1930, ulFreqHigh: 1990, name: 'TDD PCS Upper' },
  37: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 1910, dlFreqHigh: 1930, ulFreqLow: 1910, ulFreqHigh: 1930, name: 'TDD PCS Center' },
  38: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 2570, dlFreqHigh: 2620, ulFreqLow: 2570, ulFreqHigh: 2620, name: 'TDD 2600' },
  39: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 1880, dlFreqHigh: 1920, ulFreqLow: 1880, ulFreqHigh: 1920, name: 'TDD 1900+' },
  40: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 2300, dlFreqHigh: 2400, ulFreqLow: 2300, ulFreqHigh: 2400, name: 'TDD 2300' },
  41: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 2496, dlFreqHigh: 2690, ulFreqLow: 2496, ulFreqHigh: 2690, name: 'TDD 2500' },
  42: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 3400, dlFreqHigh: 3600, ulFreqLow: 3400, ulFreqHigh: 3600, name: 'TDD 3500' },
  43: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 3600, dlFreqHigh: 3800, ulFreqLow: 3600, ulFreqHigh: 3800, name: 'TDD 3700' },
  44: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 703, dlFreqHigh: 803, ulFreqLow: 703, ulFreqHigh: 803, name: 'TDD 700 APT' },
  45: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 1447, dlFreqHigh: 1467, ulFreqLow: 1447, ulFreqHigh: 1467, name: 'TDD 1500' },
  46: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 5150, dlFreqHigh: 5925, ulFreqLow: 5150, ulFreqHigh: 5925, name: 'LAA' },
  47: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 5855, dlFreqHigh: 5925, ulFreqLow: 5855, ulFreqHigh: 5925, name: 'V2X' },
  48: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 3550, dlFreqHigh: 3700, ulFreqLow: 3550, ulFreqHigh: 3700, name: 'CBRS' },
  49: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 3550, dlFreqHigh: 3700, ulFreqLow: 3550, ulFreqHigh: 3700, name: 'TDD 3600' },
  50: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 1432, dlFreqHigh: 1517, ulFreqLow: 1432, ulFreqHigh: 1517, name: 'TDD 1500+' },
  51: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 1427, dlFreqHigh: 1432, ulFreqLow: 1427, ulFreqHigh: 1432, name: 'TDD 1400 L-band' },
  52: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 3300, dlFreqHigh: 3400, ulFreqLow: 3300, ulFreqHigh: 3400, name: 'TDD 3300' },
  53: { duplexMode: DUPLEX_MODE.TDD, dlFreqLow: 2483.5, dlFreqHigh: 2495, ulFreqLow: 2483.5, ulFreqHigh: 2495, name: 'TDD 2400' },

  // Extended FDD Bands (65+)
  65: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 2110, dlFreqHigh: 2200, ulFreqLow: 1920, ulFreqHigh: 2010, name: 'Extended IMT 2100' },
  66: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 2110, dlFreqHigh: 2200, ulFreqLow: 1710, ulFreqHigh: 1780, name: 'AWS-3' },
  67: { duplexMode: DUPLEX_MODE.SDL, dlFreqLow: 738, dlFreqHigh: 758, ulFreqLow: null, ulFreqHigh: null, name: 'EU 700 SDL' },
  68: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 753, dlFreqHigh: 783, ulFreqLow: 698, ulFreqHigh: 728, name: 'ME 700' },
  69: { duplexMode: DUPLEX_MODE.SDL, dlFreqLow: 2570, dlFreqHigh: 2620, ulFreqLow: null, ulFreqHigh: null, name: 'EU 2600 SDL' },
  70: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1995, dlFreqHigh: 2020, ulFreqLow: 1695, ulFreqHigh: 1710, name: 'AWS-4' },
  71: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 617, dlFreqHigh: 652, ulFreqLow: 663, ulFreqHigh: 698, name: 'US 600' },
  72: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 461, dlFreqHigh: 466, ulFreqLow: 451, ulFreqHigh: 456, name: 'PMR 450' },
  73: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 460, dlFreqHigh: 465, ulFreqLow: 450, ulFreqHigh: 455, name: 'PMR 450+' },
  74: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 1475, dlFreqHigh: 1518, ulFreqLow: 1427, ulFreqHigh: 1470, name: 'L-band' },
  75: { duplexMode: DUPLEX_MODE.SDL, dlFreqLow: 1432, dlFreqHigh: 1517, ulFreqLow: null, ulFreqHigh: null, name: 'L-band SDL' },
  76: { duplexMode: DUPLEX_MODE.SDL, dlFreqLow: 1427, dlFreqHigh: 1432, ulFreqLow: null, ulFreqHigh: null, name: 'L-band SDL' },
  85: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 728, dlFreqHigh: 746, ulFreqLow: 698, ulFreqHigh: 716, name: 'US 700' },
  87: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 420, dlFreqHigh: 425, ulFreqLow: 410, ulFreqHigh: 415, name: '410 MHz' },
  88: { duplexMode: DUPLEX_MODE.FDD, dlFreqLow: 422, dlFreqHigh: 427, ulFreqLow: 412, ulFreqHigh: 417, name: '410+ MHz' }
};

/**
 * Get band information by band number
 * @param {number} bandNum - Band number
 * @returns {object|null} Band info or null if not found
 */
export const getBandInfo = (bandNum) => {
  return BANDS[bandNum] || null;
};

/**
 * Get duplex mode for a band
 * @param {number} bandNum - Band number
 * @returns {string|null} DUPLEX_MODE value or null if not found
 */
export const getBandDuplexMode = (bandNum) => {
  const band = BANDS[bandNum];
  return band ? band.duplexMode : null;
};

/**
 * Check if band is FDD
 * @param {number} bandNum - Band number
 * @returns {boolean}
 */
export const isBandFDD = (bandNum) => {
  return getBandDuplexMode(bandNum) === DUPLEX_MODE.FDD;
};

/**
 * Check if band is TDD
 * @param {number} bandNum - Band number
 * @returns {boolean}
 */
export const isBandTDD = (bandNum) => {
  return getBandDuplexMode(bandNum) === DUPLEX_MODE.TDD;
};

/**
 * Check if band is SDL (Supplementary Downlink - DL only)
 * @param {number} bandNum - Band number
 * @returns {boolean}
 */
export const isBandSDL = (bandNum) => {
  return getBandDuplexMode(bandNum) === DUPLEX_MODE.SDL;
};

/**
 * Check if band supports uplink
 * @param {number} bandNum - Band number
 * @returns {boolean}
 */
export const bandHasUplink = (bandNum) => {
  const mode = getBandDuplexMode(bandNum);
  return mode === DUPLEX_MODE.FDD || mode === DUPLEX_MODE.TDD;
};

/**
 * Get all bands by duplex mode
 * @param {string} duplexMode - DUPLEX_MODE value
 * @returns {number[]} Array of band numbers
 */
export const getBandsByDuplexMode = (duplexMode) => {
  return Object.entries(BANDS)
    .filter(([, info]) => info.duplexMode === duplexMode)
    .map(([num]) => parseInt(num, 10))
    .sort((a, b) => a - b);
};

/**
 * Get all FDD bands
 * @returns {number[]}
 */
export const getFDDBands = () => getBandsByDuplexMode(DUPLEX_MODE.FDD);

/**
 * Get all TDD bands
 * @returns {number[]}
 */
export const getTDDBands = () => getBandsByDuplexMode(DUPLEX_MODE.TDD);

/**
 * Get all SDL bands
 * @returns {number[]}
 */
export const getSDLBands = () => getBandsByDuplexMode(DUPLEX_MODE.SDL);

/**
 * Get commonly used LTE bands (for UI display)
 * @returns {object[]} Array of {band, duplexMode, name}
 */
export const getCommonBands = () => {
  const commonBandNumbers = [1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 20, 25, 26, 28, 29, 30, 38, 39, 40, 41, 42, 43, 46, 48, 66, 71];
  return commonBandNumbers
    .filter(num => BANDS[num])
    .map(num => ({
      band: num,
      ...BANDS[num]
    }));
};

/**
 * Check if a set of bands contains mixed FDD and TDD
 * @param {number[]} bandNumbers - Array of band numbers
 * @returns {{hasFDD: boolean, hasTDD: boolean, hasSDL: boolean, isMixed: boolean}}
 */
export const analyzeBandDuplexModes = (bandNumbers) => {
  const modes = bandNumbers.map(b => getBandDuplexMode(b)).filter(Boolean);
  const hasFDD = modes.includes(DUPLEX_MODE.FDD);
  const hasTDD = modes.includes(DUPLEX_MODE.TDD);
  const hasSDL = modes.includes(DUPLEX_MODE.SDL);

  return {
    hasFDD,
    hasTDD,
    hasSDL,
    isMixed: hasFDD && hasTDD
  };
};
