/**
 * Combo Validation Module
 *
 * Provides validation for CA combos including:
 * - FDD/TDD mixing detection
 * - CC limits validation
 * - UL CA constraints
 * - Band support validation
 */

import { getBandDuplexMode, DUPLEX_MODE, analyzeBandDuplexModes, bandHasUplink, BANDS } from './bands.js';
import { classToCC, hasULCA, getULCarriers, countULCC, DEFAULT_LIMITS } from './combo.js';

// ==================== VALIDATION RESULT TYPES ====================

/**
 * @typedef {Object} ValidationError
 * @property {string} code - Error code
 * @property {string} message - Human-readable message
 * @property {string} severity - 'error' | 'warning'
 * @property {Object} [details] - Additional details
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - True if no errors (warnings are OK)
 * @property {ValidationError[]} errors - Array of errors
 * @property {ValidationError[]} warnings - Array of warnings
 */

// ==================== ERROR CODES ====================

export const ERROR_CODES = {
  FDD_TDD_MIX: 'FDD_TDD_MIX',
  EXCEED_MAX_CC: 'EXCEED_MAX_CC',
  EXCEED_MAX_DL_CC: 'EXCEED_MAX_DL_CC',
  EXCEED_MAX_UL_SCELL: 'EXCEED_MAX_UL_SCELL',
  EXCEED_MAX_TOTAL_UL: 'EXCEED_MAX_TOTAL_UL',
  INVALID_BAND: 'INVALID_BAND',
  SDL_WITH_UL: 'SDL_WITH_UL',
  EMPTY_COMBO: 'EMPTY_COMBO',
  TOO_FEW_CARRIERS: 'TOO_FEW_CARRIERS',
  UNSUPPORTED_BAND: 'UNSUPPORTED_BAND',
  UNSUPPORTED_MIMO: 'UNSUPPORTED_MIMO',
  DUPLICATE_BAND_NOT_ALLOWED: 'DUPLICATE_BAND_NOT_ALLOWED'
};

// ==================== VALIDATION FUNCTIONS ====================

/**
 * Create a validation result
 *
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 * @returns {ValidationResult}
 */
const createResult = (errors = [], warnings = []) => ({
  valid: errors.length === 0,
  errors,
  warnings
});

/**
 * Create an error object
 *
 * @param {string} code
 * @param {string} message
 * @param {Object} [details]
 * @returns {ValidationError}
 */
const createError = (code, message, details = {}) => ({
  code,
  message,
  severity: 'error',
  details
});

/**
 * Create a warning object
 *
 * @param {string} code
 * @param {string} message
 * @param {Object} [details]
 * @returns {ValidationError}
 */
const createWarning = (code, message, details = {}) => ({
  code,
  message,
  severity: 'warning',
  details
});

/**
 * Validate that combo doesn't mix FDD and TDD bands
 *
 * @param {Object[]} carriers - Array of carriers
 * @returns {ValidationError|null}
 */
export const validateNoFDDTDDMix = (carriers) => {
  if (!carriers || carriers.length === 0) return null;

  const bandNumbers = carriers.map(c => c.band);
  const analysis = analyzeBandDuplexModes(bandNumbers);

  if (analysis.isMixed) {
    const fddBands = bandNumbers.filter(b => getBandDuplexMode(b) === DUPLEX_MODE.FDD);
    const tddBands = bandNumbers.filter(b => getBandDuplexMode(b) === DUPLEX_MODE.TDD);

    return createError(
      ERROR_CODES.FDD_TDD_MIX,
      `FDD and TDD bands cannot be mixed in one combo. FDD bands: ${fddBands.join(', ')}. TDD bands: ${tddBands.join(', ')}.`,
      { fddBands, tddBands }
    );
  }

  return null;
};

/**
 * Validate total CC count doesn't exceed limit
 *
 * @param {Object[]} carriers - Array of carriers
 * @param {number} [maxCC=6] - Maximum total CC
 * @returns {ValidationError|null}
 */
export const validateTotalCCLimit = (carriers, maxCC = 6) => {
  if (!carriers || carriers.length === 0) return null;

  const totalCC = carriers.reduce((sum, c) => {
    const dlClass = c.dlClass || c.bclass;
    return sum + classToCC(dlClass);
  }, 0);

  if (totalCC > maxCC) {
    return createError(
      ERROR_CODES.EXCEED_MAX_CC,
      `Total CC count (${totalCC}) exceeds maximum (${maxCC}).`,
      { totalCC, maxCC }
    );
  }

  return null;
};

