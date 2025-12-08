/*!
 * metro.js — Oscilla networked metronome + quantisation + OSC emitter
 * -------------------------------------------------------------------
 * Provides a shared tempo reference for visual/audio cues.
 * Supports both local (standalone) and server-synced modes.
 */

import { sendMetronomeOsc } from "./oscUtils.js";

export const QuantiseRegistry = {
  actions: [],
  register(fn, options = {}) {
    this.actions.push({
      fn,
      subdivision: options.subdivision || 1, // 1 = per beat
      once: options.once !== false,
    });
  },
  trigger(beat) {
    const remaining = [];
    for (const a of this.actions) {
      const subDivTrigger = Math.floor(beat * a.subdivision) === beat * a.subdivision;
      if (subDivTrigger) {
        try {
          a.fn();
        } catch (err) {
          console.warn("[QuantiseRegistry] Error:", err);
        }
        if (!a.once) remaining.push(a);
      } else {
        remaining.push(a);
      }
    }
    this.actions = remaining;
  },
};

/* -------------------------------------------------------------------- */
/* 🛰️  OSC EMISSION HELPERS                                             */
/* -------------------------------------------------------------------- */

export function emitOscBeat(beat, beats, bpm, bar, timestamp) {
  if (!window.oscEnabled || !window.oscSend) return;
  const t = timestamp ?? performance.now();
  const args = [beat, beats, bpm, bar, t];
  try {
    window.oscSend("/metro/beat", args);
    if (beat === 1) window.oscSend("/metro/bar", [bar, bpm, t]);
  } catch (err) {
    console.warn("[cue:metro] OSC send failed", err);
  }
}

export function emitOscPhase(phase, bar, bpm, timestamp) {
  if (!window.oscEnabled || !window.oscSend) return;
  try {
    window.oscSend("/metro/phase", [phase, bar, bpm, timestamp ?? performance.now()]);
  } catch (err) {
    console.warn("[cue:metro] OSC phase send failed", err);
  }
}

/* -------------------------------------------------------------------- */
/* 🕒  LOCAL PRECISE METRONOME LOOP                                      */
/* -------------------------------------------------------------------- */

export function startPreciseMetronome(bpm = 120, beats = 4, onBeat = () => { }) {
  const beatMs = 60000 / bpm;
  let beatCount = 0;
  let barCount = 0;
  let running = true;
  let nextBeatTime = performance.now() + beatMs;

  function loop() {
    if (!running) return;
    const now = performance.now();

    // continuous phase emission (~120fps)
    const phase = ((now - (nextBeatTime - beatMs)) / (beats * beatMs)) % 1;
    emitOscPhase((phase + 1) % 1, barCount, bpm, now);

    if (now >= nextBeatTime) {
      beatCount = (beatCount % beats) + 1;
      if (beatCount === 1) barCount++;
      onBeat(beatCount, beats);
      QuantiseRegistry.trigger(beatCount);
      emitOscBeat(beatCount, beats, bpm, barCount, nextBeatTime);
      nextBeatTime += beatMs;
      if (now > nextBeatTime + beatMs) nextBeatTime = now + beatMs; // drift correction
    }

    setTimeout(loop, 8); // ~120Hz
  }

  loop();
  return { stop: () => (running = false) };
}

/* -------------------------------------------------------------------- */
/* 🌐  NETWORK-SYNCED METRONOME LOOP                                    */
/* -------------------------------------------------------------------- */

export function startNetworkMetronome(socket, onBeat) {
  let bpm = 120;
  let beats = 4;
  let beatMs = 60000 / bpm;
  let beatCount = 0;
  let barCount = 0;
  let offset = 0;
  let nextBeatTime = performance.now() + beatMs;
  let running = true;

  socket.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "metronome_sync") {
        const localNow = performance.now();
        offset = msg.serverNow - localNow;
        bpm = msg.bpm;
        beatMs = 60000 / bpm;
        nextBeatTime = msg.nextBeatTime - offset;
        beatCount = msg.beatCount;
      }
    } catch (err) {
      console.warn("[cue:metro] invalid sync packet", err);
    }
  });

  function loop() {
    if (!running) return;

    const now = performance.now() + offset;
    const phase = ((now - (nextBeatTime - beatMs)) / (beats * beatMs)) % 1;
    emitOscPhase((phase + 1) % 1, barCount, bpm, now);

    if (now >= nextBeatTime) {
      beatCount = (beatCount % beats) + 1;
      if (beatCount === 1) barCount++;
      onBeat(beatCount, beats);
      QuantiseRegistry.trigger(beatCount);
      emitOscBeat(beatCount, beats, bpm, barCount, nextBeatTime);
      nextBeatTime += beatMs;
    }

    setTimeout(loop, 8);
  }

  loop();
  return { stop: () => (running = false) };
}

