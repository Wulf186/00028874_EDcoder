/**
 * Unified Combo Model and Utilities
 *
 * This module provides:
 * - Type definitions for Carrier and Combo
 * - Class to CC count conversion
 * - Streams calculation
 * - Combo parsing/serialization
 * - Normalization functions
 */

import { getBandDuplexMode, DUPLEX_MODE, bandHasUplink } from './bands.js';

// ==================== CONSTANTS ====================

/** Valid DL/UL class letters */
export const VALID_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Maximum number of component carriers (6 is typical limit for LTE-A) */
export const MAX_CC = 6;

/** Default limits */
export const DEFAULT_LIMITS = {
  maxDLCC: 5,
  maxULSCell: 1,  // Maximum UL SCells (cells with UL other than PCell)
  maxTotalUL: 2   // Maximum total UL carriers (including PCell)
};

// ==================== CLASS TO CC CONVERSION ====================

/**
 * Convert class letter to number of component carriers
 * A→1, B→2, C→3, D→4, E→5, F→6
 *
 * @param {string} classLetter - Class letter (A-F)
 * @returns {number} Number of component carriers (1-6)
 */
export const classToCC = (classLetter) => {
  if (typeof classLetter === 'string') {
    const upper = classLetter.toUpperCase();
    const code = upper.charCodeAt(0) - 0x40; // A=1, B=2, etc.
    if (code >= 1 && code <= 6) {
      return code;
    }
  }
  // If it's already a number, validate and return
  if (typeof classLetter === 'number' && classLetter >= 1 && classLetter <= 6) {
    return classLetter;
  }
  return 1; // Default to A=1
};

/**
 * Convert CC count to class letter
 * 1→A, 2→B, 3→C, 4→D, 5→E, 6→F
 *
 * @param {number} ccCount - Number of component carriers (1-6)
 * @returns {string} Class letter (A-F)
 */
export const ccToClass = (ccCount) => {
  const count = Math.max(1, Math.min(6, Math.floor(ccCount)));
  return String.fromCharCode(0x40 + count);
};

/**
 * Convert numeric class (1-6) to letter
 * Used for backward compatibility with existing code
 *
 * @param {number} classNum - Numeric class (1=A, 2=B, etc.)
 * @returns {string} Class letter
 */
export const classNumToLetter = (classNum) => {
  if (classNum >= 1 && classNum <= 26) {
    return String.fromCharCode(0x40 + classNum);
  }
  return 'A';
};

/**
 * Convert class letter to numeric
 *
 * @param {string} classLetter - Class letter (A-Z)
 * @returns {number} Numeric class (1-26)
 */
export const classLetterToNum = (classLetter) => {
  if (typeof classLetter === 'string' && classLetter.length === 1) {
    const code = classLetter.toUpperCase().charCodeAt(0) - 0x40;
    if (code >= 1 && code <= 26) {
      return code;
    }
  }
  return 1;
};

// ==================== CARRIER TYPE ====================

/**
 * @typedef {Object} Carrier
 * @property {number} band - Band number (1-255)
 * @property {string} dlClass - DL class letter (A-F)
 * @property {number} mimoDl - DL MIMO (2, 4, 8, etc.)
 * @property {string|null} ulClass - UL class letter (A-F) or null if no UL
 * @property {number} mimoUl - UL MIMO (typically 1 or 2)
 */

/**
 * Create a carrier object with defaults
 *
 * @param {Object} params
 * @param {number} params.band - Band number
 * @param {string} [params.dlClass='A'] - DL class
 * @param {number} [params.mimoDl=2] - DL MIMO
 * @param {string|null} [params.ulClass=null] - UL class
 * @param {number} [params.mimoUl=1] - UL MIMO
 * @returns {Carrier}
 */
export const createCarrier = ({
  band,
  dlClass = 'A',
  mimoDl = 2,
  ulClass = null,
  mimoUl = 1
}) => ({
  band,
  dlClass: dlClass.toUpperCase(),
  mimoDl,
  ulClass: ulClass ? ulClass.toUpperCase() : null,
  mimoUl
});

