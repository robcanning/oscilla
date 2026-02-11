// =============================================================
//  waveform.js -- SVG waveform display for audio cues
//
//  Renders amplitude contour into a composer-placed <rect> in the
//  score SVG.  Two black polylines (upper/lower peak envelope),
//  transparent fill, thin cursor line.  Info label as SVG text
//  at the bottom of the display area.
//
//  Usage from audio cue DSL:
//    audio(src:drone, waveform:self)       -- use cue element
//    audio(src:drone, waveform:wf_drone)   -- use named rect
//    audio(src:drone, waveform:none)       -- suppress waveform
//
//  "self" is the default -- waveform renders into the cue element.
//
//  Exports:
//    renderWaveform(svg, target, buffer, uid, filename, opts)
//    startCursor(handle, audioCtx, startTime, duration, pitch)
//    resetCursor(handle)
//    addCursor(handle, cursorId, opts)    -- multi-cursor
//    removeCursor(handle, cursorId)       -- multi-cursor
//    removeAllCursors(handle)             -- multi-cursor
//    destroyWaveform(uid)
//    getWaveform(uid)
// =============================================================

const SVG_NS = "http://www.w3.org/2000/svg";

// Cache: filename -> { maxPeaks, minPeaks }
const peakCache = new Map();

// Active waveform handles: uid -> handle object
const activeWaveforms = new Map();

// =============================================================
//  Peak extraction (normalised)
// =============================================================

/**
 * Downsample an AudioBuffer into normalised peak envelopes.
 * Peaks are scaled so the loudest sample fills the full
 * display height -- quiet files won't waste space.
 */
export function extractPeaks(buffer, buckets) {
  const channels = buffer.numberOfChannels;
  const length   = buffer.length;
  const step     = Math.max(1, Math.floor(length / buckets));

  const maxPeaks = new Float32Array(buckets);
  const minPeaks = new Float32Array(buckets);

  maxPeaks.fill(0);
  minPeaks.fill(0);

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);

    for (let b = 0; b < buckets; b++) {
      const start = b * step;
      const end   = Math.min(start + step, length);

      let bMax = -1, bMin = 1;
      for (let i = start; i < end; i++) {
        if (data[i] > bMax) bMax = data[i];
        if (data[i] < bMin) bMin = data[i];
      }

      if (ch === 0) {
        maxPeaks[b] = bMax;
        minPeaks[b] = bMin;
      } else {
        maxPeaks[b] = Math.max(maxPeaks[b], bMax);
        minPeaks[b] = Math.min(minPeaks[b], bMin);
      }
    }
  }

  // Normalise: scale so loudest peak = 1.0
  let absMax = 0;
  for (let b = 0; b < buckets; b++) {
    const a = Math.abs(maxPeaks[b]);
    const n = Math.abs(minPeaks[b]);
    if (a > absMax) absMax = a;
    if (n > absMax) absMax = n;
  }

  if (absMax > 0 && absMax < 1) {
    const scale = 1 / absMax;
    for (let b = 0; b < buckets; b++) {
      maxPeaks[b] *= scale;
      minPeaks[b] *= scale;
    }
  }

  return { maxPeaks, minPeaks };
}

/**
 * Get or compute cached peaks for a filename.
 */
export function getPeaks(filename, buffer, buckets) {
  const cacheKey = `${filename}:${buckets}`;
  if (peakCache.has(cacheKey)) return peakCache.get(cacheKey);

  const peaks = extractPeaks(buffer, buckets);
  peakCache.set(cacheKey, peaks);
  return peaks;
}


// =============================================================
//  SVG rendering
// =============================================================

/**
 * Build polyline points string from peak array.
 */
function peaksToPoints(peaks, x, y, w, h) {
  const midY = y + h / 2;
  const halfH = h / 2;
  const step = w / peaks.length;
  const points = [];

  for (let i = 0; i < peaks.length; i++) {
    const px = x + i * step;
    const py = midY - peaks[i] * halfH;
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }

  return points.join(" ");
}

/**
 * Resolve the target element for waveform rendering.
 *
 * @param {SVGSVGElement} svg        - the score SVG root
 * @param {string|Element} target    - "self", an element ID string, or an Element
 * @param {Element}        cueElement - the cue element (used when target is "self")
 * @returns {Element|null}
 */
function resolveTarget(svg, target, cueElement) {
  if (target instanceof Element) return target;
  if (target === "self" && cueElement) return cueElement;
  if (typeof target === "string") return svg.getElementById(target);
  return null;
}