/* -------------------------------------------------------------------- */
/* cue:metronome(...)                                                   */
/* -------------------------------------------------------------------- */

export function handleMetronomeCue(ast, cueElement = null) {
  const params = {};
  for (const p of (ast.args || [])) params[p.type] = p.value;

  const bpm = Number(params.bpm || 120);
  const beats = Number(params.beats || 4);
  const visual = params.visual || "circle";
  const audioEnabled = Number(params.audio || 0) === 1;
  const positionMode = params.position || "fixed";
  const oscEnabled = Number(params.osc || 0) === 1;
  const uid = String(params.uid || "default");
  const showCount = params.showcount !== "0" && params.showcount !== 0;
  const targetUid = params.target || null;
  const trig = (params.trig || "manual").toLowerCase();

  // 🔄 NEW NAME
  const hideTrigger = Number(params.hideTrigger ?? 1) === 1;

  const holdSeconds = Number(params.hold || 0);
  const colour = params.colour || "red";
  const size = Number(params.size || 50);

  console.log("[cue:metro] Params →", params);

  // 🎯 Resolve target
  let targetEl = null;
  if (targetUid) {
    targetEl = document.querySelector(
      `[id='${targetUid}'], [data-uid='${targetUid}']`
    );
    if (!targetEl) {
      console.warn(`[cue:metro] target '${targetUid}' not found — using cue element`);
    }
  }

  const score = document.getElementById("scoreContainer");
  if (!score) return console.warn("[cue:metro] No score container found.");

  const anchorEl = targetEl || cueElement;
  if (!anchorEl) return console.warn("[cue:metro] No anchor element found.");

  // --------------------------------------------------------------------
  // 👍 New rule: If visual:self AND hideTrigger=true → ignore + warn
  // --------------------------------------------------------------------
  if (visual === "self" && hideTrigger) {
    console.warn(
      "[cue:metro] hideTrigger ignored because visual:self requires the trigger to remain visible."
    );
  }

  // --------------------------------------------------------------------
  // hideTrigger → hide cue element only (never target)
  // --------------------------------------------------------------------
  if (hideTrigger && visual !== "self" && cueElement) {
    cueElement.style.opacity = "0";
    cueElement.style.pointerEvents = "none";
    cueElement.style.visibility = "hidden";
  }

  // ====================================================================
  // VISUAL:SELF — flash the target element OR cue element if no target
  // ====================================================================
  if (visual === "self") {

    const flashEl = targetEl || cueElement;
    if (!flashEl) {
      console.warn("[cue:metro] visual:self but no element to flash");
      return;
    }

    // Cache original fill/stroke once
    if (!flashEl.dataset._metroOrigFill) {
      const attrFill = flashEl.getAttribute("fill");
      const compFill = window.getComputedStyle(flashEl).fill;
      flashEl.dataset._metroOrigFill = attrFill || compFill || "#000";
    }
    if (!flashEl.dataset._metroOrigStroke) {
      const attrStroke = flashEl.getAttribute("stroke");
      const compStroke = window.getComputedStyle(flashEl).stroke;
      flashEl.dataset._metroOrigStroke = attrStroke || compStroke || "none";
    }

    const origFill = flashEl.dataset._metroOrigFill;
    const origStroke = flashEl.dataset._metroOrigStroke;

    // Colour inversion helper
    function invertColor(col) {
      if (!col || col === "none") return null;
      if (col === "black") return "white";
      if (col === "white") return "black";
      if (/^#?[0-9A-Fa-f]{6}$/.test(col)) {
        const hex = col.replace("#", "");
        const r = 255 - parseInt(hex.slice(0, 2), 16);
        const g = 255 - parseInt(hex.slice(2, 4), 16);
        const b = 255 - parseInt(hex.slice(4, 6), 16);
        return `rgb(${r},${g},${b})`;
      }
      return "#fff";
    }

    const interval = (60 / bpm) * 1000;
    let currentBeat = 0;
    let nextBeatTime = performance.now();
    let stopped = false;

    if (holdSeconds > 0) {
      setTimeout(() => (stopped = true), holdSeconds * 1000);
    }

    function loop(now) {
      if (stopped) return;

      if (now >= nextBeatTime) {
        currentBeat = (currentBeat % beats) + 1;

        // FLASH
        const invFill = invertColor(origFill) || origFill;
        const invStroke = invertColor(origStroke) || origStroke;

        flashEl.setAttribute("fill", invFill);
        if (origStroke !== "none") flashEl.setAttribute("stroke", invStroke);

        flashEl.style.transition = "opacity 80ms ease";
        flashEl.style.opacity = "0.35";

        setTimeout(() => {
          flashEl.setAttribute("fill", origFill);
          if (origStroke !== "none") flashEl.setAttribute("stroke", origStroke);
          flashEl.style.opacity = "1.0";
        }, 120);

        // audio + OSC
        if (audioEnabled) clickBeat(currentBeat);
        if (oscEnabled && window.OSC_ENABLED) {
          sendMetronomeOsc(uid, currentBeat, bpm);
        }

        nextBeatTime += interval;
      }

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    console.log(`[cue:metro] visual:self flashing element id="${flashEl.id}"`);
    return;
  }

  console.warn("[cue:metro] visual overlay mode →", visual);

  // ====================================================================
  // DEFAULT OVERLAY METRONOME (circle/square/diamond/triangle/hex)
  // ====================================================================

  const bbox = anchorEl.getBoundingClientRect();
  const containerBox = score.getBoundingClientRect();
  const scrollX = score.scrollLeft || 0;
  const scrollY = score.scrollTop || 0;

  const x = (positionMode === "scrolling"
    ? bbox.left - containerBox.left + scrollX
    : bbox.left);
  const y = (positionMode === "scrolling"
    ? bbox.top - containerBox.top + scrollY - 10
    : bbox.top - 10);

  const divId = `cue-metro-${uid}`;
  let div = document.getElementById(divId);

  if (!div) {
    div = document.createElement("div");
    div.id = divId;
    div.className = "cue-metronome";
    div.style.position = positionMode === "scrolling" ? "absolute" : "fixed";
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.width = `${size}px`;
    div.style.height = `${size}px`;
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.color = "white";
    div.style.fontSize = `${size / 2.5}px`;
    div.style.textAlign = "center";
    div.style.opacity = "0.8";
    div.style.transform = "translate(-50%, -50%)";
    div.style.transition = "opacity 300ms ease, transform 100ms ease";
    div.style.background = colour;
    div.style.zIndex = "99999";



  console.warn("[cue:metro] Creating overlay DOM:", divId, "visual:", visual);


    // SHAPES
    switch (visual) {
      case "circle":
        div.style.borderRadius = "50%";
        break;
      case "square":
        div.style.borderRadius = "0";
        break;
      case "diamond":
        div.style.borderRadius = "0";
        div.style.transform += " rotate(45deg)";
        break;
      case "triangle":
        div.style.width = "0";
        div.style.height = "0";
        div.style.borderRadius = "0";
        div.style.borderLeft = `${size / 2}px solid transparent`;
        div.style.borderRight = `${size / 2}px solid transparent`;
        div.style.borderBottom = `${size}px solid ${colour}`;
        div.style.background = "transparent";
        div.textContent = "";
        break;
      case "hex":
        div.style.clipPath =
          "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
        div.style.borderRadius = "0";
        break;
      default:
        div.style.borderRadius = "50%";
    }

    // DOM target: prefer overlay, fall back to scroll, then body
    const overlay = document.getElementById("pageOverlayScore");
    const scrollArea = score;
    const root = overlay || scrollArea || document.body;

    root.appendChild(div);
    console.warn("[cue:metro] Overlay DOM attached:", root);

  }

  // UID → deterministic frequency
  function uidToFreq(id) {
    if (!id) return 440;
    let hash = 0;
    for (let i = 0; i < id.length; i++)
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return 300 + (Math.abs(hash) % 400);
  }

  // Beat timing
  let currentBeat = 0;
  const interval = (60 / bpm) * 1000;
  let nextBeatTime = performance.now();

  if (div._beatTimer) cancelAnimationFrame(div._beatTimer);

  function clickBeat(beat) {
    if (!audioEnabled) return;
    try {
      if (!window.oscillaAudioCtx) {
        window.oscillaAudioCtx =
          new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = window.oscillaAudioCtx;
      if (ctx.state === "suspended") ctx.resume();

      const base = uidToFreq(uid);
      const freq = beat === 1 ? base * 2 : base;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch (err) {
      console.warn("[cue:metro] Audio click error:", err);
    }
  }

  let stopped = false;
  function stopMetronome() {
    if (stopped) return;
    stopped = true;

    if (div._beatTimer) cancelAnimationFrame(div._beatTimer);
    div._beatTimer = null;

    div.style.opacity = "0";
    setTimeout(() => div.remove(), 300);

    console.log(`[cue:metro] Stopped uid=${uid}`);
  }

  if (holdSeconds > 0) setTimeout(stopMetronome, holdSeconds * 1000);

  const animateBeat = (now) => {
    if (stopped) return;

    if (now >= nextBeatTime) {
      currentBeat = (currentBeat % beats) + 1;

      if (visual !== "triangle") {
        div.style.transform = "translate(-50%, -50%) scale(1.3)";
        setTimeout(() => {
          div.style.transform = "translate(-50%, -50%) scale(1.0)";
        }, 100);
      }

      if (visual !== "triangle") {
        div.textContent = showCount ? currentBeat : "";
      }

      clickBeat(currentBeat);
      if (oscEnabled && window.OSC_ENABLED) {
        sendMetronomeOsc(uid, currentBeat, bpm);
      }

      nextBeatTime += interval;
    }

    // scroll-following
    if (positionMode === "scrolling" && anchorEl) {
      const b = anchorEl.getBoundingClientRect();
      const sx = score.scrollLeft || 0;
      const sy = score.scrollTop || 0;
      const containerBox = score.getBoundingClientRect();
      const lx = b.left - containerBox.left + sx;
      const ty = b.top - containerBox.top + sy - 10;
      div.style.left = `${isFinite(lx) ? lx : 50}px`;
      div.style.top = `${isFinite(ty) ? ty : 50}px`;
    }

    div._beatTimer = requestAnimationFrame(animateBeat);
  };

  div._beatTimer = requestAnimationFrame(animateBeat);

  console.log(
    `[cue:metro] Started metronome uid=${uid} bpm=${bpm} beats=${beats} visual=${visual}`
  );
}


window.autostartMetronomes = () => {
  if (!window.cues) return;

  for (const c of window.cues) {
    if (c.ast?.type !== "cueMetronome" && c.ast?.type !== "cueMetro")
      continue;

    const trigPair = c.ast.args?.find(p => p.type === "trig");
    const trig = (trigPair?.value || "manual").toLowerCase();
    if (trig !== "auto") continue;

    if (c._autoStarted) continue;
    c._autoStarted = true;

    console.warn("[cue:metro] AUTOSTART →", c.id);
    handleMetronomeCue(c.ast, c.element);
  }
};






/* -------------------------------------------------------------------- */
/* Quantised Cue Registration                                            */
/* -------------------------------------------------------------------- */

export function registerQuantisedCue(fn, options = {}) {
  QuantiseRegistry.register(fn, options);
}

/* -------------------------------------------------------------------- */
/* Simple Audio Click                                                    */
/* -------------------------------------------------------------------- */

export function playClick(beat, beats) {
  const ctx = window.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  window.audioCtx = ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain).connect(ctx.destination);
  const freq = beat === 1 ? 1000 : 750;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

/* -------------------------------------------------------------------- */
console.log("[metro.js] Loaded: networked metronome + quantisation ready");





// ////////////////////// server notes
// /*!
//  * metronomeServer.js — Oscilla networked metronome broadcaster
//  * -------------------------------------------------------------
//  * Provides a shared tempo clock over WebSocket for all connected clients.
//  * Each sync packet contains bpm, beatCount, nextBeatTime, and serverNow.
//  */

// import WebSocket, { WebSocketServer } from "ws";

// const PORT = 8081;
// const wss = new WebSocketServer({ port: PORT });

// /* ------------------------------- SETTINGS ------------------------------- */
// let bpm = 120;
// let beatsPerBar = 4;
// const beatMs = () => 60000 / bpm;

// /* ------------------------------- STATE ---------------------------------- */
// let beatCount = 0;
// let barCount = 0;
// let nextBeatTime = performance.now() + beatMs();

// console.log(`[MetronomeServer] 🎵 Running on ws://localhost:${PORT}`);

// /* ------------------------------- BROADCAST ------------------------------ */
// function broadcastMetronome() {
//   const now = performance.now();

//   // advance beat if time reached
//   if (now >= nextBeatTime) {
//     beatCount = (beatCount % beatsPerBar) + 1;
//     if (beatCount === 1) barCount++;
//     nextBeatTime += beatMs();
//   }

//   // prepare sync message
//   const packet = JSON.stringify({
//     type: "metronome_sync",
//     bpm,
//     beatCount,
//     nextBeatTime,
//     serverNow: now,
//   });

//   // broadcast to all clients
//   for (const client of wss.clients) {
//     if (client.readyState === WebSocket.OPEN) {
//       try {
//         client.send(packet);
//       } catch (err) {
//         console.warn("[MetronomeServer] Failed to send packet", err);
//       }
//     }
//   }

//   // update about 4× per beat
//   setTimeout(broadcastMetronome, beatMs() / 4);
// }

// broadcastMetronome();

// /* ------------------------------- COMMANDS --------------------------------
//    Optional simple CLI commands:
//    - type "bpm 90" to change tempo
//    - type "beats 3" to change beats per bar
// --------------------------------------------------------------------------- */
// process.stdin.setEncoding("utf8");
// process.stdin.on("data", (data) => {
//   const [cmd, value] = data.trim().split(/\s+/);
//   if (cmd === "bpm") {
//     bpm = parseFloat(value);
//     console.log(`[MetronomeServer] ⏱️ BPM → ${bpm}`);
//   } else if (cmd === "beats") {
//     beatsPerBar = parseInt(value);
//     console.log(`[MetronomeServer] 🧭 Beats per bar → ${beatsPerBar}`);
//   }
// });