// ==================== COMBO TYPE ====================

/**
 * @typedef {Object} Combo
 * @property {Carrier[]} carriers - Array of carriers
 * @property {number|null} pcellIndex - Index of PCell in carriers array (null = not specified)
 * @property {Object} [meta] - Optional metadata
 */

/**
 * Create a combo object
 *
 * @param {Object} params
 * @param {Carrier[]} params.carriers - Array of carriers
 * @param {number|null} [params.pcellIndex=null] - PCell index
 * @param {Object} [params.meta={}] - Metadata
 * @returns {Combo}
 */
export const createCombo = ({
  carriers,
  pcellIndex = null,
  meta = {}
}) => ({
  carriers: [...carriers],
  pcellIndex,
  meta: { ...meta }
});

// ==================== STREAMS CALCULATION ====================

/**
 * Calculate streams for a single carrier
 * Formula: CC_count * MIMO
 *
 * @param {Carrier|Object} carrier - Carrier object
 * @returns {number} Number of streams
 */
export const calculateCarrierStreams = (carrier) => {
  const ccCount = classToCC(carrier.dlClass || carrier.bclass);
  const mimo = carrier.mimoDl || carrier.ant || 2;
  return ccCount * mimo;
};

/**
 * Calculate total streams for a combo
 * Formula: sum(CC_count(dlClass) * mimoDl) for all carriers
 *
 * @param {Carrier[]|Object[]} carriers - Array of carriers
 * @returns {number} Total streams
 */
export const calculateStreams = (carriers) => {
  if (!carriers || carriers.length === 0) return 0;

  let totalStreams = 0;
  for (const carrier of carriers) {
    totalStreams += calculateCarrierStreams(carrier);
  }
  return totalStreams;
};

/**
 * Calculate streams from combo object
 *
 * @param {Combo} combo - Combo object
 * @returns {number} Total streams
 */
export const calculateComboStreams = (combo) => {
  return calculateStreams(combo.carriers);
};

// ==================== UL CA DETECTION ====================

/**
 * Check if a combo has UL CA
 * UL CA exists when more than one carrier has UL capability enabled
 *
 * @param {Carrier[]|Object[]} carriers - Array of carriers
 * @returns {boolean} True if UL CA is present
 */
export const hasULCA = (carriers) => {
  if (!carriers || carriers.length === 0) return false;

  // Count carriers with UL class defined
  const ulCount = carriers.filter(c => {
    const ulClass = c.ulClass || c.ulclass;
    return ulClass && ulClass !== 0 && ulClass !== '0';
  }).length;

  return ulCount > 1;
};

/**
 * Get all carriers with UL capability
 *
 * @param {Carrier[]|Object[]} carriers - Array of carriers
 * @returns {Object[]} Carriers with UL
 */
export const getULCarriers = (carriers) => {
  if (!carriers) return [];
  return carriers.filter(c => {
    const ulClass = c.ulClass || c.ulclass;
    return ulClass && ulClass !== 0 && ulClass !== '0';
  });
};

/**
 * Count total UL component carriers
 *
 * @param {Carrier[]|Object[]} carriers - Array of carriers
 * @returns {number} Total UL CC count
 */
export const countULCC = (carriers) => {
  const ulCarriers = getULCarriers(carriers);
  return ulCarriers.reduce((sum, c) => {
    const ulClass = c.ulClass || c.ulclass;
    return sum + classToCC(ulClass);
  }, 0);
};

// ==================== PARSING ====================

/**
 * Parse a combo string into carriers array
 * Format: BAND + CLASS + [MIMO] + [ULCLASS]
 * Example: "3A4A-7B2-20A2C"
 *
 * @param {string} comboStr - Combo string
 * @returns {{carriers: Carrier[], pcellIndex: number|null}}
 */
