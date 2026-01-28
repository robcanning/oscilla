// ===================
//  Synth Cue Support
// ===================
//
// oscillaSynth.js — Minimal WebAudio Synth + Pattern Sequencing for Oscilla
//
// Key semantics (v1.2):
// - A synth voice is created by synth(...) and identified by uid.
// - By default, synth voices are SAFE: they auto-stop
//     (a) when the playhead leaves the cue element's bbox (lifetime:region),
//     OR (b) when a provided duration elapses (dur / stopAfter).
// - If you want a persistent synth, set lifetime:process explicitly.
//
// This module follows the same design pattern as oscillaAudio.js:
// - shared AudioContext
// - uid registry
// - safe gain ramps
// - optional OSC overlay
//
// Exports:
// - handleSynthCue(ast, cueElement?, opts?)
// - handleSynthStopCue(ast)
// - stopSynth(uidOrAst, rel?)
// - checkSynthRegions()   (call this from your main tick, like checkImpulseRegions)
//
// ------------------------------------------------------------

import { sendOSCMessage, createOscOverlay } from "./oscillaOSC.js";
import { bindParam, isSignalRef } from '../oscillaParamBinding.js';

// ============================================================
// 🌐 Shared AudioContext + registry
// ============================================================
export const sharedAudioCtx =
  window.sharedAudioCtx ||
  (window.sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());

export const activeSynthVoices =
  window.activeSynthVoices || (window.activeSynthVoices = new Map());

