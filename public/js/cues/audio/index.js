// =============================================================
//  audio/index.js -- barrel re-exports
//
//  All external consumers import from this file.
//  Internal structure:
//    audioShared.js   -- shared state, utilities, overlay system
//    audioFile.js     -- single-file playback engine
//    audioPool.js     -- randomized pool engine
//    audioImpulse.js  -- stochastic repeating process engine
// =============================================================

// --- audioShared ---
export {
  sharedAudioCtx,
  audioBufferCache,
  audioLastHit,
  activeAudioCues,
  generateToneBuffer,
  sendAudioOscTrigger,
  createAudioOverlay,
  evalMaybeRandom,
  selectFromPool
} from "./audioShared.js";

// --- audioFile ---
export {
  handleAudioCue,
  handleAudioStopCue,
  stopAllAudio,
  primeAudioOverlay,
  primeWaveform
} from "./audioFile.js";

// --- audioPool ---
export {
  ensureAudioPool,
  handleAudioPoolCue,
  primeAudioPoolOverlay,
  primePoolWaveform
} from "./audioPool.js";

// --- audioImpulse ---
export {
  handleAudioImpulseCue,
  checkImpulseRegions,
  stopAudioImpulse,
  stopAllAudioImpulses,
  primeAudioImpulseOverlay,
  primeImpulseWaveform
} from "./audioImpulse.js";
