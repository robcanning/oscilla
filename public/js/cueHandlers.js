// cueHandlers.MERGED+LOG.js — All cue logic with explanatory comments and key console logs
//
// This version includes:
// - cueHandlers map
// - Full handleCueTrigger with logging
// - All cue handler implementations
// - Utility functions
// - Helpful comments for onboarding developers
// cueHandlers.MERGED.js — All cue logic, cue handler map, dispatcher, and utility functions
// Final version: combines logic from cueHandlers.ALL-full.js + COMPLETE.js
// cueHandlers.COMPLETE.js — Final version including cueHandlers map and full trigger logic
// Extracted and reconstructed from latest app.js


export const cueHandlers = {
  cueSpeed: handleSpeedCue,
  cuePause: handlePauseCue,
  cueStop: handleStopCue,
  cueChoice: handleCueChoice,
  cueAnimation: handleAnimationCue,
  cueAnimejs: handleAnimationCue,
  cueAudio: handleAudioCue,
  cueVideo: handleVideoCue,
  cueP5: handleP5Cue,
  cueOsc: handleOscCue,
  cueOscTrigger: handleOscCue,
  cueOscValue: handleOscCue,
  cueOscSet: handleOscCue,
  cueOscRandom: handleOscCue,
  cueOscBurst: handleOscCue,
  cueOscPulse: handleOscCue,
  cueRepeat: handleRepeatCue,
  cueTraverse: handleTraverseCue,
  "c-t": handleTraverseCue,
};

// 🔁 Main dispatcher function for cue triggers
export function handleCueTrigger(cueId, isRemote = false) {
  console.log(`[DEBUG] Attempting to trigger cue: ${cueId}`);

  if (window.triggeredCues.has(cueId)) {
    console.log(`[DEBUG] Skipping already-triggered cue: ${cueId}`);
    return;
  }

  const { type, cueParams } = parseCueParams(cueId);
  console.log(`[parseCueParams] Final cue type: ${type}`);
  console.log(`[parseCueParams] Final cueParams:`, cueParams);

  if (!cueHandlers.hasOwnProperty(type)) {
    console.warn(`[CLIENT] No handler found for cue type: ${type}`);
    return;
  }

  const handler = cueHandlers[type];
  if (!handler) {
    console.warn(`[CLIENT] Cue type '${type}' has no defined function.`);
    return;
  }

  // Invoke the appropriate cue handler
  if (type === "cueSpeed") {
    const speed = cueParams.speed ?? cueParams.Speed ?? cueParams.choice;
    if (!speed || isNaN(speed)) {
      console.warn(`[CLIENT] Invalid or missing speed in cueSpeed: ${cueId}`);
      return;
    }
    handler(cueId, Number(speed));
  } else if (type === "cuePause") {
    const durationSec = cueParams.duration ?? cueParams.dur ?? cueParams.choice;
    const durationMs = Number(durationSec) * 1000;
    if (!durationMs || isNaN(durationMs)) {
      console.error(`[CLIENT] Invalid duration for cuePause: ${cueId}`);
      return;
    }
    handler(cueId, durationMs);
  } else if (type === "cueChoice") {
    if (cueParams.choice && cueParams.dur) {
  console.log(`[CUE] Triggering cue handler: ${type}`);
      handler(cueId, cueParams);
    } else {
      console.error(`[CLIENT] Invalid cueChoice: missing 'choice' or 'dur' param`);
    }
  } else if (["cueAnimation", "cueAnimejs"].includes(type)) {
    const animDuration = Number(cueParams.dur);
    const animationPath = `animations/${cueParams.choice}.svg`;
    if (!animDuration || isNaN(animDuration)) {
      console.error(`[CLIENT] Invalid duration for ${type}: ${cueId}`);
      return;
    }
    handler(cueId, animationPath, animDuration);
  } else {
  console.log(`[CUE] Triggering cue handler: ${type}`);
    handler(cueId, cueParams);
  }

  // Mark and optionally broadcast the cue
  if (!window.triggeredCues.has(cueId)) {
    window.triggeredCues.add(cueId);
    if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN && !isRemote) {
      window.socket.send(JSON.stringify({ type: 'cueTriggered', cueId }));
      console.log(`[CLIENT] Sent cue trigger to server: ${cueId}`);
    }
  }
}


// cueHandlers.ALL.js — Complete cue logic extracted from app.js