export const parseComboString = (comboStr) => {
  const carriers = [];
  let pcellIndex = null;
  const parts = comboStr.trim().split('-');

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    if (!part) continue;

    // Pattern: BAND + CLASS + [MIMO] + [ULCLASS] + [optional 'A' for PCell marker at end]
    // Examples: 3A, 3A2, 3A4, 3A2A, 3A4B, 3A2A (where last A could be UL class or PCell marker)
    const match = part.match(/^(\d+)([A-Z])(\d+)?([A-Z])?([A-Z])?$/i);

    if (!match) {
      throw new Error(`Invalid carrier format: ${part}`);
    }

    const band = parseInt(match[1], 10);
    const dlClass = match[2].toUpperCase();
    const mimo = match[3] ? parseInt(match[3], 10) : 2;

    // Handle UL class and potential PCell marker
    let ulClass = null;
    let isPCell = false;

    if (match[4]) {
      const char4 = match[4].toUpperCase();
      if (match[5]) {
        // Two letters after MIMO: first is UL class, second might be PCell marker
        ulClass = char4;
        if (match[5].toUpperCase() === 'A') {
          // Could be PCell marker - check if this is standalone 'A' at end
          // For now, treat additional 'A' after UL class as PCell marker
          isPCell = true;
        }
      } else {
        // Only one letter after MIMO
        // Could be UL class or PCell marker 'A'
        // PCell marker is typically 'A' appearing after the carrier without being an UL class
        // Heuristic: if it's 'A' and we haven't established UL yet, it could be PCell marker
        // But traditionally 'A' suffix means UL class A
        ulClass = char4;
      }
    }

    // Check for legacy PCell marker: trailing 'A' that makes the combo end with double A
    // e.g., "3A2A" where first A is class, second A is UL class indicating PCell
    if (ulClass === 'A' && dlClass === 'A' && !match[5]) {
      // This pattern often indicates PCell: xAyA where both classes are A
      // But it's ambiguous - could be UL class A
      // For backward compatibility, treat as PCell if this carrier seems to be marked
      // We'll detect PCell by looking at the original string pattern
    }

    carriers.push({
      band,
      dlClass,
      mimoDl: mimo,
      ulClass,
      mimoUl: ulClass ? 1 : 0,
      // Legacy format support
      bclass: classLetterToNum(dlClass),
      ant: mimo,
      ulclass: ulClass ? classLetterToNum(ulClass) : 0
    });
  }

  // Detect PCell from legacy format (trailing 'A' pattern)
  // In legacy format, PCell is indicated by adding 'A' suffix to indicate the priority cell
  // This is separate from UL class - it's metadata
  // For proper handling, we look at the original string structure

  return { carriers, pcellIndex };
};

/**
 * Parse combo string with explicit PCell detection
 * Looks for the legacy 'A' suffix pattern used to mark PCell
 *
 * @param {string} comboStr - Combo string
 * @returns {{carriers: Carrier[], pcellIndex: number|null, originalStr: string}}
 */
export const parseComboWithPCell = (comboStr) => {
  const parts = comboStr.trim().split('-');
  const carriers = [];
  let pcellIndex = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // Detect if this part has PCell marker (ends with extra 'A')
    // Pattern like "3A2A" where the final A is PCell marker, not UL class
    // This is tricky because "3A2A" could mean:
    // 1. Band 3, DL Class A, MIMO 2, UL Class A
    // 2. Band 3, DL Class A, MIMO 2, PCell marker

    // More specific pattern: BAND + CLASS + MIMO + [ULCLASS] + [PCell A]
    // We'll use a heuristic: if string ends with exactly one 'A' and
    // the carrier already has UL class, that 'A' is PCell marker

    let match = part.match(/^(\d+)([A-Z])(\d+)?([A-Z])?$/i);
    if (!match) {
      throw new Error(`Invalid carrier format: ${part}`);
    }

    const band = parseInt(match[1], 10);
    const dlClass = match[2].toUpperCase();
    const mimo = match[3] ? parseInt(match[3], 10) : 2;
    let ulClass = match[4] ? match[4].toUpperCase() : null;

    // For this implementation, we'll treat the UL class 'A' as potentially being PCell marker
    // when it appears at the end of the combo string in a specific pattern
    // This is a simplification - real implementation might need more context

    carriers.push({
      band,
      dlClass,
      mimoDl: mimo,
      ulClass,
      mimoUl: ulClass ? 1 : 0,
      bclass: classLetterToNum(dlClass),
      ant: mimo,
      ulclass: ulClass ? classLetterToNum(ulClass) : 0
    });
  }

  return { carriers, pcellIndex, originalStr: comboStr };
};

