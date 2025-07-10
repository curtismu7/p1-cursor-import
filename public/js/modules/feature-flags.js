// Feature Flags Manager
// Manages Feature Flags A, B, C with localStorage persistence

const FEATURE_FLAGS_KEY = 'pingone_feature_flags';

// Default feature flags
const DEFAULT_FLAGS = {
  A: false,
  B: false,
  C: false,
};

// Get flags from localStorage or use defaults
function getStoredFlags() {
  try {
    const stored = localStorage.getItem(FEATURE_FLAGS_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_FLAGS;
  } catch (error) {
    console.warn('[FEATURE FLAGS] Error reading from localStorage:', error);
    return DEFAULT_FLAGS;
  }
}

// Save flags to localStorage
function saveFlags(flags) {
  try {
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(flags));
  } catch (error) {
    console.warn('[FEATURE FLAGS] Error saving to localStorage:', error);
  }
}

// Get current flags
let currentFlags = getStoredFlags();

export function isFeatureEnabled(flag) {
  return !!currentFlags[flag];
}

export function setFeatureFlag(flag, value) {
  if (currentFlags.hasOwnProperty(flag)) {
    currentFlags[flag] = !!value;
    saveFlags(currentFlags);
    console.log(`[FEATURE FLAGS] Flag ${flag} set to ${value}`);
  } else {
    console.warn(`[FEATURE FLAGS] Unknown flag: ${flag}`);
  }
}

export function getAllFeatureFlags() {
  return { ...currentFlags };
}

export function resetFeatureFlags() {
  currentFlags = { ...DEFAULT_FLAGS };
  saveFlags(currentFlags);
  console.log('[FEATURE FLAGS] All flags reset to defaults');
}

// Initialize flags on module load
console.log('[FEATURE FLAGS] Initialized with flags:', currentFlags); 