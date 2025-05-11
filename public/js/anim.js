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


function startRotate(object) {
    if (!object || !object.id) return;
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;  // Use data-id if present, otherwise fallback to regular id

    // 🛑 Triggerable mode: store and wait for cue
    if (id.includes('_t(1)')) {
      if (!window.pendingRotationAnimations) window.pendingRotationAnimations = new Map();
      pendingRotationAnimations.set(id, () => startRotate(object));
      console.log(`[rotatest] ⏸ Deferred rotation for ${id}`);
      return;
    }

    console.log(`[rotatest] Dispatching startRotate for ${id}`);
    const easing = getEasingFromId(id);

    // 1. ALT (pingpong) mode
    const altMatch = id.match(/alt\(([^)]+)\)/);
    if (altMatch) {
      const altAngle = parseFloat(altMatch[1]);
      const dir = extractTagValue(id, 'dir', 1);
      const speed = extractTagValue(id, 'speed', 1.0);
      applyPivotFromId(object, id);

      console.log(`[rotatest] ALT mode → angle=${altAngle}, dir=${dir}, speed=${speed}, easing=${easing}`);

      const anim = anime({
        targets: object,
        keyframes: [
          { rotate: `${dir >= 0 ? altAngle : -altAngle}deg` },
          { rotate: `${dir >= 0 ? -altAngle : altAngle}deg` }
        ],
        duration: speed * 1000,
        easing: typeof easing === 'function' ? easing() : easing,
        direction: 'alternate',
        loop: true,
        autoplay: true
      });

      window.runningAnimations[object.id] = {
        play: () => anim.play?.(),
        pause: () => anim.pause?.(),
        resume: () => anim.play?.(),
        wasPaused: false
      };
      return;
    }

    // 2. Step rotation via deg[]
    const degParsed = parseCompactAnimationValues(id, 'deg');

    // 3. Continuous rotation fallback
    if (!degParsed) {
      const rpm = extractTagValue(id, 'rpm', 1.0);
      const direction = extractTagValue(id, 'dir', 1);
      applyPivotFromId(object, id);

      const duration = (60 / rpm) * 1000;
      console.log(`[rotatest] CONTINUOUS mode → rpm=${rpm}, dir=${direction}, duration=${duration}ms, easing=${easing}`);

      const anim = anime({
        targets: object,
        rotate: direction >= 0 ? '+=360' : '-=360',
        duration: duration,
        easing: typeof easing === 'function' ? easing() : easing,
        loop: true,
        autoplay: true
      });

      window.runningAnimations[object.id] = {
        play: () => anim.play?.(),
        pause: () => anim.pause?.(),
        resume: () => anim.play?.(),
        wasPaused: false
      };
      return;
    }

    // 🔁 deg[...] timeline
    if (degParsed.values.length < 2) return;
    let angleValues = degParsed.values;

    const durParsed = parseCompactAnimationValues(id, 'dur');
    let pauseDurations = durParsed?.durations || [];
    const hasRegenerate = durParsed?.regenerate;
    if (hasRegenerate) object.__regenerateDurations = durParsed.generate;

    const seqDur = extractTagValue(id, 'seqdur', null);
    const rotationSpeed = extractTagValue(id, 'speed', null);

    let baseDur;
    if (seqDur) {
      baseDur = (seqDur * 1000) / (angleValues.length - 1);
      console.log(`[rotatest] Using seqdur: ${seqDur}s → step duration: ${baseDur}ms`);
    } else {
      baseDur = (rotationSpeed || 0.5) * 1000;
      console.log(`[rotatest] Using speed: ${rotationSpeed || 0.5}s → step duration: ${baseDur}ms`);
    }

    applyPivotFromId(object, id);

    const buildTimeline = (initialAngle = null) => {
      let angles = angleValues;

      if (initialAngle !== null && typeof degParsed.generate === 'function') {
        angles = [initialAngle, ...degParsed.generate()];
        angleValues = angles;
      }

      const timeline = anime.timeline({
        targets: object,
        loop: false,
        autoplay: true
      });

      for (let i = 0; i < angles.length; i++) {
        const angle = angles[i];
        const currentEasing = typeof easing === 'function' ? easing() : easing;
        timeline.add({
          rotate: `${angle}deg`,
          duration: baseDur,
          easing: currentEasing
        });

        if (i < angles.length - 1) {
          const pauseSec = pauseDurations[i % pauseDurations.length] || 1.0;
          timeline.add({ duration: pauseSec * 1000 });
        }
      }

      timeline.finished.then(() => {
        if (hasRegenerate && object.__regenerateDurations) {
          pauseDurations = object.__regenerateDurations();
        }
        const currentTransform = object.style.transform || '';
        const match = currentTransform.match(/rotate\(([-\d.]+)deg\)/);
        const lastAngle = match ? parseFloat(match[1]) : angles[angles.length - 1];
        buildTimeline(lastAngle);
      });
    };

    buildTimeline();
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
        easing: easing,
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
        easing: easing,
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