// ============================================================
// 🔧 Small helpers
// ============================================================
function clamp(x, lo, hi) {
  x = Number(x);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function nowSec(ctx) {
  return ctx.currentTime;
}

function stripQuotes(s) {
  return String(s).replace(/^["']|["']$/g, "");
}

// Convert legacy AST args list into a params object.
// Supports both:
//  - {type:"cueSynth", args:[{type:"uid", value:"x"}, ...]}
//  - {type:"cueSynth", params:{...}} (future)
//  - direct {uid, freq, ...} (manual calls)
function extractParams(ast) {
  if (!ast) return {};

  if (ast.params && typeof ast.params === "object") {
    // Return a shallow copy to prevent shared mutable state issues
    return { ...ast.params };
  }

  if (Array.isArray(ast.args)) {
    const out = {};
    for (const a of ast.args) {
      if (!a || typeof a !== "object") continue;
      if (!a.type) continue;
      out[a.type] = a.value;
    }
    return out;
  }

  // fallback: treat ast itself as params
  const out = { ...ast };
  delete out.type;
  delete out.args;
  return out;
}

function isOscEnabled(ast, params) {
  const osc = Number(params?.osc ?? ast?.osc ?? 0) || 0;
  const addr = params?.oscAddr ?? params?.oscaddr ?? ast?.oscAddr ?? ast?.oscaddr;
  return osc > 0 || !!addr;
}

function sendOSCSynth(ast, params, payload) {
  const addr = params?.oscAddr ?? params?.oscaddr ?? ast?.oscAddr ?? ast?.oscaddr ?? null;

  const out = {
    type: "osc_synth",
    uid: params?.uid ?? ast?.uid,
    timestamp: Date.now(),
    ...payload
  };

  if (addr) out.addr = addr;

  try {
    sendOSCMessage(out);
  } catch {
    /* ignore */
  }
}

// ============================================================
// 🎛 Noise buffer (cached)
// ============================================================
let _noiseBuffer = null;

function getNoiseBuffer(ctx, seconds = 2) {
  if (_noiseBuffer && _noiseBuffer.sampleRate === ctx.sampleRate) return _noiseBuffer;

  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  _noiseBuffer = buf;
  return buf;
}

// ============================================================
// 🎚 FX blocks (minimal + stable)
// ============================================================
function buildFilter(ctx, filterCfg) {
  if (!filterCfg) return null;

  let type = (filterCfg.type || filterCfg.mode || "lowpass").toString().toLowerCase();
  if (type === "lp") type = "lowpass";
  if (type === "hp") type = "highpass";
  if (type === "bp") type = "bandpass";
  if (type === "notch") type = "notch";

  const node = ctx.createBiquadFilter();
  node.type = type;

  const freq = Number(filterCfg.freq ?? filterCfg.cutoff ?? 1200);
  const q = Number(filterCfg.q ?? 0.707);

  node.frequency.value = clamp(freq, 20, 20000);
  node.Q.value = clamp(q, 0.0001, 30);

  return node;
}

function buildDelay(ctx, delayCfg) {
  if (!delayCfg) return null;

  const time = clamp(delayCfg.time ?? 0.25, 0, 5);
  const fb = clamp(delayCfg.fb ?? delayCfg.feedback ?? 0.25, 0, 0.98);
  const mix = clamp(delayCfg.mix ?? 0.2, 0, 1);

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1 - mix;
  wet.gain.value = mix;

  const delay = ctx.createDelay(5.0);
  delay.delayTime.value = time;

  const fbGain = ctx.createGain();
  fbGain.gain.value = fb;

  delay.connect(fbGain).connect(delay);

  return { dry, wet, delay, fbGain };
}

// “Reverb lite”: cheap multi-delay feedback with damping.
function buildReverbLite(ctx, reverbCfg) {
  if (!reverbCfg) return null;

  const mix = clamp(reverbCfg.mix ?? reverbCfg.amount ?? 0.2, 0, 1);
  const time = clamp(reverbCfg.time ?? 1.8, 0.05, 6);
  const damp = clamp(reverbCfg.damp ?? 1800, 200, 12000);

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1 - mix;
  wet.gain.value = mix;

  const delays = [0.031, 0.043, 0.059].map((base) => {
    const d = ctx.createDelay(6.0);
    d.delayTime.value = Math.min(6.0, base * time * 10);
    return d;
  });

  const fb = ctx.createGain();
  fb.gain.value = 0.72;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = damp;

  const wetSum = ctx.createGain();
  wetSum.gain.value = 1.0;

  wetSum.connect(lp).connect(fb);

  for (const d of delays) {
    fb.connect(d);
    d.connect(wetSum);
    d.connect(wet);
  }

  return { dry, wet, wetSum, lp, fb, delays };
}

// ============================================================
// 🎚 Envelope helpers (ADSR)
// ============================================================
function normaliseEnv(env) {
  if (!env || typeof env !== "object") return { a: 0.02, d: 0.0, s: 1.0, r: 0.1 };

  const a = env.a ?? env.attack ?? 0.02;
  const d = env.d ?? env.decay ?? 0.0;
  const s = env.s ?? env.sustain ?? 1.0;
  const r = env.r ?? env.release ?? 0.1;

  return {
    a: clamp(a, 0, 60),
    d: clamp(d, 0, 60),
    s: clamp(s, 0, 1),
    r: clamp(r, 0, 60)
  };
}

function applyADSR(gainParam, ctx, t0, amp, env) {
  const A = Math.max(0.0001, env.a);
  const D = Math.max(0, env.d);
  const S = clamp(env.s, 0, 1);

  const peak = amp;
  const sus = amp * S;

  // console.log(`[ADSR] Applying envelope: A=${A}s, D=${D}s, S=${S}, R=${env.r}s | peak=${peak}, sustain=${sus} @ t0=${t0.toFixed(3)}`);

  try {
    gainParam.cancelScheduledValues(t0);
    gainParam.setValueAtTime(0, t0);
    gainParam.linearRampToValueAtTime(peak, t0 + A);
    if (D > 0) gainParam.linearRampToValueAtTime(sus, t0 + A + D);
    else gainParam.setValueAtTime(sus, t0 + A);
  } catch (e) {
    console.error("[ADSR] Error scheduling envelope:", e);
  }
}

function scheduleRelease(gainParam, ctx, t0, relSec) {
  const R = Math.max(0.0001, Number(relSec) || 0.1);
  let current = 0;
  try {
    current = gainParam.value;
  } catch {
    current = 0;
  }

  try {
    gainParam.cancelScheduledValues(t0);
    gainParam.setValueAtTime(current, t0);
    gainParam.linearRampToValueAtTime(0, t0 + R);
  } catch {
    /* ignore */
  }
  return R;
}

// ============================================================
// 🎼 Pitch parsing
// ============================================================
function pitchToHz(v) {
  if (v == null) return 440;

  if (typeof v === "number") return clamp(v, 1, 20000);

  const s = String(v).trim();
  const num = Number(s);
  if (Number.isFinite(num)) return clamp(num, 1, 20000);

  // note name token like A4, C#3, Bb2
  const m = s.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return 440;

  const note = m[1].toUpperCase();
  const accidental = m[2] || "";
  const oct = Number(m[3]);

  const base = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[note] ?? 0;
  let semis = base;
  if (accidental === "#") semis += 1;
  if (accidental === "b") semis -= 1;

  const n = semis + (oct - 4) * 12;
  return 440 * Math.pow(2, n / 12);
}

// ============================================================
// 🎛 Patterns (fixed for per-voice independence)
// ============================================================
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makePatternGenerator(pattern) {
  // Support both .values (standard) and .args (AST variant)
  const rawValues = pattern.values || pattern.args;

  if (!pattern || !rawValues || !Array.isArray(rawValues)) {
    return { next: () => null };
  }

  // FORCE INDEPENDENCE: Deep copy of values to ensure this generator 
  // is strictly isolated from others, even if they share the AST.
  const values = rawValues.slice();

  let repeats = pattern.repeats;
  if (repeats === "inf" || repeats === Infinity || repeats == null) repeats = Infinity;
  else {
    repeats = Number(repeats);
    if (!Number.isFinite(repeats)) repeats = 1;
  }

  // Local state (closure) unique to this call
  let index = 0;
  let last = null;
  let cycleCount = 0;

  // Normalize name
  const name = String(pattern.name || "Pseq");

  // Prand / Pwhite: Random choice
  if (name === "Prand" || name === "Pwhite") {
    return {
      next() {
        if (cycleCount >= repeats) return null;
        const v = values[Math.floor(Math.random() * values.length)];
        cycleCount += 1 / Math.max(1, values.length);
        return v;
      }
    };
  }

  // Pxrand / Prandx: Random choice, no immediate repeats
  if (name === "Pxrand" || name === "Prandx") {
    return {
      next() {
        if (cycleCount >= repeats) return null;
        let v;
        // Safety: guard against single-item arrays causing infinite loops
        let safety = 0;
        do {
          v = values[Math.floor(Math.random() * values.length)];
          safety++;
        } while (v === last && values.length > 1 && safety < 100);
        last = v;
        cycleCount += 1 / Math.max(1, values.length);
        return v;
      }
    };
  }

  // Pshuf: Shuffle once (or per cycle), then play linearly
  if (name === "Pshuf") {
    let buf = shuffle(values);
    return {
      next() {
        if (cycleCount >= repeats) return null;
        const v = buf[index];
        index++;
        if (index >= buf.length) {
          index = 0;
          buf = shuffle(values); // Reshuffle for next cycle
          cycleCount++;
        }
        return v;
      }
    };
  }

  // Default: Pseq
  return {
    next() {
      if (cycleCount >= repeats) return null;
      const v = values[index];
      index++;
      if (index >= values.length) {
        index = 0;
        cycleCount++;
      }
      return v;
    }
  };
}

function buildParamGen(raw) {
  if (raw == null) return null;

  // Pattern object (from parser)
  if (typeof raw === "object" && raw.type === "pattern") {
    const gen = makePatternGenerator(raw);
    return { next: () => gen.next(), _dynamic: true };
  }

  // Array shorthand -> Pseq
  if (Array.isArray(raw)) {
    const gen = makePatternGenerator({ name: "Pseq", values: raw, repeats: "inf" });
    return { next: () => gen.next(), _dynamic: true };
  }

  // Constant
  return { next: () => raw, _dynamic: false };
}

// ============================================================
// 🔌 Voice graph construction
// ============================================================

// Create source(s) - handles both single freq and chord arrays
function createSource(ctx, wave, freqParam) {
  const w = String(wave ?? "sine").toLowerCase();

  // Check if freq is an array (chord)
  const isChord = Array.isArray(freqParam) && freqParam.length > 1;

  if (w === "noise" || w === "white" || w === "pink" || w === "brown") {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx, 2);
    src.loop = true;
    return { kind: "noise", node: src, wave: w, isChord: false, oscillators: null };
  }

  if (isChord) {
    // Create multiple oscillators for chord
    const oscillators = freqParam.map(freq => {
      const osc = ctx.createOscillator();
      osc.type = w;
      const hz = pitchToHz(freq);
      osc.frequency.value = clamp(hz, 1, 20000);
      return osc;
    });

    // Create a mixer gain node to sum all oscillators
    const mixer = ctx.createGain();
    // Scale amplitude by number of voices to prevent clipping
    mixer.gain.value = 1.0 / Math.sqrt(oscillators.length);

    oscillators.forEach(osc => osc.connect(mixer));

    return {
      kind: "chord",
      node: mixer,  // The mixer is the "node" that connects to the rest of the graph
      wave: w,
      isChord: true,
      oscillators: oscillators,
      frequencies: freqParam.map(f => pitchToHz(f))
    };
  }

  // Single oscillator
  const osc = ctx.createOscillator();
  osc.type = w;
  return { kind: "osc", node: osc, wave: w, isChord: false, oscillators: null };
}

function connectGraph(ctx, sourceNode, params) {
  // SAFETY: default amp low, hard cap
  const amp = clamp(params.amp ?? 0.08, 0, 0.25);

  const gain = ctx.createGain();
  gain.gain.value = 0;

  sourceNode.connect(gain);

  let after = gain;

  // Pan (optional)
  let panner = null;
  if (params.pan != null) {
    panner = new StereoPannerNode(ctx, { pan: clamp(params.pan, -1, 1) });
    after.connect(panner);
    after = panner;
  }

  // Filter (optional)
  const filter = buildFilter(ctx, params.filter);
  if (filter) {
    after.connect(filter);
    after = filter;
  }

  // FX sum
  const sum = ctx.createGain();
  sum.gain.value = 1.0;

  // Delay + Reverb use dry/wet blocks
  const delay = buildDelay(ctx, params.delay);
  const reverb = buildReverbLite(ctx, params.reverb);

  if (!delay && !reverb) {
    after.connect(sum);
    sum.connect(ctx.destination);
    return { amp, gain, panner, filter, delay, reverb, sum };
  }

  // Dry path always present
  const dry = ctx.createGain();
  dry.gain.value = 1.0;
  after.connect(dry);
  dry.connect(sum);

  if (delay) {
    after.connect(delay.dry);
    after.connect(delay.delay);
    delay.delay.connect(delay.wet);

    delay.dry.connect(sum);
    delay.wet.connect(sum);
  }

  if (reverb) {
    after.connect(reverb.dry);
    after.connect(reverb.wetSum);

    reverb.dry.connect(sum);
    reverb.wet.connect(sum);
  }

  sum.connect(ctx.destination);
  return { amp, gain, panner, filter, delay, reverb, sum, dry };
}

// ============================================================
// 🧭 Region lifetime checker (call from main tick)
// Mirrors oscillaAudio.js checkImpulseRegions()
// ============================================================
export function checkSynthRegions() {
  if (!window.activeSynthVoices) return;

  const playX = window.getPlayheadX?.();
  if (playX == null) return;

  for (const voice of window.activeSynthVoices.values()) {
    if (!voice) continue;
    if (voice.lifetime !== "region") continue;
    if (!voice._regionEl) continue;
    if (voice._stopped) continue;

    const rect = voice._regionEl.getBoundingClientRect();
    const containerRect = window.scoreContainer?.getBoundingClientRect();

    const rectLeft = rect.left - (containerRect?.left || 0);
    const rectRight = rect.right - (containerRect?.left || 0);

    const EPS = 1.5;
    const inside = playX >= (rectLeft - EPS) && playX <= (rectRight + EPS);

    if (inside) {
      voice._wasInsideOnce = true;
    }

    if (!inside && voice._wasInsideOnce) {
      // playhead has left the region: stop voice
      stopSynth(voice.uid);
    }
  }
}

// ============================================================
// 🎚 Public API
// ============================================================
export async function handleSynthCue(ast, cueElement = null, opts = {}) {
  const ctx = sharedAudioCtx;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }

  const params = extractParams(ast);
  const uid = String(params.uid ?? "").trim();

  if (!uid) {
    console.warn("[synth] Missing uid:", ast);
    return null;
  }

  // Update existing
  if (activeSynthVoices.has(uid)) {
    return updateSynthVoice(uid, ast, cueElement, opts);
  }

  return startSynthVoice(uid, ast, cueElement, opts);
}

export function handleSynthStopCue(ast) {
  const params = extractParams(ast);
  const uid = String(params.uid ?? "").trim();
  const rel = params.rel ?? params.release ?? null;
  stopSynth(uid, rel);
}

export function stopSynth(uidOrAst, rel = null) {
  const uid = typeof uidOrAst === "string" ? uidOrAst : String(extractParams(uidOrAst).uid ?? "").trim();
  if (!uid) return;

  const voice = activeSynthVoices.get(uid);
  if (!voice) return;

  if (voice._stopped) return;
  voice._stopped = true;

  // cancel timers
  if (voice._timer) {
    clearTimeout(voice._timer);
    voice._timer = null;
  }
  if (voice._stopTimeout) {
    clearTimeout(voice._stopTimeout);
    voice._stopTimeout = null;
  }

  const ctx = sharedAudioCtx;
  const now = nowSec(ctx);

  const env = voice.env || { a: 0.02, d: 0, s: 1, r: 0.1 };
  const relSec = rel != null ? Number(rel) : (Number(voice.relOverride) || env.r);

  const R = scheduleRelease(voice.graph.gain.gain, ctx, now, relSec);

  // Stop source(s)
  try {
    if (voice.source?.isChord && voice.source?.oscillators) {
      // Stop all oscillators in the chord
      voice.source.oscillators.forEach(osc => {
        try { osc.stop(now + R + 0.05); } catch { /* ignore */ }
      });
    } else {
      voice.source?.node?.stop(now + R + 0.05);
    }
  } catch {
    /* ignore */
  }

  // cleanup after release
  setTimeout(() => {
    cleanupVoice(uid, voice);
  }, Math.max(30, (R + 0.1) * 1000));

  if (isOscEnabled(voice.ast, voice.params)) {
    sendOSCSynth(voice.ast, voice.params, { state: "stop", rel: R });
  }
}

// ============================================================
//  Start / Update
// ============================================================

function startSynthVoice(uid, ast, cueElement, opts) {
  const ctx = sharedAudioCtx;
  const params = extractParams(ast);
  
  // ========== CONTROL PLANE: Unbinder collection ==========
  const unbinders = [];
  // =========================================================

  // Non-bindable parameters (static)
  const wave = params.wave ?? "sine";
  const env = normaliseEnv(params.env);
  
  // lifetime handling (unchanged)
  let lifetime = params.lifetime ?? params.life ?? null;
  if (!lifetime) lifetime = cueElement ? "region" : "process";
  lifetime = String(lifetime).toLowerCase();

  // Create source (wave type is static)
  const freqParamRaw = params.freq ?? 440;
  
  // For chord arrays, don't bind (static)
  const isChord = Array.isArray(freqParamRaw) && freqParamRaw.length > 1;
  
  // Get initial frequency for source creation
  let initialFreq = 440;
  if (!isSignalRef(freqParamRaw)) {
    initialFreq = isChord ? freqParamRaw : pitchToHz(freqParamRaw);
  }
  
  const source = createSource(ctx, wave, isChord ? freqParamRaw : initialFreq);

  // Graph (amp will be bound after)
  const initialAmp = isSignalRef(params.amp) ? 0.08 : clamp(params.amp ?? 0.08, 0, 0.25);
  const graph = connectGraph(ctx, source.node, {
    ...params,
    amp: initialAmp
  });

  // Start time
  const t0 = nowSec(ctx);
  
  // ========== FREQUENCY BINDING ==========
  if (!isChord && source.kind === "osc") {
    const freqBinding = bindParam(
      freqParamRaw,
      (hz) => {
        try {
          source.node.frequency.setTargetAtTime(
            clamp(hz, 20, 20000),
            ctx.currentTime,
            0.02  // glide time
          );
        } catch (e) { /* ignore */ }
      },
      { min: 20, max: 20000, default: 440 }
    );
    unbinders.push(freqBinding.unbind);
    
    // Set initial frequency
    try {
      source.node.frequency.setValueAtTime(
        clamp(freqBinding.value, 20, 20000),
        t0
      );
    } catch (e) { /* ignore */ }
  }
  // ========================================

  // ========== AMPLITUDE BINDING ==========
  const ampBinding = bindParam(
    params.amp,
    (amp) => {
      try {
        const safeAmp = clamp(amp, 0, 0.5);
        graph.gain.gain.setTargetAtTime(safeAmp, ctx.currentTime, 0.02);
      } catch (e) { /* ignore */ }
    },
    { min: 0, max: 0.5, default: 0.08 }
  );
  unbinders.push(ampBinding.unbind);
  
  const amp = clamp(ampBinding.value, 0, 0.25);
  // ========================================

  // ========== PAN BINDING ==========
  if (graph.panner) {
    const panBinding = bindParam(
      params.pan,
      (pan) => {
        try {
          graph.panner.pan.setTargetAtTime(
            clamp(pan, -1, 1),
            ctx.currentTime,
            0.02
          );
        } catch (e) { /* ignore */ }
      },
      { min: -1, max: 1, default: 0 }
    );
    unbinders.push(panBinding.unbind);
  }
  // ==================================

  // ========== FILTER BINDINGS ==========
  if (graph.filter) {
    // Cutoff frequency
    const cutoffBinding = bindParam(
      params.cutoff ?? params.filterFreq,
      (freq) => {
        try {
          graph.filter.frequency.setTargetAtTime(
            clamp(freq, 20, 20000),
            ctx.currentTime,
            0.02
          );
        } catch (e) { /* ignore */ }
      },
      { min: 20, max: 20000, default: 1000 }
    );
    unbinders.push(cutoffBinding.unbind);

    // Q / Resonance
    const qBinding = bindParam(
      params.q ?? params.resonance,
      (q) => {
        try {
          graph.filter.Q.setTargetAtTime(
            clamp(q, 0.1, 30),
            ctx.currentTime,
            0.02
          );
        } catch (e) { /* ignore */ }
      },
      { min: 0.1, max: 30, default: 1 }
    );
    unbinders.push(qBinding.unbind);
  }
  // =====================================

  // Apply envelope with bound amp value
  applyADSR(graph.gain.gain, ctx, t0, amp, env);

  // Start source(s)
  try {
    if (source.isChord && source.oscillators) {
      source.oscillators.forEach(osc => osc.start(t0));
    } else {
      source.node.start(t0);
    }
  } catch {
    /* ignore */
  }

  // Optional synth preview overlay
  let overlay = null;
  const overlayFlag = Number(params.overlay ?? 2);

  if (cueElement && overlayFlag > 0) {
    // Check if overlay was already primed during assignCues
    if (cueElement._synthOverlay) {
      overlay = cueElement._synthOverlay;
      // console.log(`[synth] 🔄 Reusing primed overlay for ${uid}`);
    } else {
      overlay = createSynthOverlay({
        anchorEl: cueElement,
        voice: null, // temporarily, fixed below
        mode: overlayFlag >= 2 ? "full" : "brief"
      });
    }
  }

  if (overlay?.el) {
    overlay.el.classList.add("is-active");
    setTimeout(() => {
      overlay.el?.classList.remove("is-active");
    }, 250);
  }


  const voice = {
    uid,
    ast,
    params,
    source,
    graph,
    env,
    amp,
    lifetime,
    _regionEl: cueElement || null,
    _wasInsideOnce: false,
    _timer: null,
    _stopTimeout: null,
    _stopped: false,
    relOverride: params.rel ?? params.release ?? null,
    _overlay: null,  // set below if needed
    
    // ========== CONTROL PLANE: Store unbinders ==========
    _unbinders: unbinders,
    // =====================================================

    // pattern generators (unchanged)
    _freqGen: null,
    _ampGen: null,
    _cutoffGen: null,
    _qGen: null,
    _durGen: null,
    _hasStepEngine: false,
    glide: clamp(params.glide ?? 0.02, 0, 10),
    interp: String(params.interp ?? "smooth").toLowerCase()
  };


  voice._wasInsideOnce = false;


  if (overlay) {
    overlay.voice = voice;
    voice._overlay = overlay;

    overlay.update();
    overlay.position();
  }
  activeSynthVoices.set(uid, voice);

  // Prepare generators
  installGenerators(voice);

  // Pattern stepping if dynamic
  if (voice._hasStepEngine) {
    scheduleNextStep(voice, true);
  } else if (params.retrigger) {
    // If no pattern engine, but user wants a one-shot envelope retrigger
    applyADSR(graph.gain.gain, ctx, nowSec(ctx), voice.amp, voice.env);
  }
  
  // Duration-based auto stop:
  // - If voice has step engine, dur is treated as step duration.
  // - If no step engine, dur is treated as lifetime stop-after.
  const stopAfter = params.stopAfter ?? params.stop ?? params.lifeDur ?? null;
  const lifetimeDur = stopAfter != null ? stopAfter : (!voice._hasStepEngine ? params.dur : null);
  if (lifetimeDur != null) {
    const sec = Number(lifetimeDur);
    if (Number.isFinite(sec) && sec > 0) {
      voice._stopTimeout = setTimeout(() => {
        stopSynth(uid);
      }, sec * 1000);
    }
  }

  if (isOscEnabled(ast, params)) {
    sendOSCSynth(ast, params, {
      state: "start",
      wave: String(wave),
      freq: source.kind === "osc" ? freqHz : null,
      amp: voice.amp,
      lifetime
    });
  }

  // refresh synth overlay if present
  if (voice._overlay) {
    try {
      voice._overlay.update();
      voice._overlay.position();
    } catch { }
  }


  return voice;
}

function updateSynthVoice(uid, ast, cueElement, opts) {
  const ctx = sharedAudioCtx;
  const voice = activeSynthVoices.get(uid);
  if (!voice) return null;

  const params = extractParams(ast);
  voice.ast = ast;
  voice.params = params;

  // update region anchor if provided
  if (cueElement) voice._regionEl = cueElement;

  // update lifetime if explicitly given
  if (params.lifetime != null || params.life != null) {
    voice.lifetime = String(params.lifetime ?? params.life).toLowerCase();
  }

  // update amp
  if (params.amp != null) {
    voice.amp = clamp(params.amp, 0, 0.25);
    try {
      voice.graph.gain.gain.linearRampToValueAtTime(voice.amp, nowSec(ctx) + 0.05);
    } catch {
      /* ignore */
    }
  }

  // update pan
  if (voice.graph.panner && params.pan != null) {
    try {
      voice.graph.panner.pan.linearRampToValueAtTime(clamp(params.pan, -1, 1), nowSec(ctx) + 0.05);
    } catch {
      /* ignore */
    }
  }

  // update filter params
  if (voice.graph.filter && params.filter) {
    if (params.filter.freq != null || params.filter.cutoff != null) {
      const cf = params.filter.freq ?? params.filter.cutoff;
      try {
        voice.graph.filter.frequency.linearRampToValueAtTime(clamp(cf, 20, 20000), nowSec(ctx) + 0.05);
      } catch { /* ignore */ }
    }
    if (params.filter.q != null) {
      try {
        voice.graph.filter.Q.linearRampToValueAtTime(clamp(params.filter.q, 0.0001, 30), nowSec(ctx) + 0.05);
      } catch { /* ignore */ }
    }
  }

  // update delay mix/time/fb
  if (voice.graph.delay && params.delay) {
    const mix = params.delay.mix ?? params.delay.amount;
    if (mix != null) {
      const m = clamp(mix, 0, 1);
      try {
        voice.graph.delay.dry.gain.linearRampToValueAtTime(1 - m, nowSec(ctx) + 0.05);
        voice.graph.delay.wet.gain.linearRampToValueAtTime(m, nowSec(ctx) + 0.05);
      } catch { /* ignore */ }
    }
    if (params.delay.time != null) {
      try {
        voice.graph.delay.delay.delayTime.linearRampToValueAtTime(clamp(params.delay.time, 0, 5), nowSec(ctx) + 0.05);
      } catch { /* ignore */ }
    }
    const fb = params.delay.fb ?? params.delay.feedback;
    if (fb != null) {
      try {
        voice.graph.delay.fbGain.gain.linearRampToValueAtTime(clamp(fb, 0, 0.98), nowSec(ctx) + 0.05);
      } catch { /* ignore */ }
    }
  }

  // update reverb mix/damp
  if (voice.graph.reverb && params.reverb) {
    const mix = params.reverb.mix ?? params.reverb.amount;
    if (mix != null) {
      const m = clamp(mix, 0, 1);
      try {
        voice.graph.reverb.dry.gain.linearRampToValueAtTime(1 - m, nowSec(ctx) + 0.05);
        voice.graph.reverb.wet.gain.linearRampToValueAtTime(m, nowSec(ctx) + 0.05);
      } catch { /* ignore */ }
    }
    if (params.reverb.damp != null) {
      try {
        voice.graph.reverb.lp.frequency.linearRampToValueAtTime(clamp(params.reverb.damp, 200, 12000), nowSec(ctx) + 0.05);
      } catch { /* ignore */ }
    }
  }

  // update frequency one-shot if constant
  if (voice.source.kind === "osc" && params.freq != null && !isDynamicParam(params.freq)) {
    const hz = pitchToHz(params.freq);
    const glide = clamp(params.glide ?? voice.glide ?? 0.02, 0, 10);
    voice.glide = glide;
    if (voice.interp === "step" || glide === 0) {
      try { voice.source.node.frequency.setValueAtTime(clamp(hz, 1, 20000), nowSec(ctx)); } catch { }
    } else {
      try { voice.source.node.frequency.linearRampToValueAtTime(clamp(hz, 1, 20000), nowSec(ctx) + Math.min(glide, 0.2)); } catch { }
    }
  }

  // retrigger envelope if requested
  if (params.retrigger) {
    voice.env = normaliseEnv(params.env ?? voice.env);
    applyADSR(voice.graph.gain.gain, ctx, nowSec(ctx), voice.amp, voice.env);
  }

  // refresh pattern generators & engine
  installGenerators(voice);

  if (voice._hasStepEngine && !voice._timer) {
    scheduleNextStep(voice, true);
  }
  if (!voice._hasStepEngine && voice._timer) {
    clearTimeout(voice._timer);
    voice._timer = null;
  }

  // update stopAfter
  if (voice._stopTimeout) {
    clearTimeout(voice._stopTimeout);
    voice._stopTimeout = null;
  }
  const stopAfter = params.stopAfter ?? params.stop ?? params.lifeDur ?? null;
  const lifetimeDur = stopAfter != null ? stopAfter : (!voice._hasStepEngine ? params.dur : null);
  if (lifetimeDur != null) {
    const sec = Number(lifetimeDur);
    if (Number.isFinite(sec) && sec > 0) {
      voice._stopTimeout = setTimeout(() => stopSynth(uid), sec * 1000);
    }
  }

  if (isOscEnabled(ast, params)) {
    sendOSCSynth(ast, params, { state: "update", amp: voice.amp, lifetime: voice.lifetime });
  }

  return voice;
}

// ============================================================
// 🧩 Pattern stepping
// ============================================================
function isDynamicParam(raw) {
  if (raw == null) return false;
  if (typeof raw === "object" && raw.type === "pattern") return true;
  if (Array.isArray(raw)) return true;
  return false;
}

function installGenerators(voice) {
  const p = voice.params || {};

  function maybeRebuild(key, raw) {
    const prev = voice[`_${key}Raw`];
    // Only return existing generator if the AST object is exactly the same reference
    if (prev === raw) return voice[`_${key}Gen`];
    
    voice[`_${key}Raw`] = raw;
    return buildParamGen(raw);
  }

  voice._freqGen   = maybeRebuild("freq", p.freq);
  voice._ampGen    = maybeRebuild("amp", p.amp);
  voice._cutoffGen = maybeRebuild("cutoff", p.filter?.freq ?? p.filter?.cutoff);
  voice._qGen      = maybeRebuild("q", p.filter?.q);
  voice._durGen    = maybeRebuild("dur", p.dur);

  voice._hasStepEngine =
    Boolean(voice._freqGen?._dynamic) ||
    Boolean(voice._ampGen?._dynamic) ||
    Boolean(voice._cutoffGen?._dynamic) ||
    Boolean(voice._qGen?._dynamic) ||
    Boolean(voice._durGen?._dynamic);
}


function scheduleNextStep(voice, first = false) {
  if (voice._stopped) return;

  const ctx = sharedAudioCtx;

  // Step duration:
  // - if dur is dynamic -> per-step
  // - else default to 1.0
  let dur = 1.0;
  if (voice._durGen && voice._durGen._dynamic) {
    const v = voice._durGen.next();
    if (v == null) {
      // pattern ended (once) -> stop
      stopSynth(voice.uid);
      return;
    }
    dur = Number(v) || dur;
  } else if (voice.params?.dur != null && voice._hasStepEngine) {
    const v = Number(voice.params.dur);
    if (Number.isFinite(v) && v > 0) dur = v;
  }

  dur = Math.max(0.02, dur);

  applyStepTargets(voice, dur);

  voice._timer = setTimeout(() => {
    voice._timer = null;
    scheduleNextStep(voice, false);
  }, dur * 1000);
}

function applyStepTargets(voice, dur) {
  if (voice._stopped) return;

  const ctx = sharedAudioCtx;
  const t = nowSec(ctx);

  if (voice._overlay?.el) {
    voice._overlay.el.classList.add("is-active");
    setTimeout(() => {
      voice._overlay?.el?.classList.remove("is-active");
    }, 120);
  }

  // Frequency
  if (voice.source.kind === "osc" && voice._freqGen && voice._freqGen._dynamic) {
    const v = voice._freqGen.next();
    if (v != null) {
      const hz = pitchToHz(v);
      const glide = clamp(voice.params?.glide ?? voice.glide ?? 0.02, 0, 10);
      voice.glide = glide;
      const RAMP = Math.min(0.005, dur * 0.25); // 2–5 ms

      if (voice.interp === "step" || glide === 0) {
        const p = voice.source.node.frequency;
        try {
          p.cancelScheduledValues(t);
          p.setValueAtTime(p.value, t);
          p.linearRampToValueAtTime(clamp(hz, 1, 20000), t + RAMP);
        } catch { }
      } else {
        try {
          voice.source.node.frequency.linearRampToValueAtTime(
            clamp(hz, 1, 20000),
            t + Math.min(glide, dur)
          );
        } catch { }
      }

    }
  }

  // Amp
  if (voice._ampGen && voice._ampGen._dynamic) {
    const v = voice._ampGen.next();
    if (v != null) {
      voice.amp = clamp(v, 0, 0.25);
    }
  }
  try { voice.graph.gain.gain.linearRampToValueAtTime(voice.amp, t + 0.05); } catch { }

  const RAMP = Math.min(0.01, dur * 0.25); // 2–10 ms, step-aware

  // cutoff
  if (voice._cutoffGen && voice._cutoffGen._dynamic) {
    const v = voice._cutoffGen.next();
    if (v != null) {
      const p = voice.graph.filter.frequency;
      try {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(clamp(v, 20, 20000), t + RAMP);
      } catch { }
    }
  }

  // Q
  if (voice._qGen && voice._qGen._dynamic) {
    const v = voice._qGen.next();
    if (v != null) {
      const p = voice.graph.filter.Q;
      try {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(clamp(v, 0.0001, 30), t + RAMP);
      } catch { }
    }
  }


  // Overlay update - keep the formatted display, just add live values
  if (voice._overlay) {
    // Don't overwrite the nice format - the primed overlay already shows params
    // Just add the is-active class to show it's playing
    if (voice._overlay.el && !voice._overlay.el.classList.contains("is-active")) {
      voice._overlay.el.classList.add("is-active");
    }
    try {
      voice._overlay.position();
    } catch { /* ignore */ }
  }

  // OSC step
  if (isOscEnabled(voice.ast, voice.params)) {
    const hz = voice.source.kind === "osc" ? voice.source.node.frequency.value : null;
    sendOSCSynth(voice.ast, voice.params, { state: "step", freq: hz, amp: voice.amp, dur });
  }
}

// ============================================================
// 🧹 Cleanup
// ============================================================
function cleanupVoice(uid, voice) {
  // ========== CONTROL PLANE: Unbind all subscriptions ==========
  if (voice._unbinders) {
    voice._unbinders.forEach(unbind => {
      try { unbind(); } catch (e) { /* ignore */ }
    });
    voice._unbinders = [];
  }
  // ==============================================================

  // Don't destroy overlay - just remove active state
  if (voice._overlay?.el) {
    voice._overlay.el.classList.remove("is-active");
  }

  // Don't null out the overlay - it stays for the next trigger
  // voice._overlay = null;

  // Disconnect chord oscillators if present
  if (voice.source?.isChord && voice.source?.oscillators) {
    voice.source.oscillators.forEach(osc => {
      try { osc.disconnect(); } catch { /* ignore */ }
    });
  }

  try { voice.source?.node?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.gain?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.panner?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.filter?.disconnect(); } catch { /* ignore */ }

  try { voice.graph?.delay?.dry?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.delay?.wet?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.delay?.delay?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.delay?.fbGain?.disconnect(); } catch { /* ignore */ }

  try { voice.graph?.reverb?.dry?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.reverb?.wet?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.reverb?.wetSum?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.reverb?.lp?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.reverb?.fb?.disconnect(); } catch { /* ignore */ }
  try { voice.graph?.reverb?.delays?.forEach(d => d.disconnect()); } catch { /* ignore */ }

  try { voice.graph?.sum?.disconnect(); } catch { /* ignore */ }

  activeSynthVoices.delete(uid);
}


// ============================================================
// 🎛 Synth Overlay 
// ============================================================

function createSynthOverlay({
  anchorEl,
  voice,
  mode = "brief",
  track = true
} = {}) {

  if (!anchorEl) {
    return {
      el: null,
      voice: null,
      update() { },
      position() { },
      destroy() { }
    };
  }

  const box = document.createElement("div");
  box.className = "oscilla-synth-overlay";
  box.style.position = "fixed";
  box.style.pointerEvents = "none";
  box.style.zIndex = 99990;

  const r = anchorEl.getBoundingClientRect();
  box.style.maxWidth = `${Math.max(150, r.width - 8)}px`;
  box.style.whiteSpace = "normal";
  box.style.wordWrap = "break-word";


  box.textContent = "synth..."; // Initial placeholder text
  document.body.appendChild(box);

  function position() {
    if (!anchorEl || !box.isConnected) return;
    const r = anchorEl.getBoundingClientRect();
    // Position overlaying the object, starting a few pixels in from left edge
    // and a few pixels down from top
    box.style.left = `${r.left + 4}px`;
    box.style.top = `${r.top + 4}px`;
  }

  let tracking = false;
  function loop() {
    if (!tracking) return;
    try { position(); } catch { }
    requestAnimationFrame(loop);
  }

  if (track) {
    tracking = true;
    requestAnimationFrame(loop);
  }

  // Position immediately
  position();

  // Create the overlay object first so update() can reference it via `self`
  const self = {
    el: box,
    voice: voice, // Will be updated externally after creation
    mode: mode,
    update(text) {
      // If text provided directly, use it
      if (text !== undefined) {
        box.textContent = text;
        return;
      }
      // Otherwise use self.voice to format
      if (!self.voice) {
        box.textContent = "synth (loading...)";
        return;
      }
      box.textContent = formatSynthOverlay(self.voice, self.mode);
    },
    position,
    destroy() {
      tracking = false;
      try { box.remove(); } catch { }
    }
  };

  return self;
}


function formatSynthOverlay(voice, mode = "brief") {
  const p = voice.params || {};
  const parts = [];

  // waveform (always show semantic default)
  const wave = p.wave ?? "sine";
  parts.push(String(wave));

  // frequency / pitch
  if (p.freq != null) {
    if (typeof p.freq === "object" && p.freq.type === "pattern") {
      parts.push(`${p.freq.name}[${p.freq.values.join(",")}]`);
    } else if (Array.isArray(p.freq)) {
      parts.push(`chord[${p.freq.join(",")}]`);
    } else {
      parts.push(`${p.freq}Hz`);
    }
  }

  // filter (DSL-faithful, full mode only)
  if (mode === "full" && p.filter && typeof p.filter === "object") {
    const type = p.filter.type || p.filter.mode || "lp";
    const items = [type];

    const cf = p.filter.freq ?? p.filter.cutoff;
    if (cf != null) {
      if (typeof cf === "object" && cf.type === "pattern") {
        items.push(`${cf.name}`);
      } else {
        items.push(`F:${stripLeadingZero(cf)}`);
      }
    }

    if (p.filter.q != null) {
      items.push(`Q:${stripLeadingZero(p.filter.q)}`);
    }

    parts.push(items.join(" "));
  }

  function stripLeadingZero(v) {
    if (typeof v !== "number") return String(v);
    const s = String(v);
    return s.startsWith("0.") ? s.slice(1) : s;
  }

  // envelope (compact, DSL-faithful)
  if (p.env && typeof p.env === "object") {
    const labels = [];

    if (p.env.a != null || p.env.attack != null) {
      const v = p.env.a ?? p.env.attack;
      labels.push(`A:${stripLeadingZero(v)}`);
    }
    if (p.env.d != null || p.env.decay != null) {
      const v = p.env.d ?? p.env.decay;
      labels.push(`D:${stripLeadingZero(v)}`);
    }
    if (p.env.s != null || p.env.sustain != null) {
      const v = p.env.s ?? p.env.sustain;
      labels.push(`S:${stripLeadingZero(v)}`);
    }
    if (p.env.r != null || p.env.release != null) {
      const v = p.env.r ?? p.env.release;
      labels.push(`R:${stripLeadingZero(v)}`);
    }

    if (labels.length > 0) {
      parts.push(`env ${labels.join(" ")}`);
    }
  }

  // duration / stepping (full mode)
  if (mode === "full" && p.dur != null) {
    if (typeof p.dur === "object" && p.dur.type === "pattern") {
      parts.push(`dur ${p.dur.name}`);
    } else {
      parts.push(`dur ${p.dur}`);
    }
  }

  // amp (always last)
  if (p.amp != null) {
    parts.push(`amp ${Number(p.amp).toFixed(3)}`);
  }

  return parts.join(" | ");
}


// ============================================================
// 🎯 Prime synth overlay (called during assignCues)
// Creates overlay before synth plays, showing synth params
// ============================================================
export function primeSynthOverlay(ast, cueElement) {
  if (!ast || !cueElement) return;

  // Extract params from AST
  const params = {};
  for (const arg of (ast.args || [])) {
    const key = arg.key || arg.type;
    if (key && arg.value !== undefined) {
      params[key] = arg.value;
    }
  }

  // Check if overlay is requested
  const overlayFlag = Number(params.overlay ?? 2);
  if (overlayFlag <= 0) return;

  // Check if already primed
  if (cueElement._synthOverlayPrimed) return;
  cueElement._synthOverlayPrimed = true;

  const mode = overlayFlag >= 2 ? "full" : "brief";

  // Create a temporary "voice-like" object for formatting
  const pseudoVoice = {
    params: params,
    uid: params.uid || cueElement.id || "synth"
  };

  const overlay = createSynthOverlay({
    anchorEl: cueElement,
    voice: pseudoVoice,
    mode: mode,
    track: true
  });

  if (overlay?.el) {
    overlay.update();
    overlay.position();

    // Store on element for later reference
    cueElement._synthOverlay = overlay;
  }

  // console.log(`[synth] 📋 Primed overlay for ${pseudoVoice.uid}`);
}