// 💤 Handles cuePause: stops playback and resumes after delay
export function handlePauseCue(cueId, duration, showCountdownOverride = null, resumeTarget = cueId) {
  if (window.isSeeking) return;
  window.ignoreSyncDuringPause = true;
  if (window.isPlaying) {
    window.isPlaying = false;
    window.stopAnimation?.();
    window.togglePlayButton?.(); // if needed for UI
  }
  else {
    window.isPlaying = false;
    window.stopAnimation?.();
  }
  const pauseCountdown = document.getElementById("pause-countdown");
  const pauseTime = document.getElementById("pause-time");
  if (!pauseCountdown || !pauseTime) return;

  const showCountdown = duration > 2000;
  if (showCountdown) {
    const targetEnd = Date.now() + duration;
    pauseCountdown.classList.remove("hidden");
    pauseCountdown.style.display = "flex";
    pauseCountdown.style.visibility = "visible";
    pauseCountdown.style.opacity = "1";

    const updateCountdown = () => {
      const remainingMs = targetEnd - Date.now();
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      pauseTime.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(window.pauseCountdownInterval);
        window.pauseCountdownInterval = null;
        window.dismissPauseCountdown?.();
      }
    };

    if (window.pauseCountdownInterval) {
      clearInterval(window.pauseCountdownInterval);
      window.pauseCountdownInterval = null;
    }
    updateCountdown();
    window.pauseCountdownInterval = setInterval(updateCountdown, 1000);
  }

  if (window.pauseTimeout) {
    clearTimeout(window.pauseTimeout);
    window.pauseTimeout = null;
  }

  window.pauseTimeout = setTimeout(() => {
    window.ignoreSyncDuringPause = false;
    window.dismissPauseCountdown?.();
    if (resumeTarget && resumeTarget !== cueId) {
      window.jumpToCueId?.(resumeTarget);
    }
  }, duration);
}

// 🔁 Handles cueRepeat: initiates repeat cycle
export function handleRepeatCue(cueId) {
  const parsed = window.parseRepeatCueId?.(cueId);
  if (!parsed) return;

  const box = document.getElementById("repeat-count-box");
  document.getElementById("playhead")?.classList.add("repeating");
  box?.classList.remove("hidden");
  box?.classList.add("pulse");

  window.repeatStateMap[cueId] = {
    ...parsed,
    currentCount: 1,
    currentlyReversing: parsed.direction === 'r',
    active: true,
    directionMode: parsed.direction,
    lastTriggerTime: 0,
    ready: false,
    initialJumpDone: false,
    busy: false,
  };

  const count = window.repeatStateMap[cueId]?.currentCount || "?";
  console.log(`[REPEAT] ${cueId} → iteration ${count}`);

  setTimeout(() => {
    window.repeatStateMap[cueId].ready = true;
  }, 0);

  window.executeRepeatJump?.(window.repeatStateMap[cueId], cueId).then(() => {
    window.repeatStateMap[cueId].initialJumpDone = true;
  });
}

// 🎯 Handles cueTraverse: triggers animation for object
export function handleTraverseCue(cueId) {
  const config = parseTraverseCueId(cueId);
  if (!config) return;
  const target = document.getElementById(config.objId);
  if (!target) return;

  const dataId = target.getAttribute("data-id");
  if (!dataId?.includes("_t(1)")) return;

  const pending = window.pendingScaleAnimations?.get(dataId) || window.pendingScaleAnimations?.get(config.objId);
  if (pending) pending();
}

// ⚡ Handles cueSpeed: updates playback speed and syncs
export function handleSpeedCue(cueId, newMultiplier) {
  newMultiplier = parseFloat(newMultiplier.toFixed(1));
  if (isNaN(newMultiplier) || newMultiplier <= 0) return;
  if (window.speedMultiplier === newMultiplier) return;

  window.speedMultiplier = newMultiplier;
  window.updateSpeedDisplay?.();

  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN && !window.incomingServerUpdate) {
    const msg = { type: "set_speed_multiplier", multiplier: newMultiplier, timestamp: Date.now() };
    window.socket.send(JSON.stringify(msg));
  }
}

// 🛑 Handles cueStop: halts playback entirely
export function handleStopCue(cueId) {
  window.stopAnimation?.();
  window.isPlaying = false;
  window.togglePlayButton?.();
  console.log("[CLIENT] Playback stopped by cue:", cueId);
}

// 🧭 Handles cueChoice: delayed branch to another cue
export function handleCueChoice(cueId, cueParams) {
  const { choice, dur } = cueParams;
  if (!choice || !dur) return;
  console.log(`[CUE] Will trigger choice: ${cueParams.choice} in ${dur} seconds`);
  setTimeout(() => {
    window.handleCueTrigger?.(choice);
  }, dur * 1000);
}