const startScale = (object) => {
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;
    // console.log(`[scale] 🟡 Starting scale animation for ${object.id} (parsed id: ${id})`);

    const easeMap = {
      '0': 'linear', '1': 'easeInSine', '2': 'easeOutSine', '3': 'easeInOutSine',
      '4': 'easeInBack', '5': 'easeOutBack', '6': 'easeInOutBack',
      '7': 'easeInElastic', '8': 'easeOutElastic', '9': 'easeInOutElastic'
    };

    const seqDur = extractTagValue(id, 'seqdur', null);
    const easingCode = id.match(/ease_?(\d)/)?.[1];
    const easing = easeMap[easingCode] || 'linear';
    const modeRaw = id.match(/_(once|alt|bounce|pulse|pde)/)?.[1] || 'alt';
    const mode = ['pde', 'pulse', 'alt', 'bounce'].includes(modeRaw) ? 'alternate' : 'once';

    const pivotX = extractTagValue(id, 'pivot_x', null);
    const pivotY = extractTagValue(id, 'pivot_y', null);
    const bbox = object.getBBox();
    const originX = pivotX !== null ? pivotX : bbox.x + bbox.width / 2;
    const originY = pivotY !== null ? pivotY : bbox.y + bbox.height / 2;
    object.style.transformOrigin = `${originX}px ${originY}px`;

    const isXY = id.includes("sXY[");
    const isX = id.includes("sX[");
    const isY = id.includes("sY[");
    const compactPrefix = isXY ? "sXY" : isX ? "sX" : isY ? "sY" : "s";

    // console.log(`[parseCompact] 🧪 Trying parseCompactAnimationValues(${compactPrefix}): ${id}`);
    let scaleParsed = parseCompactAnimationValues(id, compactPrefix);
    let scaleValues = [];

    // ✅ Handle compact animation values
    if (scaleParsed) {
      scaleValues = scaleParsed.values;
      if (scaleParsed.regenerate) {
        object.__regenerateScaleSeq = scaleParsed.generate;
        scaleValues = scaleParsed.generate(); // Initial random set
        // console.log(`[scale] 🔁 Generated random scale values:`, scaleValues);
      }
    }

    // ✅ Legacy fallback for s_seq_...
    if (scaleValues.length === 0) {
      // console.log(`[fallback] ⏳ Trying legacy s_seq_ fallback: ${id}`);
      const legacyMatch = id.match(/s(?:eq)?_([\d._]+)/);
      if (legacyMatch) {
        scaleValues = legacyMatch[1].split('_').map(n => parseFloat(n)).filter(n => !isNaN(n));
        // console.log(`[fallback] ✅ Parsed legacy scale values:`, scaleValues);
      }
    }

    // ✅ Sanity check
    scaleValues = scaleValues.map(val => {
      if (typeof val === 'number') return val;
      if (Array.isArray(val)) return val;
      const num = parseFloat(val);
      return isNaN(num) ? 1 : num;
    });

    if (scaleValues.length === 0) {
      console.warn(`[scale] ❌ No valid scale values found for ${id}`);
      return;
    }

    const useXY = isXY || Array.isArray(scaleValues[0]);
    const steps = scaleValues.length;

    const durMatch = id.match(/dur_((?:\d+_?)+)/);
    const durParts = durMatch ? durMatch[1].split('_').map(Number) : null;
    const totalWeight = durParts ? durParts.reduce((a, b) => a + b, 0) : steps;
    const baseDur = (seqDur || 1) * 1000;
    const durations = [];

    for (let i = 0; i < steps; i++) {
      const weight = durParts ? durParts[i % durParts.length] : 1;
      durations.push((weight / totalWeight) * baseDur);
    }

    const timeline = anime.timeline({
      targets: object,
      easing: easing,
      loop: mode !== 'once',
      direction: mode === 'alternate' ? 'alternate' : 'normal',
      autoplay: false
    });

    // ✅ Add each step to the timeline
    for (let i = 0; i < steps; i++) {
      const val = scaleValues[i];
      const scaleX = useXY ? val[0] : isX ? val : val;
      const scaleY = useXY ? val[1] : isY ? val : val;

      timeline.add({
        scaleX,
        scaleY,
        duration: durations[i] || baseDur / steps,
        begin: () => console.log(`[scale] Step ${i} → scaleX(${scaleX}) scaleY(${scaleY})`)
      });
    }

    // ✅ Regenerate entire loop on finish
    if (object.__regenerateScaleSeq) {
      timeline.finished.then(() => {
        const newValues = object.__regenerateScaleSeq();
        // console.log(`[scale] 🔁 Regenerated scale sequence:`, newValues);
        requestAnimationFrame(() => startScale(object)); // full restart
      });
    }

    const key = dataId || rawId;
    const isTriggerable = id.includes('_t(1)');

    if (isTriggerable) {
      if (!window.pendingScaleAnimations) window.pendingScaleAnimations = new Map();
      pendingScaleAnimations.set(key, () => {
        console.log(`[scale] 🔴 timeline.play() called for ${key}`);
        requestAnimationFrame(() => timeline.play());
      });
      console.log(`[scale] Deferred scale stored for ${key}`);
    } else {
      timeline.play();
    }

    // ✅ Register animation hooks
    window.runningAnimations[object.id] = {
      play: () => {
        if (isTriggerable) {
          console.log(`[scale] 🚫 Skipping auto-play for triggerable ${object.id}`);
          return;
        }
        timeline.play();
      },
      pause: () => timeline.pause(),
      resume: () => {
        if (isTriggerable) {
          console.log(`[scale] 🚫 Skipping resume for triggerable ${object.id}`);
          return;
        }
        timeline.play();
      },
      wasPaused: false,
      triggerable: isTriggerable
    };
  }



