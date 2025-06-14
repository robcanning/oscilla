/**
 * oscillaAnimation.js
 * -------------------
 * Core animation module for OscillaScore.
 *
 * This module handles all SVG-based animations including:
 * - Continuous and triggered object rotation (startRotate, startRotation)
 * - Scale animations with sequenced or randomized steps (startScale)
 * - Path-following for obj2path-based motion (animateObjToPath)
 * - IntersectionObserver logic to pause/resume animations based on visibility
 * - Animation registration and trigger handling (initialize*, triggerDeferredAnimations)
 * - Easing, pivot, and compact namespace parsing utilities
 * - OSC transmission of animated object positions (sendObj2PathOsc)
 *
 * Functions are exported as ES module bindings and also attached to `window.*`
 * for backwards compatibility with legacy app.js behavior.
 *
 * Author: Rob Canning
 * License: GNU General Public License v3.0
 * Copyright © 2024–2025 Rob Canning
 *
 * This file is part of the OscillaScore project.
 
 */

function extractUid(id) {
  const match = id.match(/_uid(\d+)/);
  return match ? `uid${match[1]}` : id;
}



window.OSC_ENABLED = true; // master global OSC mute
const rotationLastSent = new Map();

const sendRotationOsc = (angle, id) => {
  if (!window.OSC_ENABLED) return;

  const now = performance.now();
  const throttleRate = window.oscRotationThrottleRate || 20;

  const last = rotationLastSent.get(id) || 0;
  if ((now - last) < (1000 / throttleRate)) return;
  rotationLastSent.set(id, now);

  const animEntry = window.runningAnimations[id];
  if (animEntry && animEntry.visible === false) return;

  const norm = (angle % 360) / 360;
  const radians = (angle % 360) * Math.PI / 180;

  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) return;

window.socket.send(JSON.stringify({
  type: "osc_rotate",
  id,
  uid: extractUid(id),
  angle,
  radians,
  norm,
  timestamp: Date.now()
}));
};



function getStepDurations(id) {
  const dur = extractTagValue(id, 'dur', null);
  const speed = extractTagValue(id, 'speed', 1.0);
  const stepDuration = (dur !== null ? dur : speed) * 1000;

  const tweenRaw = extractTagValue(id, 'tween', null);
  const tween = tweenRaw !== null ? parseFloat(tweenRaw) : 0.2; // default 0.2s
  const tweenDuration = Math.min(stepDuration, tween * 1000);
  const holdDuration = Math.max(0, stepDuration - tweenDuration);

  return { stepDuration, tweenDuration, holdDuration };
}

function addRotationStep(timeline, object, angle, tweenDuration, holdDuration, easing, oscEnabled) {
  if (tweenDuration > 0) {
    timeline.add({
      targets: object,
      rotate: `${angle}deg`,
      duration: tweenDuration,
      easing,
      begin: () => {
        if (oscEnabled) sendRotationOsc((angle + 90) % 360, object.id);
      }
    });
  } else {
    timeline.add({
      targets: object,
      opacity: [1, 1],
      duration: 0,
      begin: () => {
        object.style.transform = `rotate(${angle}deg)`;
        if (oscEnabled) sendRotationOsc((angle + 90) % 360, object.id);
      }
    });
  }

  if (holdDuration > 0) {
    timeline.add({
      targets: object,
      opacity: [1, 1],
      duration: holdDuration
    });
  }
}






/**
 * startRotate(object)
 *
 * Fully merged and complete version.
 * Supports:
 * - ALT mode (pingpong): r(alt[...])
 * - RND mode (randomized): r(rnd[6]), r(rnd[6x,...])
 * - DEG mode (stepped): r(deg[...])
 * - Continuous: r(1)_rpm(...), r(-1)_bpm(...)
 * - BPM/Speed per step, throttle, OSC, transform origin from shape
 * - Trigger-only with _t(1)
 * - TODO support: seq[...] and quant(...)
 */
function startRotate(object) {
  if (!object || !object.id) return;
  const rawId = object.id;
  const dataId = object.getAttribute('data-id');
  const id = dataId || rawId;

  if (id.includes('_t(1)')) {
    window.pendingRotationAnimations = window.pendingRotationAnimations || new Map();
    window.pendingRotationAnimations.set(id, () => startRotate(object));
    console.log(`[rotate] ⏸ Deferred rotation for ${id}`);
    return;
  }

  const easing = getEasingFromId(id);

    const quantized = extractTagValue(id, 'quant', false);
    const bpmClock = window.oscillaQuantBPM || 120;
    const beatMs = 60000 / bpmClock;
    const now = performance.now();
    const quantDelay = quantized ? (beatMs - (now % beatMs)) : 0;

  const oscEnabled = extractTagValue(id, "osc", false);
  const throttleRate = extractTagValue(id, "throttle", window.oscRotationThrottleRate || 20);

  

  // const applyTransformOrigin = () => {
  //   let target = object;
  //   const bbox = object.getBBox?.();

  //   if (bbox && bbox.width > 0 && bbox.height > 0) {
  //     const cx = bbox.x + bbox.width / 2;
  //     const cy = bbox.y + bbox.height / 2;
  //     object.style.transformOrigin = `${cx}px ${cy}px`;
  //   }
  // };

  // // applyTransformOrigin();
  applyPivotFromId(object, id);

  const rMatch = id.match(/^r\(([^)]+)\)/);
  const mode = rMatch ? rMatch[1] : null;
  if (!mode) return;
  
  


// SEQ
// -------------------------------------------
// Executes a sequence of absolute rotation angles.
// Example: r(seq([0,90,180]))_dur(3)_tween(1.2)_ease(2)_x(3)
// Each angle is visited in order with:
//   - `tweenDuration` controlling the rotation time
//   - `holdDuration` controlling pause after arrival
//   - Optional repeat via `_x(N)` where N = number of loops (0 = infinite)
// Notes:
//   - Accepts any angle list (e.g. [0,90,0,120] for gestures or patterns)
//   - Replaces the older deg[...] mode for general use
//   - Uses helper functions:
//     - getStepDurations(id): extracts dur/speed/tween/hold
//     - addRotationStep(...): applies rotation, hold, and OSC
// -------------------------------------------

const seqMatch = mode.match(/^seq\[([^\]]+)\]/);
if (seqMatch) {
  const angles = seqMatch[1]
    .split(',')
    .map((v) => parseFloat(v.trim()))
    .filter((v) => !isNaN(v));

  if (!angles.length) {
    console.warn("[rotate] ⚠️ Invalid or empty seq[...]");
    return;
  }

  const repeatRaw = extractTagValue(id, 'x', null);
  const repeatCount = repeatRaw === null ? 1 : parseInt(repeatRaw); // default = 1, x(0) = infinite

  const { tweenDuration, holdDuration } = getStepDurations(id);


  
  const playSequence = () => {
    const timeline = anime.timeline({ autoplay: true, delay: quantDelay });

    angles.forEach((angle) => {
      addRotationStep(timeline, object, angle, tweenDuration, holdDuration, easing, oscEnabled);
    });

    if (repeatCount === 0) {
      timeline.finished.then(playSequence);
    } else if (repeatCount > 1) {
      timeline.finished.then(() => {
        currentRepeat++;
        if (currentRepeat < repeatCount) playSequence();
      });
    }
  };

  let currentRepeat = 0;
  playSequence();
  return;
}