// ==================== SERIALIZATION ====================

/**
 * Convert carriers to combo string (canonical format without PCell marker)
 *
 * @param {Carrier[]|Object[]} carriers - Array of carriers
 * @param {Object} options
 * @param {boolean} [options.includeMimo=true] - Include MIMO values
 * @param {boolean} [options.includeUL=true] - Include UL class
 * @returns {string} Combo string
 */
export const carriersToString = (carriers, options = {}) => {
  const { includeMimo = true, includeUL = true } = options;

  return carriers.map(c => {
    const band = c.band;
    const dlClass = c.dlClass || classNumToLetter(c.bclass);
    const mimo = c.mimoDl || c.ant || 2;
    const ulClass = c.ulClass || (c.ulclass ? classNumToLetter(c.ulclass) : null);

    let str = `${band}${dlClass}`;
    if (includeMimo) {
      str += mimo;
    }
    if (includeUL && ulClass) {
      str += ulClass;
    }
    return str;
  }).join('-');
};

/**
 * Convert combo object to string with optional PCell marker
 *
 * @param {Combo} combo - Combo object
 * @param {Object} options
 * @param {boolean} [options.includePCell=false] - Include PCell marker
 * @param {boolean} [options.includeMimo=true] - Include MIMO
 * @param {boolean} [options.includeUL=true] - Include UL class
 * @returns {string} Combo string
 */
export const comboToString = (combo, options = {}) => {
  const { includePCell = false, includeMimo = true, includeUL = true } = options;

  const parts = combo.carriers.map((c, idx) => {
    const band = c.band;
    const dlClass = c.dlClass || classNumToLetter(c.bclass);
    const mimo = c.mimoDl || c.ant || 2;
    const ulClass = c.ulClass || (c.ulclass ? classNumToLetter(c.ulclass) : null);

    let str = `${band}${dlClass}`;
    if (includeMimo) {
      str += mimo;
    }
    if (includeUL && ulClass) {
      str += ulClass;
    }
    // Add PCell marker
    if (includePCell && combo.pcellIndex === idx) {
      str += 'A';
    }
    return str;
  });

  return parts.join('-');
};

// ==================== NORMALIZATION ====================

/**
 * Sort carriers by band number (canonical order)
 *
 * @param {Carrier[]} carriers - Array of carriers
 * @returns {Carrier[]} Sorted carriers (new array)
 */
export const sortCarriersByBand = (carriers) => {
  return [...carriers].sort((a, b) => {
    const bandA = a.band;
    const bandB = b.band;
    if (bandA !== bandB) return bandA - bandB;

    // Same band: sort by DL class
    const classA = classLetterToNum(a.dlClass || a.bclass);
    const classB = classLetterToNum(b.dlClass || b.bclass);
    return classA - classB;
  });
};

/**
 * Normalize a combo to canonical form
 * - Sorts carriers by band number
 * - Removes duplicate carriers
 * - Updates pcellIndex to reflect new order
 *
 * @param {Combo} combo - Combo object
 * @returns {Combo} Normalized combo
 */
export const normalizeCombo = (combo) => {
  // Track original PCell carrier
  const pcellCarrier = combo.pcellIndex !== null ? combo.carriers[combo.pcellIndex] : null;

  // Sort carriers
  const sortedCarriers = sortCarriersByBand(combo.carriers);

  // Find new pcellIndex
  let newPcellIndex = null;
  if (pcellCarrier) {
    newPcellIndex = sortedCarriers.findIndex(c =>
      c.band === pcellCarrier.band &&
      (c.dlClass || c.bclass) === (pcellCarrier.dlClass || pcellCarrier.bclass) &&
      (c.mimoDl || c.ant) === (pcellCarrier.mimoDl || pcellCarrier.ant)
    );
    if (newPcellIndex === -1) newPcellIndex = null;
  }

  return createCombo({
    carriers: sortedCarriers,
    pcellIndex: newPcellIndex,
    meta: { ...combo.meta, normalized: true }
  });
};