/**
 * Initializes all rotating SVG objects using both legacy and modern ID formats.
 * Supports triggerable animations via `_t(1)`, and deferred execution via pendingRotationAnimations.
 */
function initializeRotatingObjects(svgElement) {
  const rotatingObjects = Array.from(svgElement.querySelectorAll(
    '[id^="obj_rotate_"], [id^="r_"], [id*="deg["], ' +
    '[data-id^="obj_rotate_"], [data-id^="r_"], [data-id*="deg["]'
  ));

  if (rotatingObjects.length === 0) {
    console.log('[DEBUG] No rotating objects found.');
    return;
  }

  console.log(`[DEBUG] Found ${rotatingObjects.length} rotating objects.`);

  rotatingObjects.forEach((object) => {
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;

    if (id.includes('_t(1)')) {
      if (!window.pendingRotationAnimations) window.pendingRotationAnimations = new Map();
      window.pendingRotationAnimations.set(id, () => {
        if (id.includes('deg[') || id.includes('alt(') || id.includes('rpm(')) {
          startRotate(object); // Modern rotation
        } else {
          startRotation(object); // Legacy rotation
        }
      });
      console.log(`[DEBUG] Deferred rotation stored for ${id}`);
      return;
    }

    if (id.includes('deg[') || id.includes('alt(') || id.includes('rpm(')) {
      startRotate(object); // Modern
    } else {
      startRotation(object); // Legacy
    }
  });
}

/**
 * Initializes all scaling SVG objects using legacy and compact syntax.
 * Defers triggerable animations via `_t(1)` and stores them in pendingScaleAnimations.
 */