// RND
// -------------------------------------------
// Generates a new randomized sequence of angles on each cycle.
// Example: r(rnd[6x,45,90])_dur(3)_tween(1.2)_ease(2)
// - 6x: regenerate 6 random angles each time the sequence repeats
// - [min,max]: range of random angle values
//
// Features:
//   - Runtime randomness: values are regenerated per loop
//   - Looping via `x(...)` supported (e.g. _x(0) = infinite)
//   - Uses same tween + hold logic as seq[…]
//
// Notes:
//   - Functionally similar to seq[…], but dynamic
//   - Best for generative and non-deterministic rotation behavior
//   - Internally uses the same timeline structure as seq[…]
// -------------------------------------------

const rndMatch = mode.match(/^rnd\[(\d+)(x)?(?:,(\d+))?(?:,(\d+))?\]$/);
if (rndMatch) {
  const count = parseInt(rndMatch[1]);
  const looped = rndMatch[2] === 'x';
  const min = rndMatch[4] ? parseFloat(rndMatch[3]) : 0;
  const max = rndMatch[4] ? parseFloat(rndMatch[4]) : (rndMatch[3] ? parseFloat(rndMatch[3]) : 359);

  const { tweenDuration, holdDuration } = getStepDurations(id);

  const values = () => {
    return Array.from({ length: count }, () => min + Math.random() * (max - min));
  };

  const playRandomCycle = () => {
    const angles = values();
    if (!angles.length) {
      console.warn("[rotate] ⚠️ No angles generated in rnd[...]");
      return;
    }

    const timeline = anime.timeline({ autoplay: true, delay: quantDelay });

    angles.forEach((angle) => {
      addRotationStep(timeline, object, angle, tweenDuration, holdDuration, easing, oscEnabled);
    });

    if (looped) {
      timeline.finished.then(() => playRandomCycle());
    }
  };

  playRandomCycle();
  return;
}


// ALT
// -------------------------------------------
// Creates continuous alternating rotation between two angles.
// Example: r(alt[0,180])_tween(1.5)_ease(3)
// Internally uses Anime.js `direction: "alternate"` for smooth back-and-forth motion.
//
// Notes:
//   - Equivalent behavior can be replicated with:
//       r(seq([0,180]))_tween(1.5)_x(0)
//   - However, `alt[...]` is more efficient for pure alternation,
//     requires less logic, and serves as convenient shorthand.
//   - Does not support pause/hold at endpoints — use `seq[...]` for that.
// -------------------------------------------

const altMatch = mode.match(/^alt\[([^\]]+)\]/);
if (altMatch) {
  const [min, max] = altMatch[1].split(',').map(Number);
  const { stepDuration, tweenDuration } = getStepDurations(id);

  const anim = anime({
    targets: object,
    rotate: [min, max],
    duration: tweenDuration,
    easing,
    direction: "alternate",
    loop: true,
    autoplay: true,
    update: () => {
      // Fallback to extracting from style if anime.get fails
      let angle = anime.get(object, 'rotate');

      if (typeof angle !== 'number') {
        const match = object.style.transform?.match(/rotate\(([-\d.]+)deg\)/);
        angle = match ? parseFloat(match[1]) : NaN;
      }

      if (typeof angle === 'number' && !isNaN(angle)) {
        // console.log(`[ALT] angle = ${angle.toFixed(2)} deg`);
        if (oscEnabled) {
          sendRotationOsc((angle + 90) % 360, object.id);
        }
      } else {
        console.warn(`[ALT] ⚠️ Unable to retrieve valid angle`);
      }
    }
  });

  return;
}


// CONTINUOUS
// -------------------------------------------
// Applies infinite continuous rotation using the compact r(...) syntax.
// Example: r(rpm(2.5))_dir(1)_ease(3)_osc(1)
// - rpm: rotations per minute (e.g. 2.5 = 2.5 full rotations per minute)
// - bpm: alternative to rpm (interpreted as bpm / 4)
// - dir: 1 = clockwise, -1 = counterclockwise
// - ease: Anime.js easing function
// - osc: if set to 1, sends OSC rotation data continuously
//
// Features:
//   - Continuous smooth spin in either direction
//   - Optional easing and OSC output
//   - Uses Anime.js looped rotation via +=360 or -=360
//
// Notes:
//   - Not cue-based: starts and runs indefinitely once triggered
//   - Use seq[…] or alt[…] if you need stepwise or reversible control
//   - Compatible only with modern compact r(...) rotation syntax
// -------------------------------------------

  const rpm = extractTagValue(id, 'rpm', null);
  const bpm = extractTagValue(id, 'bpm', null);
  const direction = parseInt(extractTagValue(id, 'dir', '1'));
  const rotRpm = bpm ? bpm / 4 : (rpm || 20);
  const duration = (60 / rotRpm) * 1000;

  const anim = anime({
    targets: object,
    rotate: direction >= 0 ? '+=360' : '-=360',
    duration,
    easing,
    loop: true,
    autoplay: true,
    update: () => {
      if (oscEnabled) {
        const angle = parseFloat(object.style.transform?.match(/rotate\(([-\d.]+)deg\)/)?.[1] || 0);
        sendRotationOsc((angle + 90) % 360, object.id);
      }
    }
  });

  window.runningAnimations[object.id] = {
    play: () => anim.play?.(),
    pause: () => anim.pause?.(),
    resume: () => anim.play?.()
  };
}











const startRotation = (object) => {

    console.warn("[rotate] Using legacy startRotation(). Prefer startRotate() with compact syntax.");

    if (!object || !object.id) return;
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;  // Use data-id if present, otherwise fallback to regular id

    // 🕹 Check for triggerable mode
    if (id.includes('_t(1)')) {
      if (!window.pendingRotationAnimations) {
        window.pendingRotationAnimations = new Map();
      }
      console.log(`[rotate] ⏸ Deferred rotation for ${id}`);
      pendingRotationAnimations.set(id, () => startRotation(object));
      return;
    }

    // 🔍 Parse ID parameters
    const rpmMatch = id.match(/_rpm_([\d.]+)/);
    const rpm = rpmMatch ? parseFloat(rpmMatch[1]) : 1.0;

    const directionMatch = id.match(/_dir_(-?\d+)/);
    const direction = directionMatch ? parseInt(directionMatch[1], 10) : 1;

    const pivotXMatch = id.match(/_pivot_x_(-?\d+(\.\d+)?)/);
    const pivotYMatch = id.match(/_pivot_y_(-?\d+(\.\d+)?)/);
    const pivotX = pivotXMatch ? parseFloat(pivotXMatch[1]) : null;
    const pivotY = pivotYMatch ? parseFloat(pivotYMatch[1]) : null;

    const easingMatch = id.match(/_ease_([a-zA-Z0-9_]+)/);
    const easing = easingMatch ? easingMatch[1].replace(/_/g, '-') : 'linear';

    const alternateMatch = id.match(/_alternate_deg_([\d.]+)/);

    // 🎯 Determine transform origin
    if (pivotX !== null && pivotY !== null) {
      object.style.transformOrigin = `${pivotX}px ${pivotY}px`;
    } else {
      const bbox = object.getBBox();
      const centerX = bbox.x + bbox.width / 2;
      const centerY = bbox.y + bbox.height / 2;
      object.style.transformOrigin = `${centerX}px ${centerY}px`;
    }

    const duration = (60 / rpm) * 1000;

    let animeInstance;

    // ↔️ Alternate (pingpong) rotation
    if (alternateMatch) {
      const deg = parseFloat(alternateMatch[1]);
      const start = direction === 0 ? deg : -deg;
      const end = -start;

      animeInstance = anime({
        targets: object,
        keyframes: [
          { rotate: start },
          { rotate: end }
        ],
        duration: duration,
        easing: easing || 'easeInOutSine',
        direction: 'alternate',
        loop: true,
        autoplay: false // Deferred start
      });
    } else {
      // 🔁 Standard continuous rotation
      animeInstance = anime({
        targets: object,
        rotate: direction === 1 ? '+=360' : '-=360',
        duration: duration,
        easing: easing || 'easeInOutSine',
        loop: true,
        autoplay: false // Deferred start
      });
    }

    animeInstance.play();

    // 📦 Register in global runningAnimations map for pause/resume
    window.runningAnimations[object.id] = {
      play: () => animeInstance.play(),
      pause: () => animeInstance.pause(),
      resume: () => animeInstance.play(),
      wasPaused: false
    };

    // console.log(`[DEBUG] Started rotation for ${id}`);
  }