/**
 * Render waveform into a target element in the score SVG.
 *
 * @param {SVGSVGElement}  svg        - the score SVG root
 * @param {string|Element} target     - "self", rect ID, or Element
 * @param {AudioBuffer}    buffer     - decoded audio buffer
 * @param {string}         uid        - audio cue uid (for registry)
 * @param {string}         filename   - for peak cache key
 * @param {object}         opts
 * @param {Element}        opts.element  - cue element (for "self" resolution)
 * @param {string}         opts.info     - text label to show at bottom of waveform
 * @returns {object|null}  waveform handle
 */
export function renderWaveform(svg, target, buffer, uid, filename, opts = {}) {
  const targetEl = resolveTarget(svg, target, opts.element);
  if (!targetEl) {
    console.warn(`[waveform] Target not found: ${target}`);
    return null;
  }

  // If a waveform already exists for this uid, reuse the group
  const existing = activeWaveforms.get(uid);
  if (existing?.group?.parentNode) {
    // Update info label if provided
    if (opts.info && existing._infoText) {
      existing._infoText.textContent = opts.info;
    }
    resetCursor(existing);
    return existing;
  }

  const bbox = targetEl.getBBox();

  // Horizontal resolution: 1 bucket per SVG unit of width, capped
  const buckets = Math.min(Math.round(bbox.width), 2000);
  const peaks   = getPeaks(filename || uid, buffer, buckets);

  // --- Build SVG group ---
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "oscilla-waveform");
  g.setAttribute("pointer-events", "none");
  g.dataset.uid = uid;

  // Upper contour (max peaks)
  const upperLine = document.createElementNS(SVG_NS, "polyline");
  upperLine.setAttribute("points", peaksToPoints(peaks.maxPeaks, bbox.x, bbox.y, bbox.width, bbox.height));
  upperLine.setAttribute("fill", "none");
  upperLine.setAttribute("stroke", "#000");
  upperLine.setAttribute("stroke-width", "0.8");
  upperLine.setAttribute("stroke-linejoin", "round");

  // Lower contour (min peaks)
  const lowerLine = document.createElementNS(SVG_NS, "polyline");
  lowerLine.setAttribute("points", peaksToPoints(peaks.minPeaks, bbox.x, bbox.y, bbox.width, bbox.height));
  lowerLine.setAttribute("fill", "none");
  lowerLine.setAttribute("stroke", "#000");
  lowerLine.setAttribute("stroke-width", "0.8");
  lowerLine.setAttribute("stroke-linejoin", "round");

  // Cursor line (initially at x=0 of rect)
  const cursor = document.createElementNS(SVG_NS, "line");
  cursor.setAttribute("x1", bbox.x);
  cursor.setAttribute("y1", bbox.y);
  cursor.setAttribute("x2", bbox.x);
  cursor.setAttribute("y2", bbox.y + bbox.height);
  cursor.setAttribute("stroke", "#000");
  cursor.setAttribute("stroke-width", "1");
  cursor.setAttribute("opacity", "0.6");

  g.appendChild(upperLine);
  g.appendChild(lowerLine);
  g.appendChild(cursor);

  // --- Info text label at bottom of waveform ---
  let infoText = null;
  if (opts.info) {
    infoText = document.createElementNS(SVG_NS, "text");
    // Font size relative to bbox height, clamped to readable range
    const fontSize = Math.max(10, Math.min(bbox.height * 0.04, 20));
    infoText.setAttribute("x", bbox.x + 2);
    infoText.setAttribute("y", bbox.y + bbox.height - 2);
    infoText.setAttribute("font-family", "monospace");
    infoText.setAttribute("font-size", fontSize);
    infoText.setAttribute("fill", "#000");
    infoText.setAttribute("opacity", "0.55");
    infoText.textContent = opts.info;
    g.appendChild(infoText);
  }

  // Insert waveform group.
  // If target is a <g>, append as child so it inherits transforms (drag, etc.)
  // If target is a shape (<rect>, <circle>, etc.), insert as sibling after
  // and mirror transforms via MutationObserver so drag/animations carry through.
  const tagName = targetEl.tagName?.toLowerCase();
  if (tagName === "g" || tagName === "svg") {
    targetEl.appendChild(g);
  } else {
    const parent = targetEl.parentNode;
    if (targetEl.nextSibling) {
      parent.insertBefore(g, targetEl.nextSibling);
    } else {
      parent.appendChild(g);
    }

    // Mirror transform changes from the target onto the waveform group
    // so drag translate (and any other transform) keeps them in sync.
    const syncTransform = () => {
      const t = targetEl.getAttribute("transform") || "";
      g.setAttribute("transform", t);
    };
    syncTransform(); // initial sync

    const observer = new MutationObserver(syncTransform);
    observer.observe(targetEl, { attributes: true, attributeFilter: ["transform"] });
    g._transformObserver = observer; // store for cleanup
  }

  // Build handle
  const handle = {
    uid,
    group: g,
    cursor,
    bbox,
    upperLine,
    lowerLine,
    _infoText: infoText,
    _rafId: null,
    _running: false,
  };

  activeWaveforms.set(uid, handle);
  return handle;
}