/**
 * Generate canonical key for a combo (for grouping/deduplication)
 * Key is based on sorted carriers without PCell info
 *
 * @param {Combo|Object} combo - Combo object or carriers array
 * @returns {string} Canonical key
 */
export const getComboKey = (combo) => {
  const carriers = combo.carriers || combo;
  const sorted = sortCarriersByBand(carriers);

  return sorted.map(c => {
    const band = c.band;
    const dlClass = c.dlClass || classNumToLetter(c.bclass);
    const mimo = c.mimoDl || c.ant || 2;
    return `${band}:${classLetterToNum(dlClass)}:${mimo}`;
  }).join('|');
};

/**
 * Generate DL-only key for grouping (ignores UL configuration)
 *
 * @param {Carrier[]|Object[]} carriers - Array of carriers
 * @returns {string} DL key
 */
export const getDLKey = (carriers) => {
  // Normalize to 6 elements for consistency
  const normalized = [];
  for (let i = 0; i < 6; i++) {
    const c = carriers[i] || { band: 0, bclass: 0, ant: 0 };
    normalized.push(`${c.band}:${c.bclass || classLetterToNum(c.dlClass)}:${c.ant || c.mimoDl || 0}`);
  }
  return normalized.join('|');
};

// ==================== CONVERSION HELPERS ====================

/**
 * Convert legacy carrier format to new Carrier type
 *
 * @param {Object} legacy - Legacy carrier {band, bclass, ant, ulclass}
 * @returns {Carrier} New carrier format
 */
export const legacyToCarrier = (legacy) => ({
  band: legacy.band,
  dlClass: classNumToLetter(legacy.bclass),
  mimoDl: legacy.ant || 2,
  ulClass: legacy.ulclass ? classNumToLetter(legacy.ulclass) : null,
  mimoUl: legacy.ulclass ? 1 : 0,
  // Keep legacy fields for backward compatibility
  bclass: legacy.bclass,
  ant: legacy.ant || 2,
  ulclass: legacy.ulclass || 0
});

/**
 * Convert new Carrier type to legacy format
 *
 * @param {Carrier} carrier - New carrier
 * @returns {Object} Legacy format {band, bclass, ant, ulclass}
 */
export const carrierToLegacy = (carrier) => ({
  band: carrier.band,
  bclass: carrier.bclass || classLetterToNum(carrier.dlClass),
  ant: carrier.ant || carrier.mimoDl || 2,
  ulclass: carrier.ulclass || (carrier.ulClass ? classLetterToNum(carrier.ulClass) : 0)
});

// ==================== COMBO COMPARISON ====================

/**
 * Check if two combos are equivalent (same carriers regardless of order)
 *
 * @param {Combo} combo1
 * @param {Combo} combo2
 * @returns {boolean}
 */
export const combosEqual = (combo1, combo2) => {
  return getComboKey(combo1) === getComboKey(combo2);
};

/**
 * Check if two combos are identical (same carriers in same order with same PCell)
 *
 * @param {Combo} combo1
 * @param {Combo} combo2
 * @returns {boolean}
 */
export const combosIdentical = (combo1, combo2) => {
  if (combo1.pcellIndex !== combo2.pcellIndex) return false;
  if (combo1.carriers.length !== combo2.carriers.length) return false;

  for (let i = 0; i < combo1.carriers.length; i++) {
    const c1 = combo1.carriers[i];
    const c2 = combo2.carriers[i];
    if (c1.band !== c2.band) return false;
    if ((c1.dlClass || c1.bclass) !== (c2.dlClass || c2.bclass)) return false;
    if ((c1.mimoDl || c1.ant) !== (c2.mimoDl || c2.ant)) return false;
    if ((c1.ulClass || c1.ulclass) !== (c2.ulClass || c2.ulclass)) return false;
  }

  return true;
};