/**
 * Validate DL CC count doesn't exceed limit
 *
 * @param {Object[]} carriers - Array of carriers
 * @param {number} [maxDLCC=5] - Maximum DL CC
 * @returns {ValidationError|null}
 */
export const validateDLCCLimit = (carriers, maxDLCC = DEFAULT_LIMITS.maxDLCC) => {
  if (!carriers || carriers.length === 0) return null;

  const totalDLCC = carriers.reduce((sum, c) => {
    const dlClass = c.dlClass || c.bclass;
    return sum + classToCC(dlClass);
  }, 0);

  if (totalDLCC > maxDLCC) {
    return createError(
      ERROR_CODES.EXCEED_MAX_DL_CC,
      `Total DL CC count (${totalDLCC}) exceeds maximum (${maxDLCC}).`,
      { totalDLCC, maxDLCC }
    );
  }

  return null;
};

/**
 * Validate UL SCell count doesn't exceed limit
 * UL SCell = UL carriers other than PCell
 *
 * @param {Object[]} carriers - Array of carriers
 * @param {number} [pcellIndex=0] - Index of PCell
 * @param {number} [maxULSCell=1] - Maximum UL SCells
 * @returns {ValidationError|null}
 */
export const validateULSCellLimit = (carriers, pcellIndex = 0, maxULSCell = DEFAULT_LIMITS.maxULSCell) => {
  if (!carriers || carriers.length === 0) return null;

  const ulCarriers = getULCarriers(carriers);

  // Count UL SCells (UL carriers excluding PCell)
  let ulSCellCount = 0;
  for (let i = 0; i < carriers.length; i++) {
    if (i === pcellIndex) continue;
    const ulClass = carriers[i].ulClass || carriers[i].ulclass;
    if (ulClass && ulClass !== 0 && ulClass !== '0') {
      ulSCellCount++;
    }
  }

  if (ulSCellCount > maxULSCell) {
    return createError(
      ERROR_CODES.EXCEED_MAX_UL_SCELL,
      `UL SCell count (${ulSCellCount}) exceeds maximum (${maxULSCell}).`,
      { ulSCellCount, maxULSCell }
    );
  }

  return null;
};

/**
 * Validate total UL carriers don't exceed limit
 *
 * @param {Object[]} carriers - Array of carriers
 * @param {number} [maxTotalUL=2] - Maximum total UL carriers
 * @returns {ValidationError|null}
 */
export const validateTotalULLimit = (carriers, maxTotalUL = DEFAULT_LIMITS.maxTotalUL) => {
  if (!carriers || carriers.length === 0) return null;

  const ulCarriers = getULCarriers(carriers);

  if (ulCarriers.length > maxTotalUL) {
    return createError(
      ERROR_CODES.EXCEED_MAX_TOTAL_UL,
      `Total UL carrier count (${ulCarriers.length}) exceeds maximum (${maxTotalUL}).`,
      { ulCount: ulCarriers.length, maxTotalUL }
    );
  }

  return null;
};

/**
 * Validate all bands exist in database
 *
 * @param {Object[]} carriers - Array of carriers
 * @returns {ValidationError|null}
 */
export const validateBandsExist = (carriers) => {
  if (!carriers || carriers.length === 0) return null;

  const unknownBands = carriers
    .map(c => c.band)
    .filter(band => !BANDS[band]);

  if (unknownBands.length > 0) {
    return createWarning(
      ERROR_CODES.INVALID_BAND,
      `Unknown bands: ${unknownBands.join(', ')}. These may not be valid LTE bands.`,
      { unknownBands }
    );
  }

  return null;
};

/**
 * Validate SDL bands don't have UL configured
 *
 * @param {Object[]} carriers - Array of carriers
 * @returns {ValidationError|null}
 */
export const validateSDLNoUplink = (carriers) => {
  if (!carriers || carriers.length === 0) return null;

  const sdlWithUL = carriers.filter(c => {
    const ulClass = c.ulClass || c.ulclass;
    return getBandDuplexMode(c.band) === DUPLEX_MODE.SDL && ulClass && ulClass !== 0;
  });

  if (sdlWithUL.length > 0) {
    return createError(
      ERROR_CODES.SDL_WITH_UL,
      `SDL bands cannot have uplink: ${sdlWithUL.map(c => `B${c.band}`).join(', ')}.`,
      { bands: sdlWithUL.map(c => c.band) }
    );
  }

  return null;
};