// 🌐 Handles cueOsc: sends an OSC message to external systems
export function handleOscCue(cueId, cueParams) {
  if (!window.wsEnabled || !window.socket?.readyState === WebSocket.OPEN) return;
  window.socket.send(JSON.stringify({ type: "osc", cueId, params: cueParams }));
}

// 🖼️ Handles cueAnimation: shows SVG animation for a duration
export function handleAnimationCue(cueId, file, duration) {
  const overlay = document.getElementById("animation-overlay");
  const container = document.getElementById("animation-container");
  if (!overlay || !container) return;

  container.innerHTML = "";
  const embed = document.createElement("embed");
  embed.src = file;
  embed.type = "image/svg+xml";
  embed.classList.add("animation-svg");

  container.appendChild(embed);
  overlay.style.display = "flex";
  overlay.style.opacity = "1";

  setTimeout(() => {
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.style.display = "none";
      container.innerHTML = "";
    }, 500);
  }, duration);
}

// 🔊 Handles cueAudio: plays a sound by ID or file
export function handleAudioCue(cueId, cueParams) {
  const audioId = cueParams.choice || cueParams.file || cueId;
  const player = window.audioCues?.[audioId];
  if (!player) {
    console.warn("[AUDIO] No audio player found for cue:", cueId);
    return;
  }

  player.setVolume(cueParams.amp ?? 1);
  if (cueParams.loop) {
    player.setLoop(true);
  }

  console.log(`[AUDIO] Playing audio cue: ${cueId}`);
  console.log(`[VIDEO] Playing video: ${cueParams.choice}`);
  player.play();
}

export function handleP5Cue(cueId, cueParams) {
  const sketch = window.p5Sketches?.[cueParams.choice];
  if (sketch) sketch();
}

// 📽️ Handles cueVideo: plays a video and hides it after
export function handleVideoCue(cueId, cueParams) {
  const player = document.getElementById("video-layer");
  if (!player) return;

  player.src = `video/${cueParams.choice}.mp4`;
  player.style.display = "block";
  console.log(`[AUDIO] Playing audio cue: ${cueId}`);
  console.log(`[VIDEO] Playing video: ${cueParams.choice}`);
  player.play();

  player.onended = () => {
    player.style.display = "none";
    player.src = "";
  };
}

export function resetTriggeredCues() {
  if (window.triggeredCues) window.triggeredCues.clear();
}

export function parseRepeatCueId(cueId) {
  return cueId.split("_");
}

export function parseTraverseCueId(cueId) {
  const params = { cueId, objId: null, triggerable: false };
  const objMatch = cueId.match(/[_-]o\(([^)]+)\)/);
  if (objMatch) params.objId = objMatch[1];
  const triggerMatch = cueId.match(/[_-]t\(([^)]+)\)/);
  if (triggerMatch) params.triggerable = triggerMatch[1] === "1";
  return params.objId ? params : null;
}

// -------------------- Cue Utilities --------------------

export function checkCueTriggers(cueElement, isRemote = false) {
  const cueText = cueElement.textContent?.trim();
  const cueId = cueElement.id;
  if (!cueText || !cueId) return;
  handleCueTrigger(cueText, isRemote);
}

export function parseCueParams(cueId) {
  const lastParenIndex = cueId.lastIndexOf(")");
  const cleaned = lastParenIndex !== -1 ? cueId.slice(0, lastParenIndex + 1) : cueId;

  const typeMatch = cleaned.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const type = typeMatch ? typeMatch[1] : null;
  if (!type) return { type: cueId, cueParams: {}, cleanedId: cleaned };

  const cueParams = {};
  const paramString = cleaned.slice(type.length);
  if (paramString.startsWith("(")) {
    const leading = paramString.match(/^\(([^)]+)\)/);
    if (leading) {
      const raw = leading[1];
      cueParams.choice = isNaN(raw) ? raw : parseFloat(raw);
      parseKeyValueParams(paramString.slice(leading[0].length), cueParams);
    }
  } else {
    parseKeyValueParams(paramString, cueParams);
  }

  return { type, cueParams, cleanedId: cleaned };
}

function parseKeyValueParams(str, cueParams) {
  const regex = /_([a-zA-Z0-9]+)\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    const [, key, value] = match;
    cueParams[key] = isNaN(value) ? value : parseFloat(value);
  }
}

  if (window.triggeredCues) window.triggeredCues.clear();
