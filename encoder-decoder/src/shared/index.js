/**
 * Shared Module Index
 *
 * Re-exports all utilities from the shared module for easy importing.
 */

// Band database
export {
  DUPLEX_MODE,
  BANDS,
  getBandInfo,
  getBandDuplexMode,
  isBandFDD,
  isBandTDD,
  isBandSDL,
  bandHasUplink,
  getBandsByDuplexMode,
  getFDDBands,
  getTDDBands,
  getSDLBands,
  getCommonBands,
  analyzeBandDuplexModes
} from './bands.js';

// Combo model and utilities
export {
  // Constants
  VALID_CLASSES,
  MAX_CC,
  DEFAULT_LIMITS,
  // Class conversion
  classToCC,
  ccToClass,
  classNumToLetter,
  classLetterToNum,
  // Carrier/Combo creation
  createCarrier,
  createCombo,
  // Streams calculation
  calculateCarrierStreams,
  calculateStreams,
  calculateComboStreams,
  // UL CA
  hasULCA,
  getULCarriers,
  countULCC,
  // Parsing
  parseComboString,
  parseComboWithPCell,
  // Serialization
  carriersToString,
  comboToString,
  // Normalization
  sortCarriersByBand,
  normalizeCombo,
  getComboKey,
  getDLKey,
  // Conversion
  legacyToCarrier,
  carrierToLegacy,
  // Comparison
  combosEqual,
  combosIdentical
} from './combo.js';

// Validation
export {
  ERROR_CODES,
  validateNoFDDTDDMix,
  validateTotalCCLimit,
  validateDLCCLimit,
  validateULSCellLimit,
  validateTotalULLimit,
  validateBandsExist,
  validateSDLNoUplink,
  validateNotEmpty,
  validateAgainstProfile,
  validateCombo,
  isComboValid,
  getValidationSummary,
  DEFAULT_PROFILE,
  DEVICE_PROFILES
} from './validation.js';