/**
 * Validate combo is not empty
 *
 * @param {Object[]} carriers - Array of carriers
 * @returns {ValidationError|null}
 */
export const validateNotEmpty = (carriers) => {
  if (!carriers || carriers.length === 0) {
    return createError(
      ERROR_CODES.EMPTY_COMBO,
      'Combo must have at least one carrier.'
    );
  }
  return null;
};

// ==================== DEVICE PROFILE VALIDATION ====================

/**
 * @typedef {Object} DeviceProfile
 * @property {string} name - Profile name
 * @property {number} maxDLCC - Max DL CC
 * @property {number} maxULSCell - Max UL SCells
 * @property {number[]} supportedBands - Array of supported band numbers
 * @property {Object.<number, number[]>} bandMimo - Band to supported MIMO values
 */

/**
 * Default device profile
 */
export const DEFAULT_PROFILE = {
  name: 'Default',
  maxDLCC: 5,
  maxULSCell: 1,
  maxTotalUL: 2,
  supportedBands: [], // Empty = all bands supported
  bandMimo: {} // Empty = all MIMO supported
};

/**
 * Example profiles for common devices
 */
export const DEVICE_PROFILES = {
  'generic-cat6': {
    name: 'Generic Cat 6',
    maxDLCC: 2,
    maxULSCell: 0,
    maxTotalUL: 1,
    supportedBands: [],
    bandMimo: {}
  },
  'generic-cat9': {
    name: 'Generic Cat 9',
    maxDLCC: 3,
    maxULSCell: 0,
    maxTotalUL: 1,
    supportedBands: [],
    bandMimo: {}
  },
  'generic-cat12': {
    name: 'Generic Cat 12',
    maxDLCC: 3,
    maxULSCell: 0,
    maxTotalUL: 1,
    supportedBands: [],
    bandMimo: {}
  },
  'generic-cat16': {
    name: 'Generic Cat 16',
    maxDLCC: 4,
    maxULSCell: 0,
    maxTotalUL: 1,
    supportedBands: [],
    bandMimo: {}
  },
  'generic-cat18': {
    name: 'Generic Cat 18',
    maxDLCC: 5,
    maxULSCell: 1,
    maxTotalUL: 2,
    supportedBands: [],
    bandMimo: {}
  },
  'generic-cat20': {
    name: 'Generic Cat 20',
    maxDLCC: 5,
    maxULSCell: 1,
    maxTotalUL: 2,
    supportedBands: [],
    bandMimo: {}
  },
  'mifi-8800l': {
    name: 'MiFi 8800L',
    maxDLCC: 5,
    maxULSCell: 1,
    maxTotalUL: 2,
    supportedBands: [1, 2, 3, 4, 5, 7, 8, 12, 13, 20, 25, 26, 28, 29, 30, 66],
    bandMimo: {
      2: [2, 4],
      4: [2, 4],
      66: [2, 4]
    }
  }
};

/**
 * Validate combo against device profile
 *
 * @param {Object[]} carriers - Array of carriers
 * @param {DeviceProfile} profile - Device profile
 * @returns {ValidationError[]}
 */
export const validateAgainstProfile = (carriers, profile = DEFAULT_PROFILE) => {
  const errors = [];

  if (!carriers || carriers.length === 0) return errors;

  // Check supported bands
  if (profile.supportedBands && profile.supportedBands.length > 0) {
    const unsupportedBands = carriers
      .map(c => c.band)
      .filter(band => !profile.supportedBands.includes(band));

    if (unsupportedBands.length > 0) {
      errors.push(createError(
        ERROR_CODES.UNSUPPORTED_BAND,
        `Bands not supported by ${profile.name}: ${unsupportedBands.join(', ')}.`,
        { unsupportedBands, profileName: profile.name }
      ));
    }
  }

  // Check MIMO support per band
  if (profile.bandMimo && Object.keys(profile.bandMimo).length > 0) {
    for (const carrier of carriers) {
      const mimo = carrier.mimoDl || carrier.ant || 2;
      const supportedMimo = profile.bandMimo[carrier.band];

      if (supportedMimo && !supportedMimo.includes(mimo)) {
        errors.push(createWarning(
          ERROR_CODES.UNSUPPORTED_MIMO,
          `MIMO ${mimo} not supported on Band ${carrier.band}. Supported: ${supportedMimo.join(', ')}.`,
          { band: carrier.band, requestedMimo: mimo, supportedMimo }
        ));
      }
    }
  }

  // Check CC limits
  const dlCCError = validateDLCCLimit(carriers, profile.maxDLCC);
  if (dlCCError) errors.push(dlCCError);

  const ulSCellError = validateULSCellLimit(carriers, 0, profile.maxULSCell);
  if (ulSCellError) errors.push(ulSCellError);

  if (profile.maxTotalUL) {
    const totalULError = validateTotalULLimit(carriers, profile.maxTotalUL);
    if (totalULError) errors.push(totalULError);
  }

  return errors;
};