// =============================================================
//  Multi-cursor support
//
//  addCursor / removeCursor create independent cursor lines
//  within an existing waveform group.  Each sub-cursor gets its
//  own RAF loop and can be started / reset with the standard
//  startCursor / resetCursor functions.
//
//  Impulse cues use this to show one cursor per polyphonic hit.
// =============================================================

/**
 * Add a named sub-cursor to an existing waveform handle.
 *
 * @param {object} handle    - parent waveform handle from renderWaveform
 * @param {string} cursorId  - unique id for this cursor (e.g. playUid)
 * @param {object} opts      - { color, width, opacity }
 * @returns {object} sub-handle compatible with startCursor / resetCursor
 */
export function addCursor(handle, cursorId, opts = {}) {
  if (!handle?.group || !handle?.bbox) return null;

  const cursor = document.createElementNS(SVG_NS, "line");
  cursor.setAttribute("x1", handle.bbox.x);
  cursor.setAttribute("y1", handle.bbox.y);
  cursor.setAttribute("x2", handle.bbox.x);
  cursor.setAttribute("y2", handle.bbox.y + handle.bbox.height);
  cursor.setAttribute("stroke", opts.color || "#c00");
  cursor.setAttribute("stroke-width", opts.width || "0.8");
  cursor.setAttribute("opacity", opts.opacity || "0.45");
  cursor.dataset.cursorId = cursorId;

  handle.group.appendChild(cursor);

  const subHandle = {
    uid: cursorId,
    cursor,
    bbox: handle.bbox,
    _rafId: null,
    _running: false,
    _parentHandle: handle,
  };

  if (!handle._cursors) handle._cursors = new Map();
  handle._cursors.set(cursorId, subHandle);

  return subHandle;
}

/**
 * Remove a named sub-cursor from a waveform handle.
 */
export function removeCursor(handle, cursorId) {
  if (!handle?._cursors) return;

  const sub = handle._cursors.get(cursorId);
  if (!sub) return;

  resetCursor(sub);
  try { sub.cursor?.remove(); } catch {}
  handle._cursors.delete(cursorId);
}

/**
 * Remove all sub-cursors from a waveform handle.
 */
export function removeAllCursors(handle) {
  if (!handle?._cursors) return;

  for (const [id, sub] of handle._cursors) {
    resetCursor(sub);
    try { sub.cursor?.remove(); } catch {}
  }
  handle._cursors.clear();
}


// =============================================================
//  Cursor control
// =============================================================

/**
 * Start the playback cursor animation.
 */
export function startCursor(handle, audioCtx, startTime, duration, pitch = 1) {
  if (!handle?.cursor) return;

  handle._running = true;
  const effectiveDuration = duration / (pitch || 1);
  const { bbox, cursor } = handle;

  function tick() {
    if (!handle._running) return;

    const elapsed  = audioCtx.currentTime - startTime;
    const progress = Math.min(elapsed / effectiveDuration, 1);
    const cx       = bbox.x + progress * bbox.width;

    cursor.setAttribute("x1", cx);
    cursor.setAttribute("x2", cx);

    if (progress >= 1) {
      resetCursor(handle);
      return;
    }

    handle._rafId = requestAnimationFrame(tick);
  }

  if (handle._rafId) cancelAnimationFrame(handle._rafId);
  handle._rafId = requestAnimationFrame(tick);
}

/**
 * Reset cursor to start position.
 */
export function resetCursor(handle) {
  if (!handle) return;

  handle._running = false;
  if (handle._rafId) {
    cancelAnimationFrame(handle._rafId);
    handle._rafId = null;
  }

  if (handle.cursor && handle.bbox) {
    handle.cursor.setAttribute("x1", handle.bbox.x);
    handle.cursor.setAttribute("x2", handle.bbox.x);
  }
}

/**
 * Remove waveform SVG group entirely.
 */
export function destroyWaveform(uid) {
  const handle = activeWaveforms.get(uid);
  if (!handle) return;

  resetCursor(handle);
  try { handle.group?._transformObserver?.disconnect(); } catch {}
  try { handle.group?.remove(); } catch {}
  activeWaveforms.delete(uid);
}

/**
 * Get an active waveform handle by uid.
 */
export function getWaveform(uid) {
  return activeWaveforms.get(uid) || null;
}