/**
 * startScale(object)
 *
 * Modern-only version supporting:
 * - Compact syntax: s(...), sXY(...), sX(...), sY(...)
 * - Timing: seqdur(...), dur[...], bpm(...), speed(...)
 * - Looping: loop, alternate, once
 * - Pivot control: pivot(...), _pivot_x_, _pivot_y_
 * - OSC support: osc(1), throttle(...) (default 20 Hz)
 * - Triggerable mode: _t(1)
 */
function startScale(object) {
  const rawId = object.id;
  const dataId = object.getAttribute('data-id');
  const id = dataId || rawId;

  const isXY = id.includes("sXY(");
  const isX = id.includes("sX(");
  const isY = id.includes("sY(");
  const prefix = isXY ? "sXY" : isX ? "sX" : isY ? "sY" : "s";

  const easing = getEasingFromId(id);
  const modeRaw = id.match(/_(once|alt|bounce|pulse|pde)/)?.[1] || 'alt';
  const mode = ['pde', 'pulse', 'alt', 'bounce'].includes(modeRaw) ? 'alternate' : 'once';

  const seqDur = extractTagValue(id, 'seqdur', 1);
  const bpm = extractTagValue(id, 'bpm', null);
  const speed = extractTagValue(id, 'speed', null);

  const pivotX = extractTagValue(id, 'pivot_x', null);
  const pivotY = extractTagValue(id, 'pivot_y', null);
  const bbox = object.getBBox();
  const originX = pivotX !== null ? pivotX : bbox.x + bbox.width / 2;
  const originY = pivotY !== null ? pivotY : bbox.y + bbox.height / 2;
  object.style.transformOrigin = `${originX}px ${originY}px`;

  const parsed = parseCompactAnimationValues(id, prefix);
  if (!parsed || !parsed.values || parsed.values.length === 0) {
    console.warn(`[scale] ❌ No valid values parsed for ${id}`);
    return;
  }

  const scaleValues = parsed.values;
  const regenerate = parsed.regenerate;

  const steps = scaleValues.length;
  const durMatch = id.match(/dur\[([\d_,]+)\]/);
  const durParts = durMatch ? durMatch[1].split(',').map(Number) : null;
  const totalWeight = durParts ? durParts.reduce((a, b) => a + b, 0) : steps;
  const baseDur = (seqDur || 1) * 1000;
  const durations = [];

  for (let i = 0; i < steps; i++) {
    const weight = durParts ? durParts[i % durParts.length] : 1;
    durations.push((weight / totalWeight) * baseDur);
  }

  const oscEnabled = extractTagValue(id, 'osc', false);
  const throttleRate = extractTagValue(id, 'throttle', 20);
  let lastOscSent = 0;

  const sendScaleOsc = (scaleX, scaleY) => {
    if (!window.OSC_ENABLED) return;

    const now = performance.now();
    if ((now - lastOscSent) < (1000 / throttleRate)) return;
    lastOscSent = now;
    if (!window.socket || socket.readyState !== WebSocket.OPEN) return;
    const message = {
      type: "osc_scale",
      id: object.id,
      scaleX,
      scaleY,
      timestamp: Date.now()
    };
    window.socket.send(JSON.stringify(message));
  };

  const useXY = isXY || Array.isArray(scaleValues[0]);
  const timeline = anime.timeline({
    targets: object,
    easing,
    loop: mode !== 'once',
    direction: mode === 'alternate' ? 'alternate' : 'normal',
    autoplay: false,
    update: () => {
      if (oscEnabled && mode !== 'once') {
        const matrix = window.getComputedStyle(object).transform;
        if (matrix && matrix !== 'none') {
          const match = matrix.match(/matrix\(([^)]+)\)/);
          if (match) {
            const parts = match[1].split(',').map(parseFloat);
            const currentX = parts[0];
            const currentY = parts[3];
            sendScaleOsc(currentX, currentY);
          }
        }
      }
    }
  });

  for (let i = 0; i < steps; i++) {
    const val = scaleValues[i];
    const scaleX = useXY ? val[0] : isX ? val : val;
    const scaleY = useXY ? val[1] : isY ? val : val;

    timeline.add({
      scaleX,
      scaleY,
      duration: durations[i] || baseDur / steps,
      begin: () => {
        if (oscEnabled && mode === 'once') sendScaleOsc(scaleX, scaleY);
      }
    });
  }

  if (regenerate) {
    timeline.finished.then(() => {
      requestAnimationFrame(() => startScale(object));
    });
  }

  const key = dataId || rawId;
  const isTriggerable = id.includes('_t(1)');
  if (isTriggerable) {
    window.pendingScaleAnimations = window.pendingScaleAnimations || new Map();
    window.pendingScaleAnimations.set(key, () => {
      requestAnimationFrame(() => timeline.play());
    });
  } else {
    timeline.play();
  }

  window.runningAnimations[object.id] = {
    play: () => {
      if (!isTriggerable) timeline.play();
    },
    pause: () => timeline.pause(),
    resume: () => {
      if (!isTriggerable) timeline.play();
    },
    wasPaused: false,
    triggerable: isTriggerable
  };
}




/**
 * Initializes all rotating SVG objects using modern compact syntax.
 * Supports:
 *   - r(...) with deg[], alt[], rnd[], seq[] modes
 *   - _rpm(...), _bpm(...), _dur[...]
 *   - defers `_t(1)` animations via pendingRotationAnimations
 */
function initializeRotatingObjects(svgElement) {
  const rotatingObjects = Array.from(svgElement.querySelectorAll(
    '[id^="obj_rotate_"], [id^="r("], [id^="r_"], ' +
    '[data-id^="obj_rotate_"], [data-id^="r("], [data-id^="r_"]'
  ));

  if (rotatingObjects.length === 0) {
    console.log('[rotate] ⚠️ No rotating objects found.');
    return;
  }

  console.log(`[rotate] Found ${rotatingObjects.length} rotating objects.`);

  rotatingObjects.forEach((object) => {
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;

    if (id.includes('_t(1)')) {
      window.pendingRotationAnimations = window.pendingRotationAnimations || new Map();
      window.pendingRotationAnimations.set(id, () => {
        startRotate(object);
      });
      console.log(`[rotate] ⏸ Deferred rotation stored for ${id}`);
      return;
    }

    // Start immediately
    startRotate(object);
  });
}