// ==================== FULL VALIDATION ====================

/**
 * Perform full validation on a combo
 *
 * @param {Object[]} carriers - Array of carriers
 * @param {Object} options
 * @param {number} [options.maxCC=6] - Max total CC
 * @param {number} [options.maxDLCC=5] - Max DL CC
 * @param {number} [options.maxULSCell=1] - Max UL SCells
 * @param {number} [options.maxTotalUL=2] - Max total UL
 * @param {number} [options.pcellIndex=0] - PCell index
 * @param {DeviceProfile} [options.profile] - Device profile
 * @param {boolean} [options.allowFDDTDDMix=false] - Allow FDD/TDD mixing
 * @returns {ValidationResult}
 */
export const validateCombo = (carriers, options = {}) => {
  const {
    maxCC = 6,
    maxDLCC = DEFAULT_LIMITS.maxDLCC,
    maxULSCell = DEFAULT_LIMITS.maxULSCell,
    maxTotalUL = DEFAULT_LIMITS.maxTotalUL,
    pcellIndex = 0,
    profile = null,
    allowFDDTDDMix = false
  } = options;

  const errors = [];
  const warnings = [];

  // Basic validation
  const emptyError = validateNotEmpty(carriers);
  if (emptyError) {
    return createResult([emptyError], []);
  }

  // Band existence check (warning)
  const bandsWarning = validateBandsExist(carriers);
  if (bandsWarning) warnings.push(bandsWarning);

  // FDD/TDD mix check
  if (!allowFDDTDDMix) {
    const mixError = validateNoFDDTDDMix(carriers);
    if (mixError) errors.push(mixError);
  }

  // SDL uplink check
  const sdlError = validateSDLNoUplink(carriers);
  if (sdlError) errors.push(sdlError);

  // CC limits
  const ccError = validateTotalCCLimit(carriers, maxCC);
  if (ccError) errors.push(ccError);

  const dlCCError = validateDLCCLimit(carriers, maxDLCC);
  if (dlCCError) errors.push(dlCCError);

  // UL limits
  const ulSCellError = validateULSCellLimit(carriers, pcellIndex, maxULSCell);
  if (ulSCellError) errors.push(ulSCellError);

  const totalULError = validateTotalULLimit(carriers, maxTotalUL);
  if (totalULError) errors.push(totalULError);

  // Profile validation
  if (profile) {
    const profileErrors = validateAgainstProfile(carriers, profile);
    for (const err of profileErrors) {
      if (err.severity === 'error') {
        errors.push(err);
      } else {
        warnings.push(err);
      }
    }
  }

  return createResult(errors, warnings);
};

/**
 * Quick check if combo is valid (no detailed report)
 *
 * @param {Object[]} carriers - Array of carriers
 * @param {Object} options - Same as validateCombo
 * @returns {boolean}
 */
export const isComboValid = (carriers, options = {}) => {
  return validateCombo(carriers, options).valid;
};

/**
 * Get human-readable validation summary
 *
 * @param {ValidationResult} result
 * @returns {string}
 */
export const getValidationSummary = (result) => {
  const lines = [];

  if (result.valid) {
    lines.push('Combo is valid');
  } else {
    lines.push('Combo has validation errors:');
  }

  for (const error of result.errors) {
    lines.push(`  [ERROR] ${error.message}`);
  }

  for (const warning of result.warnings) {
    lines.push(`  [WARN] ${warning.message}`);
  }

  return lines.join('\n');
};