function initializeScalingObjects(svgElement) {
  const scalingObjects = Array.from(svgElement.querySelectorAll(
    '[id^="scale"], [id^="s_"], [id^="sXY_"], [id^="sX_"], [id^="sY_"],' +
    '[id*="s["], [id*="sXY["], [id*="sX["], [id*="sY["],' +
    '[data-id*="s["], [data-id*="sXY["], [data-id*="sX["], [data-id*="sY["],' +
    '[data-id^="s_seq"], [data-id^="sXY_seq"]'
  ));

  if (scalingObjects.length === 0) {
    // console.log('[DEBUG][scale] No scaling objects found.');
    return;
  }

  // console.log(`[DEBUG][scale] Found ${scalingObjects.length} scaling objects.`);

  scalingObjects.forEach((object) => {
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;

    startScale(object); // Always call; startScale handles `_t(1)` logic internally
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
          animateObjToPath(object, path, config.speed, [], true, easing, config.osc);
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
 * Parses object ID strings like o2p(pathId)_dir(1)_speed(2)_osc(1)_t(1)
 * into a config object usable by animateObjToPath().
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
    speed: parseFloat(extractTagValue(id, "speed", "1")),
    osc: extractTagValue(id, "osc", "0") === 1,
    trigger: id.includes("_t(1)")
  };

  return config;
}



//////////////////////////////////////////////////////////////
// OPEN SOUND CONTROL (OSC) for obj2path animations
//////////////////////////////////////////////////////////////

// Toggle: globally enable or disable OSC transmission
window.ENABLE_OBJ2PATH_OSC = false;

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
  if (!window.ENABLE_OBJ2PATH_OSC) return;

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



const animateObjToPath = (object, path, duration, animations) => {

    if (!Array.isArray(animations)) {
      console.warn(`[WARN] animations param was not an array. Wrapping it. ID: ${object.id}`);
      animations = [];
    }
    const effectiveId = object.getAttribute('data-id') || object.id;

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
      const animationSpeed = speedMatch ? parseFloat(speedMatch[1]) * 1000 : duration * 1000;

      const directionMatch = effectiveId.match(/_(?:direction|dir|d)_(\d+)/);
      let direction = directionMatch ? parseInt(directionMatch[1], 10) : 0;

      if (![0, 1, 2, 3, 4, 5].includes(direction)) direction = 0;

      const rotate = !object.id.includes('_rotate_0');
      const easingCode = parseInt((effectiveId.match(/_(?:ease|easing|e)_(\d+)/) || [])[1]) || 3;
      const easingMap = {
        0: 'linear', 1: 'easeInSine', 2: 'easeOutSine', 3: 'easeInOutSine',
        4: 'easeInBack', 5: 'easeOutBack', 6: 'easeInOutBack',
        7: 'easeInElastic', 8: 'easeOutElastic', 9: 'easeInOutElastic'
      };
      const easing = easingMap[easingCode] || 'easeInOutSine';

      switch (direction) {
        case 0: {
          const anim0 = anime({
            targets: object,
            translateX: pathMotion('x'),
            translateY: pathMotion('y'),
            rotate: rotate ? pathMotion('angle') : 0,
            duration: animationSpeed,
            easing,
            loop: true,
            direction: 'alternate',

            update: (anim) => {
              emitOSCFromPathProgress({
                path,
                progress: anim.progress,
                pathId: path.id
              });
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
          const anim1 = anime({ targets: object, translateX: pathMotion('x'), translateY: pathMotion('y'), rotate: rotate ? pathMotion('angle') : 0, duration: animationSpeed, easing, loop: true });
          window.runningAnimations[object.id] = { play: () => anim1.play(), pause: () => anim1.pause(), resume: () => anim1.play(), wasPaused: false };
          animations.push(anim1);
          break;
        }

        case 2: {
          const anim2 = anime({ targets: object, translateX: pathMotion('x'), translateY: pathMotion('y'), rotate: rotate ? pathMotion('angle') : 0, duration: animationSpeed, easing, loop: true, direction: 'reverse' });
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
                easing,
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
                easing,
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
          const baseObjectID = object.id.split("_")[0]; // Strip speed/direction data
          const ghostID = `ghost-${baseObjectID}`;
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
                easing: easing
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
                  easing: easing,
                  complete: () => {
                    if (this.running) this.loop();
                  }
                });

                anime({
                  targets: this.countdown,
                  x: nextTargetPosition.x,
                  y: nextTargetPosition.y - 75,
                  duration: animationDuration,
                  easing: easing
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

    let px = pivotMatch ? pivotMatch[1].trim() : pxRaw;
    let py = pivotMatch ? pivotMatch[2].trim() : pyRaw;

    const resolvePivotValue = (val, ref) => {
      if (typeof val === 'string' && val.endsWith('%')) {
        return bbox.x + (parseFloat(val) / 100) * ref;
      }
      return parseFloat(val);
    };

    if (px !== null && py !== null) {
      const pivotX = resolvePivotValue(px, bbox.width);
      const pivotY = resolvePivotValue(py, bbox.height);
      object.style.transformOrigin = `${pivotX}px ${pivotY}px`;
    } else {
      setTransformOriginToCenter(object);
    }
  }

function setTransformOriginToCenter(element) {
    const bbox = element.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    element.style.transformOrigin = `${cx}px ${cy}px`;
  }

function parseCompactAnimationValues(id, prefix = 's') {
    // console.log(`[parseCompact] 🧪 Testing parseCompactAnimationValues(${prefix}):`, id);

    // Normalize prefix search
    id = id.replace(/^r_/, '').replace(/^obj_rotate_/, '');

    const pattern = new RegExp(`${prefix}\\[(.*?)\\]`);
    const match = id.match(pattern);
    if (!match) {
      // console.log(`[parseCompact] ❌ No match found for prefix ${prefix} in: ${id}`);
      return null;
    }

    let raw = match[1].trim();
    // console.log(`[parseCompact] ✅ Matched ${prefix}[...] → raw: ${raw}`);

    // --- rnd(...) wrapper
    if (raw.startsWith('rnd(') && raw.endsWith(')')) {
      const inner = raw.slice(4, -1);

      const miniMatch = inner.match(/^(\d+)x(\d+(?:\.\d+)?)[-_](\d+(?:\.\d+)?)(x?)$/);
      if (miniMatch) {
        const count = parseInt(miniMatch[1]);
        const min = parseFloat(miniMatch[2]);
        const max = parseFloat(miniMatch[3]);
        const regen = miniMatch[4] === 'x';
        const generate = () => Array.from({ length: count }, () => min + Math.random() * (max - min));
        return { values: generate(), regenerate: regen, generate };
      }

      // fallback: list syntax rnd(1,2,3)
      const values = inner.split(',').map(Number).filter(n => !isNaN(n));
      const generate = () => values.sort(() => Math.random() - 0.5);
      return { values: generate(), regenerate: true, generate };
    }

    // --- legacy mini-random: 5x1-3x
    const miniMatch = raw.match(/^(\d+)x(\d+(?:\.\d+)?)[-_](\d+(?:\.\d+)?)(x?)$/);
    if (miniMatch) {
      const count = parseInt(miniMatch[1]);
      const min = parseFloat(miniMatch[2]);
      const max = parseFloat(miniMatch[3]);
      const regen = miniMatch[4] === 'x';
      const generate = () => Array.from({ length: count }, () => min + Math.random() * (max - min));
      return { values: generate(), regenerate: regen, generate };
    }

    // --- XY pair fallback: [[a,b], [c,d]]
    if (prefix === 'sXY' && raw.includes('],')) {
      try {
        const tupleVals = JSON.parse(`[${raw}]`);
        if (Array.isArray(tupleVals) && Array.isArray(tupleVals[0])) {
          return { values: tupleVals, regenerate: false };
        }
      } catch (e) {
        // console.warn(`[parseCompact] ⚠️ Failed to parse XY pair array in ${raw}`);
      }
    }

    // --- fallback: static comma-separated values
    const values = raw.split(',').map(v => {
      const parsed = Number(v);
      return isNaN(parsed) ? v : parsed;
    }).filter(v => typeof v === 'number' || Array.isArray(v));

    if (values.length) {
      // console.log(`[parseCompact] 📦 Static parsed values:`, values);
      return { values, regenerate: false };
    }

    // console.warn(`[parseCompact] ❌ Failed to extract values from raw: ${raw}`);
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