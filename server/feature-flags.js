// Backend Feature Flags Manager
// Manages Feature Flags A, B, C with environment variable support

// Default feature flags
const DEFAULT_FLAGS = {
  A: false,
  B: false,
  C: false,
};

// Get flags from environment variables or use defaults
function getFlagsFromEnv() {
  return {
    A: process.env.FEATURE_FLAG_A === 'true',
    B: process.env.FEATURE_FLAG_B === 'true',
    C: process.env.FEATURE_FLAG_C === 'true',
  };
}

// Current flags (environment variables override defaults)
let currentFlags = { ...DEFAULT_FLAGS, ...getFlagsFromEnv() };

function isFeatureEnabled(flag) {
  return !!currentFlags[flag];
}

function setFeatureFlag(flag, value) {
  if (currentFlags.hasOwnProperty(flag)) {
    currentFlags[flag] = !!value;
    console.log(`[FEATURE FLAGS] Flag ${flag} set to ${value}`);
  } else {
    console.warn(`[FEATURE FLAGS] Unknown flag: ${flag}`);
  }
}

function getAllFeatureFlags() {
  return { ...currentFlags };
}

function resetFeatureFlags() {
  currentFlags = { ...DEFAULT_FLAGS, ...getFlagsFromEnv() };
  console.log('[FEATURE FLAGS] All flags reset to defaults');
}

// Log initial flags on module load
console.log('[FEATURE FLAGS] Backend initialized with flags:', currentFlags);

export {
  isFeatureEnabled,
  setFeatureFlag,
  getAllFeatureFlags,
  resetFeatureFlags,
}; 