function initializeScalingObjects(svgElement) {
  const scalingObjects = Array.from(svgElement.querySelectorAll(
    '[id^="s("], [id^="sXY("], [id^="sX("], [id^="sY("],' +
    '[data-id^="s("], [data-id^="sXY("], [data-id^="sX("], [data-id^="sY("]'
  ));

  if (scalingObjects.length === 0) {
    console.log('[scale] ⚠️ No scaling objects found.');
    return;
  }

  console.log(`[scale] Found ${scalingObjects.length} scaling objects.`);

  scalingObjects.forEach((object) => {
    startScale(object);
  });
}


const initializeObjectPathPairs = (svgElement, speed = 10.0) => {
    const objects = Array.from(svgElement.querySelectorAll(
      '[id^="obj2path-"], [id^="o2p-"], [id^="o2p("],' +
      '[data-id^="obj2path-"], [data-id^="o2p-"], [data-id^="o2p("]'
    ));
    if (objects.length === 0) return;

    const animations = [];

    objects.forEach((object) => {
      const rawId = object.id;
      const id = object.getAttribute('data-id') || rawId;

      console.log(`[SCAN] Checking ${id}`); // 🔍 add this

      if (id.startsWith("o2p(")) {
        console.log(`[MATCH] ID starts with o2p: ${id}`); // 🔍 add this

        const config = window.parseO2PCompact(id);
        if (!config) {
          console.warn(`[o2p] ⚠️ Could not parse compact ID: ${id}`);
          return;
        }

        const path = svgElement.getElementById(config.pathId);
        if (!path) {
          console.warn(`[o2p] ⚠️ No path found with ID: ${config.pathId}`);
          return;
        }

        const easing = typeof config.ease === "string"
          ? config.ease
          : {
            0: 'linear', 1: 'easeInSine', 2: 'easeOutSine', 3: 'easeInOutSine',
            4: 'easeInBack', 5: 'easeOutBack', 6: 'easeInOutBack',
            7: 'easeInElastic', 8: 'easeOutElastic', 9: 'easeInOutElastic'
          }[config.ease] || 'easeInOutSine';

          const playAnimation = () => {
            animateObjToPath(object, path, config.speed, animations, config);
          };

        if (id.includes('_t(1)')) {
          if (!window.pendingPathAnimations) window.pendingPathAnimations = new Map();
          pendingPathAnimations.set(object.id, playAnimation);
          console.log(`[o2p] ⏸️ Deferred animation registered for ${object.id}`);
        } else {
          playAnimation();
        }

        return; // skip legacy logic
      }


      // 🧱 Legacy obj2path/o2p- fallback
      const pathId = rawId
        .replace(/_(speed|spd|s)_\d+(\.\d+)?/, '')
        .replace(/_(direction|dir|d)_\d+/, '')
        .replace(/_(ease|easing|e)_\d+/, '')
        .replace(/^obj2path-/, 'path-')
        .replace(/^o2p-/, 'path-');

      const path = svgElement.getElementById(pathId);
      if (!path) return;

      const playAnimation = () => {
        animateObjToPath(object, path, parseFloat(speed), animations);
      };

      if (id.includes('_t(1)')) {
        if (!window.pendingPathAnimations) window.pendingPathAnimations = new Map();
        pendingPathAnimations.set(object.id, playAnimation);
        console.log(`[obj2path] 🔁 Deferred path animation registered for ${object.id}`);
      } else {
        playAnimation(); // Immediate start
      }
    });

    return animations;
  }

/**
 * ✅ parseO2PCompact
 * ------------------
 * Parses compact object ID strings in the form:
 *   o2p(pathId)_dir(n)_dur(n)_speed(n)_osc(1)_throttle(n)_rotate(0)_ease(n|[...])_quant(1)_t(1)
 *
 * This function extracts configuration for path-following animations,
 * enabling modernized syntax for o2p animations in OscillaScore.
 *
 * Supported Parameters:
 *   - pathId       → required: name of the path (e.g. "path-99")
 *   - dir(n)       → direction mode [0–5], default = 0
 *   - dur(n)       → duration in seconds per loop (preferred over speed)
 *   - speed(n)     → legacy: alternative to dur (in seconds per loop)
 *   - osc(1)       → enable OSC transmission (true/false)
 *   - throttle(n)  → throttle rate for OSC (Hz), default = 10–20
 *   - rotate(0)    → disable rotation along path if 0, otherwise rotate = true
 *   - ease(n) or ease[n,...] → easing style (int or list), resolved later
 *   - quant(1)     → start aligned to BPM clock (true/false)
 *   - t(1)         → trigger-only mode (wait for cue)
 *
 * Example:
 *   o2p(path-7)_dir(1)_dur(3.5)_osc(1)_throttle(30)_rotate(0)_ease(2)_t(1)
 *
 * @param {string} id - The full ID string of the animated object.
 * @returns {object|null} Parsed config object or null if invalid.
 */
function parseO2PCompact(id) {
  const match = id.match(/^o2p\(([^)]+)\)/);
  if (!match) return null;

  const config = {
    pathId: match[1],
    direction: parseInt(extractTagValue(id, "dir", "0")),
    duration: parseFloat(extractTagValue(id, "dur", "0")),  // in seconds
    speed: parseFloat(extractTagValue(id, "speed", "1")),   // fallback if no duration
    osc: extractTagValue(id, "osc", "0") === 1,
    throttle: parseInt(extractTagValue(id, "throttle", "20")),
    rotate: extractTagValue(id, "rotate", "1") !== 0,
    easing: extractTagValue(id, "ease", 3), // 3 = easeInOutSine, default fallback
    quant: extractTagValue(id, "quant", "0") === 1,
    trigger: id.includes("_t(1)")
  };

  return config;
}




//////////////////////////////////////////////////////////////
// OPEN SOUND CONTROL (OSC) for obj2path animations
//////////////////////////////////////////////////////////////

// Map to track last send timestamps per path (throttling)
const oscLastSent = new Map();

/**
 * Sends normalized x/y and angle values for a path animation over OSC
 * via WebSocket to the server.
 *
 * @param {string} pathId - The ID of the path or object
 * @param {number} normX - Normalized X (0–1) based on bounding box
 * @param {number} normY - Normalized Y (0–1)
 * @param {number} angle - Heading angle in degrees
 */
function sendObj2PathOsc(pathId, normX, normY, angle = 0) {
 
  if (!window.OSC_ENABLED) return;

  const now = performance.now();
  const THROTTLE_MS = 100;

  if (oscLastSent.has(pathId) && now - oscLastSent.get(pathId) < THROTTLE_MS) return;
  oscLastSent.set(pathId, now);

  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
    console.warn("[OSC] ⚠️ WebSocket not ready yet. Skipping OSC.");
    return;
  }

  const message = {
    type: "osc_obj2path",
    pathId,
    x: normX,
    y: normY,
    angle
  };

  window.socket.send(JSON.stringify(message));

  console.log(
    `[OSC] 🔄 Sent OSC for ${pathId} → x: ${normX.toFixed(3)}, y: ${normY.toFixed(3)}, angle: ${angle.toFixed(2)} ` +
    `/obj2path/${pathId} ${normX.toFixed(3)} ${normY.toFixed(3)} ${angle.toFixed(2)}`
  );
}



