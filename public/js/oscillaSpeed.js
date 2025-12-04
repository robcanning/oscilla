// speed.js

/**
 * Extracts speed cues from SVG elements whose IDs are in the form:
 *   speed(1.25)
 *   speed(0.8)
 *   speed(2)
 *
 * @param {SVGElement} svgElement
 * @returns {Array<{ position: number, multiplier: number }>}
 */



export function extractSpeedCues(svgElement) {
  if (!svgElement) {
    // console.warn("[extractSpeedCues] No SVG element provided.");
    return [];
  }

  // console.log("------------------------------------------------------------");
  // console.log("[extractSpeedCues] 🔍 Scanning for speed() cues in SVG...");

  const matches = svgElement.querySelectorAll("[id^='speed(']");
  // console.log(`[extractSpeedCues] Found ${matches.length} candidate elements.`);

  let newSpeedMap = [];

  matches.forEach((el) => {
    const rawId = el.id;
    const match = rawId.match(/^speed\(\s*([0-9.]+)/);

    if (!match) {
      // console.log(`[extractSpeedCues] ⚠️ Skipping non-matching ID: ${rawId}`);
      return;
    }

    const speedValue = parseFloat(match[1]);
    if (isNaN(speedValue)) {
      // console.log(`[extractSpeedCues] ⚠️ Invalid number in: ${rawId}`);
      return;
    }

    // Calculate absolute X position
    const bbox = el.getBBox();
    const matrix = el.getCTM();
    let x = bbox.x;
    if (matrix) x += matrix.e;

    // console.log(
    //   `[extractSpeedCues] 🎚 Found speed cue: id="${rawId}" → speed=${speedValue}, x=${x.toFixed(2)}`
    // );

    newSpeedMap.push({
      position: x,
      multiplier: speedValue,
      rawId,
    });
  });

  newSpeedMap.sort((a, b) => a.position - b.position);

  // console.log("[extractSpeedCues] ✅ Final sorted speed map:", newSpeedMap);
  // console.log("------------------------------------------------------------");

  return newSpeedMap;
}


export let speedCueMap = []; // ensure this stays globally shared

/**
 * Returns the active speed multiplier for a given X position on the score.
 * - Uses the most recent speed cue at or before the given playhead position.
 * - Defaults to 1 if no cue applies.
 */
export function getSpeedForPosition(x) {
  if (!speedCueMap || speedCueMap.length === 0) return 1;

  let multiplier = 1;
  let activeCue = null;

  for (const cue of speedCueMap) {
    if (x >= cue.position) {
      multiplier = cue.multiplier;
      activeCue = cue;
    } else {
      break;
    }
  }

  console.log(
    `[getSpeedForPosition] x=${x.toFixed(2)} → multiplier=${multiplier}` +
    (activeCue ? ` (from "${activeCue.rawId}" @ ${activeCue.position.toFixed(2)})` : " (default)")
  );

  return multiplier;
}





// ⚡ Handles cueSpeed: updates playback speed and syncs
// --- Speed Ramp State ---
let activeSpeedRamp = null;

// ------------------------------------------------------------
// handleSpeedRamp(start, end, durationSeconds, easing = "linear")
// ------------------------------------------------------------
export function handleSpeedRamp(start, end, durSec, easing = "linear") {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(durSec) || durSec <= 0) {
    console.warn("[cueSpeed] Invalid ramp params:", { start, end, durSec });
    return;
  }

  console.log(`[cueSpeed] Starting ramp: ${start} → ${end} over ${durSec}s`);

  const startTime = performance.now();
  const durationMs = durSec * 1000;

  // Cancel any existing ramp
  activeSpeedRamp = { start, end, startTime, durationMs, easing };

  // Ensure the animation loop is running
  if (!window.speedRampLoopActive) {
    window.speedRampLoopActive = true;
    requestAnimationFrame(speedRampTick);
  }
}

function easeLinear(t) { return t; }

// Main ramp animation loop
function speedRampTick(now) {
  if (!activeSpeedRamp) {
    window.speedRampLoopActive = false;
    return;
  }

  const { start, end, startTime, durationMs, easing } = activeSpeedRamp;
  const elapsed = now - startTime;
  let t = Math.min(elapsed / durationMs, 1);

  // Apply easing later — for now just linear:
  t = easeLinear(t);

  const value = start + (end - start) * t;

  window.speedMultiplier = value;
  window.updateSpeedDisplay?.();

  // Broadcast to server smoothly
  if (window.socket?.readyState === WebSocket.OPEN && !window.incomingServerUpdate) {
    window.socket.send(JSON.stringify({
      type: "set_speed_multiplier",
      multiplier: value,
      timestamp: Date.now()
    }));
  }

  if (t < 1) {
    requestAnimationFrame(speedRampTick);
  } else {
    console.log(`[cueSpeed] Ramp complete. Final multiplier = ${end}`);
    activeSpeedRamp = null;
    window.speedRampLoopActive = false;
  }
}


// ⚡ Handles cueSpeed: updates playback speed and syncs
export function handleSpeedCue(_id, newMultiplier) {
  newMultiplier = Number(newMultiplier);
  if (!newMultiplier || newMultiplier <= 0) return;
  if (window.speedMultiplier === newMultiplier) return;

  window.speedMultiplier = newMultiplier;
  window.updateSpeedDisplay?.();

  // broadcast only if not receiving
  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN && !window.incomingServerUpdate) {
    window.socket.send(JSON.stringify({
      type: "set_speed_multiplier",
      multiplier: newMultiplier,
      t: Date.now()
    }));
  }
}
