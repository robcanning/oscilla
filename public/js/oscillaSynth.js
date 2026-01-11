// ===================
//  Synth Cue Support
// ===================
//
// oscillaSynth.js — Minimal WebAudio Synth + Pattern Sequencing for Oscilla
//
// Key semantics (v1):
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
    return ast.params;
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

  console.log(`[ADSR] Applying envelope: A=${A}s, D=${D}s, S=${S}, R=${env.r}s | peak=${peak}, sustain=${sus} @ t0=${t0.toFixed(3)}`);

  try {
    gainParam.cancelScheduledValues(t0);
    gainParam.setValueAtTime(0, t0);
    gainParam.linearRampToValueAtTime(peak, t0 + A);
    if (D > 0) gainParam.linearRampToValueAtTime(sus, t0 + A + D);
    else gainParam.setValueAtTime(sus, t0 + A);
    
    console.log(`[ADSR] Scheduled: 0 -> ${peak} over ${A}s, then -> ${sus}`);
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
// 🎛 Patterns (small subset; consistent with previous synth module)
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
  if (!pattern || !pattern.values || !Array.isArray(pattern.values)) {
    return { next: () => null };
  }

  const values = pattern.values.slice();
  let repeats = pattern.repeats;
  if (repeats === "inf" || repeats === Infinity || repeats == null) repeats = Infinity;
  else {
    repeats = Number(repeats);
    if (!Number.isFinite(repeats)) repeats = 1;
  }

  let index = 0;
  let last = null;
  let cycleCount = 0;

  switch (pattern.name) {
    case "Pseq":
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

    case "Prand":
      return {
        next() {
          if (cycleCount >= repeats) return null;
          const v = values[Math.floor(Math.random() * values.length)];
          // approximate progress
          cycleCount += 1 / Math.max(1, values.length);
          return v;
        }
      };

    case "Pxrand":
      return {
        next() {
          if (cycleCount >= repeats) return null;
          let v;
          do {
            v = values[Math.floor(Math.random() * values.length)];
          } while (v === last && values.length > 1);
          last = v;
          cycleCount += 1 / Math.max(1, values.length);
          return v;
        }
      };

    case "Pshuf": {
      let buf = shuffle(values);
      return {
        next() {
          if (cycleCount >= repeats) return null;
          const v = buf[index];
          index++;
          if (index >= buf.length) {
            index = 0;
            buf = shuffle(values);
            cycleCount++;
          }
          return v;
        }
      };
    }
  }

  // default to seq
  return makePatternGenerator({ name: "Pseq", values, repeats });
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

// Create a single oscillator or noise source
function createSingleSource(ctx, wave) {
  const w = String(wave ?? "sine").toLowerCase();

  if (w === "noise" || w === "white" || w === "pink" || w === "brown") {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx, 2);
    src.loop = true;
    return { kind: "noise", node: src, wave: w };
  }

  const osc = ctx.createOscillator();
  osc.type = w; // sine|square|sawtooth|triangle
  return { kind: "osc", node: osc, wave: w };
}

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
// 🚀 Start / Update
// ============================================================
function startSynthVoice(uid, ast, cueElement, opts) {
  const ctx = sharedAudioCtx;
  const params = extractParams(ast);

  // Defaults
  const wave = params.wave ?? "sine";
  const amp = clamp(params.amp ?? 0.08, 0, 0.25);
  const env = normaliseEnv(params.env);

  // Check if freq is a chord array
  const freqParam = params.freq ?? 440;
  const isChordArray = Array.isArray(freqParam) && freqParam.length > 1;

  console.log(`[synth] Starting voice uid="${uid}" wave=${wave} amp=${amp}`);
  console.log(`[synth] Freq param:`, freqParam, isChordArray ? "(CHORD)" : "(single)");
  console.log(`[synth] Raw env param:`, params.env);
  console.log(`[synth] Normalized env:`, env);

  // lifetime default:
  // - if invoked from a cue with an element, default to region-safe
  // - otherwise default to process
  let lifetime = params.lifetime ?? params.life ?? null;
  if (!lifetime) lifetime = cueElement ? "region" : "process";
  lifetime = String(lifetime).toLowerCase();

  // Create source + graph (now chord-aware)
  const source = createSource(ctx, wave, freqParam);

  // Frequency init for single osc (chord frequencies are set in createSource)
  if (source.kind === "osc" && !source.isChord) {
    const freqHz = pitchToHz(freqParam);
    try {
      source.node.frequency.setValueAtTime(clamp(freqHz, 1, 20000), nowSec(ctx));
    } catch {
      /* ignore */
    }
  }

  // Graph
  const graph = connectGraph(ctx, source.node, {
    ...params,
    amp
  });

  // Attack now
  const t0 = nowSec(ctx);
  applyADSR(graph.gain.gain, ctx, t0, amp, env);

  // Start source(s)
  try {
    if (source.isChord && source.oscillators) {
      // Start all oscillators in the chord
      source.oscillators.forEach(osc => osc.start(t0));
      console.log(`[synth] Started chord with ${source.oscillators.length} oscillators:`, source.frequencies);
    } else {
      source.node.start(t0);
    }
  } catch {
    /* ignore */
  }

  // Optional overlay (if OSC enabled)
  let overlay = null;
  if (cueElement && (isOscEnabled(ast, params) || opts?.forceOverlay)) {
    overlay = createOscOverlay({
      anchorEl: cueElement,
      label: params.oscAddr ?? params.oscaddr ?? uid,
      anchorMode: "bbox",
      mode: "auto",
      track: true
    });
    if (overlay?.el) {
      overlay.el.style.background = "rgba(200, 0, 200, 0.08)";
      overlay.el.style.borderLeft = "2px solid rgba(200, 0, 200, 0.5)";
    }
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
    _wasInsideOnce: false,  // placeholder; fixed below
    _timer: null,
    _stopTimeout: null,
    _stopped: false,
    relOverride: params.rel ?? params.release ?? null,
    _overlay: overlay,

    // pattern generators
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
  // NOTE: We do NOT override the ADSR envelope here.
  // The envelope was already applied at line 652 via applyADSR().
  // Previously there was a ramp here that would immediately override the attack phase.

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

  voice._freqGen = buildParamGen(p.freq);
  voice._ampGen = buildParamGen(p.amp);
  voice._cutoffGen = buildParamGen(p.filter?.freq ?? p.filter?.cutoff);
  voice._qGen = buildParamGen(p.filter?.q);
  voice._durGen = buildParamGen(p.dur);

  voice._hasStepEngine =
    Boolean(voice._freqGen?._dynamic) ||
    Boolean(voice._ampGen?._dynamic) ||
    Boolean(voice._cutoffGen?._dynamic) ||
    Boolean(voice._qGen?._dynamic) ||
    Boolean(voice._durGen?._dynamic && (typeof p.dur === "object" || Array.isArray(p.dur)));
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

  // Frequency
  if (voice.source.kind === "osc" && voice._freqGen && voice._freqGen._dynamic) {
    const v = voice._freqGen.next();
    if (v != null) {
      const hz = pitchToHz(v);
      const glide = clamp(voice.params?.glide ?? voice.glide ?? 0.02, 0, 10);
      voice.glide = glide;
      if (voice.interp === "step" || glide === 0) {
        try { voice.source.node.frequency.setValueAtTime(clamp(hz, 1, 20000), t); } catch { }
      } else {
        try { voice.source.node.frequency.linearRampToValueAtTime(clamp(hz, 1, 20000), t + Math.min(glide, dur)); } catch { }
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

  // Filter cutoff/Q (step)
  if (voice.graph.filter) {
    if (voice._cutoffGen && voice._cutoffGen._dynamic) {
      const v = voice._cutoffGen.next();
      if (v != null) {
        try { voice.graph.filter.frequency.linearRampToValueAtTime(clamp(v, 20, 20000), t + 0.05); } catch { }
      }
    }
    if (voice._qGen && voice._qGen._dynamic) {
      const v = voice._qGen.next();
      if (v != null) {
        try { voice.graph.filter.Q.linearRampToValueAtTime(clamp(v, 0.0001, 30), t + 0.05); } catch { }
      }
    }
  }

  // Overlay update
  if (voice._overlay) {
    const hz = voice.source.kind === "osc" ? voice.source.node.frequency.value : null;
    const txt = voice.source.kind === "osc"
      ? `Hz:${(hz ?? 0).toFixed(1)} amp:${voice.amp.toFixed(3)}`
      : `noise amp:${voice.amp.toFixed(3)}`;
    try {
      voice._overlay.update(txt);
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
  try { voice._overlay?.destroy?.(); } catch { /* ignore */ }
  voice._overlay = null;

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