/**
 * emitOSCFromPathProgress
 * -----------------------
 * Given an SVG path and a progress percentage, calculates normalized position
 * and direction angle, then sends the data via OSC using sendObj2PathOsc().
 *
 * @param {object} params
 *   - path: SVGPathElement (must support getTotalLength/getPointAtLength)
 *   - progress: number (0–100)
 *   - pathId: optional string override for the path ID
 */
function emitOSCFromPathProgress({ path, progress, pathId = null }) {
  if (!path || typeof path.getTotalLength !== 'function') return;

  const length = path.getTotalLength();
  const pathProgress = progress / 100;  // Normalize to 0–1
  const point = path.getPointAtLength(pathProgress * length);
  const bbox = path.getBBox();

  const normX = (point.x - bbox.x) / bbox.width;
  const normY = (point.y - bbox.y) / bbox.height;

  const delta = 0.1;
  const ahead = path.getPointAtLength(Math.min(length, pathProgress * length + delta));
  const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);

  // Optional debugging:
  // console.log(`[OSC-debug] normX=${normX.toFixed(2)} normY=${normY.toFixed(2)} angle=${angle.toFixed(2)}`);

  sendObj2PathOsc(pathId || path.id, normX, normY, angle);
}



const animateObjToPath = (object, path, duration, animations = [], config = {}) => {
  console.log("[o2p] Config for", object.id, config);

    if (!Array.isArray(animations)) {
      console.warn(`[WARN] animations param was not an array. Wrapping it. ID: ${object.id}`);
      animations = [];
    }
    
    const effectiveId = object.getAttribute('data-id') || object.id;
    
    const oscEnabled = /_(?:osc|o)\(1\)/.test(effectiveId);

    try {
      const pathMotion = anime.path(path);
      const startPoint = path.getPointAtLength(0);
      const boundingRect = path.getBBox();
      const adjustedX = startPoint.x - boundingRect.x;
      const adjustedY = startPoint.y - boundingRect.y;

      if (['circle', 'ellipse'].includes(object.tagName)) {
        object.setAttribute('cx', adjustedX);
        object.setAttribute('cy', adjustedY);
      } else if (object.tagName === 'rect') {
        const w = object.getBBox().width, h = object.getBBox().height;
        object.setAttribute('x', adjustedX - w / 2);
        object.setAttribute('y', adjustedY - h / 2);
      }

      object.style.transformOrigin = `${adjustedX}px ${adjustedY}px`;

      const speedMatch = effectiveId.match(/_(?:speed|spd|s)_(\d+(\.\d+)?)/);
      let animationSpeed = 1000; // fallback

      if (config && typeof config.duration === 'number' && config.duration > 0) {
        animationSpeed = config.duration * 1000;
      } else if (config && typeof config.speed === 'number' && config.speed > 0) {
        animationSpeed = config.speed * 1000;
      } else if (typeof duration === 'number' && duration > 0) {
        animationSpeed = duration * 1000;
      } else {
        console.warn(`[o2p] ❌ No valid duration/speed for ${object.id}, using fallback 1s`);
      }
      

      let direction = Number.isInteger(config.direction) ? config.direction : 0;

      const rotate = config.rotate === true;
   
   // TODO THIS DOESNT SEEM TO BE WORKING AS EXPECTED

      const easingMap = {
        0: 'linear', 1: 'easeInSine', 2: 'easeOutSine', 3: 'easeInOutSine',
        4: 'easeInBack', 5: 'easeOutBack', 6: 'easeInOutBack',
        7: 'easeInElastic', 8: 'easeOutElastic', 9: 'easeInOutElastic'
      };

      function parseEasingSequence(effectiveId) {
        const match = effectiveId.match(/_(?:ease|easing|e)\(((?:[^\(\)]|\[[^\]]*\])*)\)/);
        if (!match) return ['easeInOutSine'];

        const raw = match[1].trim();

        if (raw.startsWith('r[') && raw.endsWith(']')) {
          const items = raw.slice(2, -1).split(',').map(s => s.trim());
          const chosen = items[Math.floor(Math.random() * items.length)];
          return [ /^\d+$/.test(chosen) ? easingMap[+chosen] || 'easeInOutSine' : chosen ];

        } else if (raw.startsWith('[') && raw.endsWith(']')) {
          return raw.slice(1, -1).split(',').map(s => {
            s = s.trim();
            return /^\d+$/.test(s) ? easingMap[+s] || 'easeInOutSine' : s;
          });

        } else if (/^\d+$/.test(raw)) {
          return [ easingMap[+raw] || 'easeInOutSine' ];

        } else {
          return [ raw ];
        }
      }

    const easingSequence = parseEasingSequence(effectiveId);
    let cycleCount = 0;
    const defaultEasing = easingSequence[0];

    switch (direction) {
      case 0: {
        const easingSequence = parseEasingSequence(effectiveId);
        let cycleCount = 0;

        const anim0 = anime({
          targets: object,
          translateX: pathMotion('x'),
          translateY: pathMotion('y'),
          rotate: rotate ? pathMotion('angle') : 0,
          duration: animationSpeed,
          easing: defaultEasing,
          loop: true,
          direction: 'alternate',

          begin: (anim) => {
            const easing = easingSequence[cycleCount % easingSequence.length];
            anim.animations.forEach(a => a.easing = easing);
            cycleCount++;
          },

          update: (anim) => {
            if (oscEnabled) {
              emitOSCFromPathProgress({
                path,
                progress: anim.progress,
                pathId: path.id
              });
            }
          }

        });

        window.runningAnimations[object.id] = {
          play: () => anim0.play(),
          pause: () => anim0.pause(),
          resume: () => anim0.play(),
          wasPaused: false
        };

        animations.push(anim0);
        break;


              }

        case 1: {
          const anim1 = anime({ targets: object, translateX: pathMotion('x'), 
            translateY: pathMotion('y'), rotate: rotate ? pathMotion('angle') : 0, 
            duration: animationSpeed, easing: defaultEasing,
 loop: true });
          window.runningAnimations[object.id] = { play: () => anim1.play(), pause: () => anim1.pause(), resume: () => anim1.play(), wasPaused: false };
          animations.push(anim1);
          break;
        }

        case 2: {
          const anim2 = anime({ targets: object, translateX: pathMotion('x'), 
            translateY: pathMotion('y'), rotate: rotate ? pathMotion('angle') : 0, duration: animationSpeed, easing: defaultEasing,
 loop: true, direction: 'reverse' });
          window.runningAnimations[object.id] = { play: () => anim2.play(), pause: () => anim2.pause(), resume: () => anim2.play(), wasPaused: false };
          animations.push(anim2);
          break;
        }
        /**
         * 🎯 Case 3 — Random Jump Animation Within Visible Path Segment
         * -------------------------------------------------------------
         * - Animates objects (typically circles or groups) by jumping to a random point
         *   along the visible portion of an assigned path.
         * - Uses Anime.js to animate position via `cx/cy` or `translateX/translateY`.
         * - Each jump occurs after a short animation and continues in a loop.
         * - Objects pause/resume when scrolled off/on screen using IntersectionObserver.
         *
         * ✅ Features:
         * - Initial placement at path start
         * - Visibility-aware sampling of points (SVG-to-screen space conversion)
         * - Integration with observer system (play/pause/resume)
         * - Object can be an <ellipse>, <circle>, or a <g> group wrapper
         *
         * 🧪 Known Issues:
         * - When multiple Case 3 objects are active simultaneously, their animations
         *   interfere, causing erratic jumping or layout glitches.
         * - Positioning via `cx/cy` works reliably when only one object is active.
         * - Using `translateX/Y` avoids some layout bugs but causes object to jump offscreen.
         * - Transform origin logic has been validated and works for other cases.
         *
         * ❌ NOT the Cause:
         * - Not due to observer logic (was disabled and glitch persisted)
         * - Not due to SVG geometry (verified shapes, r/cx/cy set correctly)
         * - Not due to DOM visibility or style (verified display/opacity/transform)
         * - Not due to case logic conflicts (case 5 and 3 operate independently)
         *
         * 📝 TODO:
         * - Investigate **multi-object transform side effects**, especially with groups.
         * - Try dedicated inner wrapper for positioning if in <g>.
         * - Isolate minimal reproducible test with 2 animated objects on same path.
         */
        case 3: {

          // console.warn(`[case3][${object.id}] 🚫 Temporarily disabled`);
          return;

          const pathLength = path.getTotalLength();
          const sampleStep = 10;

          const getVisibleTarget = () => {
            const svg = document.querySelector("svg");
            const screenCTM = svg?.getScreenCTM();
            if (!svg || !screenCTM) {
              console.warn(`[case3][${object.id}] ⚠️ SVG or CTM missing`);
              return null;
            }

            const visible = [];
            const pt = svg.createSVGPoint();
            for (let len = 0; len < pathLength; len += sampleStep) {
              const p = path.getPointAtLength(len);
              pt.x = p.x;
              pt.y = p.y;
              const screenX = pt.matrixTransform(screenCTM).x;
              if (screenX >= 0 && screenX <= window.innerWidth) visible.push(len);
            }

            if (visible.length === 0) return null;
            const chosen = visible[Math.floor(Math.random() * visible.length)];
            return path.getPointAtLength(chosen);
          };

          const JumpController = {
            running: true,
            currentAnim: null,

            placeAtStart() {
              const start = path.getPointAtLength(0);
              const bbox = object.getBBox();
              const centerX = bbox.x + bbox.width / 2;
              const centerY = bbox.y + bbox.height / 2;

              object.removeAttribute("transform");
              object.style.transform = "";
              object.style.transformOrigin = `${centerX}px ${centerY}px`;

              anime.set(object, {
                translateX: start.x - centerX,
                translateY: start.y - centerY
              });

              console.log(`[case3][${object.id}] 🧭 Init at (${start.x.toFixed(1)}, ${start.y.toFixed(1)})`);
            },

            loop() {
              if (!this.running) return;

              const target = getVisibleTarget();
              if (!target) {
                console.warn(`[case3][${object.id}] ❌ No visible point`);
                this.running = false;
                return;
              }

              const bbox = object.getBBox();
              const centerX = bbox.x + bbox.width / 2;
              const centerY = bbox.y + bbox.height / 2;

              object.style.transformOrigin = `${centerX}px ${centerY}px`;

              this.currentAnim = anime({
                targets: object,
                translateX: target.x - centerX,
                translateY: target.y - centerY,
                duration: 1000,
                easing: defaultEasing,
                loop: false,
                complete: () => {
                  if (this.running) this.loop();
                }
              });

              console.log(`[case3][${object.id}] 🚀 Jumping to (${target.x.toFixed(1)}, ${target.y.toFixed(1)})`);
            },

            start() {
              console.log(`[case3][${object.id}] ▶️ Starting`);
              this.running = true;
              this.placeAtStart();
              this.loop();
            },

            pause() {
              this.running = false;
              if (this.currentAnim) this.currentAnim.pause();
            },

            resume() {
              if (!this.running) {
                this.running = true;
                this.loop();
              }
            }
          };

          JumpController.start();

          window.runningAnimations[object.id] = {
            play: () => JumpController.resume(),
            pause: () => JumpController.pause(),
            resume: () => JumpController.resume(),
            wasPaused: true,
            autoStart: true
          };

          observer.observe(object);
          break;
        }


        case 4: {
          const pathLen = path.getTotalLength();
          const fixedNodes = Array.from({ length: 5 }, (_, i) => path.getPointAtLength((i / 4) * pathLen));
          const getRandom = arr => arr[Math.floor(Math.random() * arr.length)];

          const controller4 = {
            running: true,
            timer: null,
            jump() {
              if (!this.running) return;
              const point = getRandom(fixedNodes);
              const anim4 = anime({
                targets: object,
                translateX: point.x,
                translateY: point.y,
                rotate: rotate ? pathMotion('angle') : 0,
                duration: getRandom([2000, 3000, 5000, 8000, 13000]),
                easing: defaultEasing,
                autoplay: false,
                complete: () => this.timer = setTimeout(() => this.jump(), getRandom([1000, 2000, 3000, 4000]))
              });
              window.runningAnimations[object.id] = { play: () => anim4.play(), pause: () => anim4.pause(), resume: () => anim4.play(), wasPaused: false };
              observer.observe(object);
              anim4.play();
            },
            pause() { this.running = false; clearTimeout(this.timer); },
            resume() { if (!this.running) { this.running = true; this.jump(); } }
          };

          controller4.jump();
          break;
        }

        case 5: // Smoothly Animate Between Path Start Points with Ghost Leading

          // console.log(`[DEBUG] Initializing Case 5: Animating between precomputed path variants for object ${object.id}`);

          // Get the original path ID dynamically
          const originalPathID = path.id;

          // Extract basePathID while keeping the main path intact
          const basePathIDMatch = originalPathID.match(/^(path-\d+)/);
          const basePathID = basePathIDMatch ? basePathIDMatch[1] : originalPathID; // Use full ID if no match

          // console.log(`[DEBUG] Original Path ID: ${originalPathID}`);
          // console.log(`[DEBUG] Base Path ID (for variant lookup): ${basePathID}`);

          // Retrieve precomputed path variants
          const case5Paths = [...(window.pathVariantsMap[basePathID] || [])];

          if (!case5Paths.some(p => p.id === originalPathID)) {
            case5Paths.unshift(path);
            // console.log(`[DEBUG] Added original path '${object.id}' to variant list.`);
          }

          // console.log(`[DEBUG] Found ${case5Paths.length} total paths for '${basePathID}'.`);

          if (case5Paths.length < 2) {
            // console.warn("[DEBUG] Not enough valid path variants detected for Case 5. Aborting.");
            break;
          }

          const case5StartPositions = case5Paths.map(path => path.getPointAtLength(0));
          const case5PauseDurations = [3000, 5000, 8000, 13000, 21000, 34000];
          const animationDuration = 2000;

          let nextTargetPosition = null; // Stores the next position so the object can follow it

          // **Find the ghost object based on the main object's ID**
          const baseObjectID = object.getAttribute('id') || object.id;
          const ghostID = `ghost-${baseObjectID.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
          let ghostObject = document.getElementById(ghostID);

          // **If ghost object exists, reset only its location-related attributes**
          if (ghostObject) {
            // console.log(`[DEBUG] Resetting ghost object '${ghostID}' location.`);
            ghostObject.removeAttribute("transform");
            ghostObject.removeAttribute("cx");
            ghostObject.removeAttribute("cy");
          } else {
            // console.warn(`[DEBUG] Ghost object '${ghostID}' not found. Creating it.`);
            ghostObject = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            ghostObject.setAttribute("id", ghostID);
            ghostObject.setAttribute("r", "10");
            ghostObject.setAttribute("fill", "rgba(0,0,255,0.5)");
            ghostObject.setAttribute("stroke", "blue");
            ghostObject.setAttribute("stroke-width", "2");
            window.scoreSVG.appendChild(ghostObject);
          }

          // **Create a countdown text next to the ghost**
          let countdownText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          countdownText.setAttribute("id", `${ghostID}-countdown`);
          countdownText.setAttribute("fill", "red");
          countdownText.setAttribute("stroke", "red");
          countdownText.setAttribute("stroke-width", "1");
          countdownText.setAttribute("font-size", "56");
          countdownText.setAttribute("text-anchor", "middle");
          window.scoreSVG.appendChild(countdownText);

          // Optional: test label
          let testText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          testText.setAttribute("id", `${object.id}-test-label`);
          testText.setAttribute("fill", "black");
          testText.setAttribute("stroke", "black");
          testText.setAttribute("stroke-width", "1");
          testText.setAttribute("font-size", "46");
          testText.setAttribute("text-anchor", "middle");
          window.scoreSVG.appendChild(testText);
          testText.textContent = "TEST"; // Set text content

          /**
           * Case 5 Controller — Ghost-following randomized path jumper
           *
           * Controls a "ghost" SVG object that jumps between random precomputed path positions,
           * along with a synchronized countdown indicator and the actual animated object.
           *
           * This version is fully observer-aware:
           *   - Ghost is registered with window.runningAnimations[ghostID]
           *   - Ghost is paused/resumed based on visibility
           *   - The main object follows the ghost after randomized delays
           *   - Countdown text is updated on screen and cleared cleanly
           */

          const Case5Controller = {
            object,
            ghost: ghostObject,
            countdown: countdownText,
            initialized: false,
            running: true,
            loopTimeout: null,
            countdownInterval: null,

            loop() {
              if (!this.running) return;

              // Select new random position from precomputed variant start points
              nextTargetPosition = case5StartPositions[Math.floor(Math.random() * case5StartPositions.length)];
              const case5PauseDuration = case5PauseDurations[Math.floor(Math.random() * case5PauseDurations.length)];
              const case5PauseSeconds = Math.round(case5PauseDuration / 1000);

              // Animate ghost to new position
              anime({
                targets: this.ghost,
                cx: nextTargetPosition.x,
                cy: nextTargetPosition.y,
                duration: animationDuration,
                easing: defaultEasing,
              });

              // ✅ Align main object immediately on first loop
              if (!this.initialized) {
                anime({
                  targets: this.object,
                  translateX: nextTargetPosition.x,
                  translateY: nextTargetPosition.y,
                  duration: 1,
                  easing: 'linear'
                });
                this.initialized = true;
              }


              // Move and update countdown text
              this.countdown.setAttribute("x", nextTargetPosition.x);
              this.countdown.setAttribute("y", nextTargetPosition.y - 75);
              this.countdown.textContent = `${case5PauseSeconds}`;

              let remainingTime = case5PauseDuration / 1000;
              this.countdownInterval = setInterval(() => {
                remainingTime -= 1;
                this.countdown.textContent = `${remainingTime}`;
                if (remainingTime <= 0) {
                  clearInterval(this.countdownInterval);
                  this.countdown.textContent = "";
                }
              }, 1000);

              // After delay, move main object to ghost's position
              this.loopTimeout = setTimeout(() => {
                anime({
                  targets: this.object,
                  translateX: nextTargetPosition.x,
                  translateY: nextTargetPosition.y,
                  duration: animationDuration,
                  easing: defaultEasing,
                  complete: () => {
                    if (this.running) this.loop();
                  }
                });

                anime({
                  targets: this.countdown,
                  x: nextTargetPosition.x,
                  y: nextTargetPosition.y - 75,
                  duration: animationDuration,
                  easing: defaultEasing,
                });

              }, case5PauseDuration);
            },

            pause() {
              this.running = false;
              clearTimeout(this.loopTimeout);
              clearInterval(this.countdownInterval);
            },

            resume() {
              if (!this.running) {
                this.running = true;
                this.loop();
              }
            }
          };

          // 🔁 Start the initial loop
          Case5Controller.loop();

          // ✅ Register main controller
          window.runningAnimations[object.id] = Case5Controller;

          // ✅ Register ghost object with visibility-based control logic
          window.runningAnimations[ghostID] = {
            play: () => {
              if (!Case5Controller.running) Case5Controller.resume();
            },
            pause: () => {
              if (Case5Controller.running) Case5Controller.pause();
            },
            wasPaused: false
          };

          // ✅ Optionally register countdown text to ensure observer doesn't throw errors
          window.runningAnimations[`${ghostID}-countdown`] = {
            play: () => { },
            pause: () => { },
            wasPaused: false
          };

          // ✅ Observe both the main object and ghost for visibility-based control
          observer.observe(object);
          observer.observe(ghostObject);


          console.warn(`[DEBUG] Fallback pingpong animation created for object ${object.id}`);
      }
    } catch (error) {
      console.error(`[DEBUG] Error animating object ${object.id} along path ${path.id}: ${error.message}`);
    }
  }

function extractTagValue(id, tag, fallback = null) {
    const parenMatch = id.match(new RegExp(`${tag}\\(([^)]+)\\)`));
    const underscoreMatch = id.match(new RegExp(`${tag}_(\\d+(\\.\\d+)?)`));

    if (parenMatch) return isNaN(Number(parenMatch[1])) ? parenMatch[1] : parseFloat(parenMatch[1]);
    if (underscoreMatch) return isNaN(Number(underscoreMatch[1])) ? underscoreMatch[1] : parseFloat(underscoreMatch[1]);

    return fallback;
  }

function getEasingFromId(id) {
    const easeMap = {
      '0': 'linear', '1': 'easeInSine', '2': 'easeOutSine', '3': 'easeInOutSine',
      '4': 'easeInBack', '5': 'easeOutBack', '6': 'easeInOutBack',
      '7': 'easeInElastic', '8': 'easeOutElastic', '9': 'easeInOutElastic'
    };

    const easeListMatch = id.match(/ease\[(.*?)\]/);
    const easeParenMatch = id.match(/ease\((\d+)\)/);
    const easeUnderscoreMatch = id.match(/_ease_(\d+)/);

    if (easeListMatch) {
      const options = easeListMatch[1].split(',').map(v => easeMap[v.trim()]).filter(Boolean);
      if (options.length) return () => options[Math.floor(Math.random() * options.length)];
    }
    const code = easeParenMatch?.[1] || easeUnderscoreMatch?.[1];
    return easeMap[code] || 'linear';
  }

  function applyPivotFromId(object, id) {
    const bbox = object.getBBox();
    const pivotMatch = id.match(/pivot\(([^,]+),([^)]+)\)/);
    const pxRaw = extractTagValue(id, 'pivot_x', null);
    const pyRaw = extractTagValue(id, 'pivot_y', null);
  
    let px = pivotMatch ? parseFloat(pivotMatch[1].trim()) : pxRaw;
    let py = pivotMatch ? parseFloat(pivotMatch[2].trim()) : pyRaw;
  
    if (px === null || py === null || isNaN(px) || isNaN(py)) {
      setTransformOriginToCenter(object);
      return;
    }
  
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
  
    const finalX = centerX + px;
    const finalY = centerY + py;
  
    object.style.transformOrigin = `${finalX}px ${finalY}px`;
  }
  

function setTransformOriginToCenter(element) {
    const bbox = element.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    element.style.transformOrigin = `${cx}px ${cy}px`;
  }





  function parseCompactAnimationValues(id, prefix = 's') {
    // Only accept new format: s(...), sXY(...), etc.
    const parenMatch = id.match(new RegExp(`${prefix}\\((.*?)\\)`));
    if (!parenMatch) {
      console.warn(`[parseCompact] ❌ Expected ${prefix}(...) but not found in: ${id}`);
      return null;
    }
  
    const raw = parenMatch[1].trim();
  
    // ✅ Regenerating random: s(rnd(5x0.5-1.5x)) or r(rnd[6x,45,90])
    if (raw.startsWith('rnd(') && raw.endsWith(')')) {
      const inner = raw.slice(4, -1);
  
      // pattern: 5x0.5-1.5x
      const miniMatch = inner.match(/^(\d+)x(\d+(?:\.\d+)?)[-_](\d+(?:\.\d+)?)(x?)$/);
      if (miniMatch) {
        const count = parseInt(miniMatch[1]);
        const min = parseFloat(miniMatch[2]);
        const max = parseFloat(miniMatch[3]);
        const regen = miniMatch[4] === 'x';
        const generate = () => Array.from({ length: count }, () => min + Math.random() * (max - min));
        return { values: generate(), regenerate: regen, generate };
      }
  
      // fallback: explicit list inside rnd(...)
      const values = inner.split(',').map(Number).filter(n => !isNaN(n));
      const generate = () => values.sort(() => Math.random() - 0.5);
      return { values: generate(), regenerate: true, generate };
    }
  
    // ✅ JSON-style values: [1,2,1] or [[1,1],[2,1]]
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { values: parsed, regenerate: false };
      }
    } catch (e) {
      // fallback below
    }
  
    // ✅ Fallback: single numeric value (e.g., deg(45), dur(5), s(1.2))
    const singleValue = parseFloat(raw);
    if (!isNaN(singleValue)) {
      return { values: [singleValue], regenerate: false };
    }
  
    console.warn(`[parseCompact] ❌ Could not parse values from ${prefix}(...) in: ${id}`);
    return null;
  }
  

/**
 * ✅ checkAnimationVisibility
 * Loops through all running animations and pauses/resumes based on visibility.
 * Uses bounding box checks to determine if the element is on screen.
 */
function checkAnimationVisibility() {
  Object.entries(window.runningAnimations || {}).forEach(([id, instance]) => {
    const el = document.getElementById(id);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const isVisible = (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );

    if (isVisible) {
      if (instance.wasPaused) {
        if (typeof instance.resume === "function") instance.resume();
        else if (typeof instance.play === "function") instance.play();
        instance.wasPaused = false;
      }
    } else {
      if (!instance.wasPaused) {
        if (typeof instance.pause === "function") instance.pause();
        instance.wasPaused = true;
      }
    }
  });
}


/**
 * ✅ initializeObserver
 * Creates an IntersectionObserver to auto-pause/resume animations when objects enter or leave the viewport.
 */
function initializeObserver() {
  if (window.observer) window.observer.disconnect();

  window.observer = new IntersectionObserver((entries) => {
    if (window.disableObserver) return;

    for (const entry of entries) {
      const el = entry.target;
      const id = el.id;
      const instance = window.runningAnimations?.[id];
      if (!instance) continue;

      if (entry.isIntersecting) {
        if (instance.wasPaused || instance.autoStart) {
          if (typeof instance.resume === "function") instance.resume();
          else if (typeof instance.play === "function") instance.play();
          instance.wasPaused = false;
          instance.autoStart = false;
        }
      } else {
        if (typeof instance.pause === "function") instance.pause();
        instance.wasPaused = true;
      }
    }
  }, {
    root: null,
    threshold: 0.01,
    rootMargin: "0px"
  });

  // Attach observer to all known running animations
  Object.entries(window.runningAnimations || {}).forEach(([id]) => {
    const el = document.getElementById(id);
    if (el) window.observer.observe(el);
  });

  // Initial check on animation state
  requestAnimationFrame(() => {
    checkAnimationVisibility();
  });
}







/**
 * Triggers any deferred animation attached to a short object ID via `data-id`.
 * Typically used by cue_traverse or cueChoice with triggerable animations.
 *
 * @param {string} objectId - The ID of the visible short object
 */
function triggerDeferredAnimations(objectId) {
  const el = document.getElementById(objectId);
  if (!el) {
    console.warn(`[triggerDeferredAnimations] ⚠️ No element found for ID: ${objectId}`);
    return;
  }

  const targetId = el.getAttribute("data-id");
  if (!targetId) {
    console.warn(`[triggerDeferredAnimations] ❌ No data-id found on ${objectId}`);
    return;
  }

  const targetEl = document.getElementById(targetId);
  if (!targetEl) {
    console.warn(`[triggerDeferredAnimations] ❌ No element with ID ${targetId} found.`);
    return;
  }

  if (window.runningAnimations?.[targetId]) {
    console.log(`[triggerDeferredAnimations] ▶️ Starting animation for ${targetId}`);
    window.runningAnimations[targetId].play?.();
  } else {
    console.warn(`[triggerDeferredAnimations] ❓ No registered animation for ${targetId}`);
  }
}





export { initializeRotatingObjects, initializeScalingObjects };
window.initializeRotatingObjects = initializeRotatingObjects;
window.initializeScalingObjects = initializeScalingObjects;

export { parseO2PCompact };
window.parseO2PCompact = parseO2PCompact;

export { checkAnimationVisibility, initializeObserver };
window.checkAnimationVisibility = checkAnimationVisibility;
window.initializeObserver = initializeObserver;

export { startRotate };
window.startRotate = startRotate;
export { startRotation };
window.startRotation = startRotation;
export { startScale };
window.startScale = startScale;
export { initializeObjectPathPairs };
window.initializeObjectPathPairs = initializeObjectPathPairs;
export { animateObjToPath };
window.animateObjToPath = animateObjToPath;
export { extractTagValue };
window.extractTagValue = extractTagValue;
export { getEasingFromId };
window.getEasingFromId = getEasingFromId;
export { applyPivotFromId };
window.applyPivotFromId = applyPivotFromId;
export { setTransformOriginToCenter };
window.setTransformOriginToCenter = setTransformOriginToCenter;
export { parseCompactAnimationValues };
window.parseCompactAnimationValues = parseCompactAnimationValues;
export { emitOSCFromPathProgress };
window.emitOSCFromPathProgress = emitOSCFromPathProgress;
export { sendObj2PathOsc };
window.sendObj2PathOsc = sendObj2PathOsc;