// =============================================================
//  scope.js -- real-time oscilloscope display for synth cues
//
//  Renders a time-domain trace driven by a Web Audio AnalyserNode
//  into an SVG element in the score.  Shares the target resolution,
//  handle registry, and cursor infrastructure with waveform.js.
//
//  Unlike audio peak contours (pre-computed from a buffer), the
//  scope is continuously updated at display framerate.
//
//  Lifecycle:
//    prime   -> renderScope with static wave shape (assignCues)
//    start   -> startScope(handle, analyserNode) begins RAF loop
//    stop    -> stopScope(handle) stops RAF, restores static wave
//    cleanup -> destroyWaveform(uid) removes SVG group
//
//  Exports:
//    renderScope(svg, target, uid, opts)
//    startScope(handle, analyserNode)
//    stopScope(handle)
// =============================================================

import {
  SVG_NS_EXPORT as SVG_NS,
  resolveTarget,
  getWaveform,
  registerHandle
} from "./waveform.js";


/** Default scope trace color -- cool teal to distinguish from audio */
const SCOPE_COLOR = "#0ac";

/** Cursor overhang above bbox top (SVG units) */
const CURSOR_OVERHANG = 10;


// =============================================================
//  Static wave shape generator (primed state)
// =============================================================

/**
 * Generate SVG points string for a static representative waveform.
 * Used at prime time (before synth plays) to show the wave type.
 *
 * @param {string} waveType - "sine", "square", "saw", "triangle", "noise"
 * @param {object} drawBbox - { x, y, width, height }
 * @param {number} cycles   - how many wave cycles to show
 * @returns {string} SVG polyline points
 */
function staticWavePoints(waveType, drawBbox, cycles = 3) {
  const { x, y, width, height } = drawBbox;
  const midY = y + height / 2;
  const halfH = height * 0.4;  // leave some vertical padding
  const samples = Math.min(Math.round(width), 800);
  const step = width / samples;
  const points = [];

  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * cycles * Math.PI * 2;
    let v = 0;

    switch ((waveType || "sine").toLowerCase()) {
      case "sine":
        v = Math.sin(t);
        break;
      case "square":
        v = Math.sin(t) >= 0 ? 1 : -1;
        break;
      case "saw":
      case "sawtooth":
        v = 2 * ((t / (Math.PI * 2)) % 1) - 1;
        break;
      case "triangle":
        v = 2 * Math.abs(2 * ((t / (Math.PI * 2)) % 1) - 1) - 1;
        break;
      case "noise":
      case "white":
        v = Math.random() * 2 - 1;
        break;
      default:
        v = Math.sin(t);
    }

    const px = x + i * step;
    const py = midY - v * halfH;
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }

  return points.join(" ");
}


// =============================================================
//  Scope rendering
// =============================================================

/**
 * Render a scope display into a target element in the score SVG.
 *
 * Creates an SVG group containing:
 *   - info text label (top)
 *   - scope polyline (real-time or static wave)
 *   - dashed centre line (zero crossing)
 *   - cursor line
 *
 * @param {SVGSVGElement}  svg      - the score SVG root
 * @param {string|Element} target   - "self", element ID, or Element
 * @param {string}         uid      - synth scope uid (for registry)
 * @param {object}         opts
 * @param {Element}        opts.element  - cue element (for "self" resolution)
 * @param {string}         opts.info     - text label
 * @param {string}         opts.wave     - wave type for static primed display
 * @param {string}         opts.color    - scope trace color (default: SCOPE_COLOR)
 * @returns {object|null}  scope handle (compatible with cursor functions)
 */
export function renderScope(svg, target, uid, opts = {}) {
  const targetEl = resolveTarget(svg, target, opts.element);
  if (!targetEl) {
    console.warn(`[scope] Target not found: ${target}`);
    return null;
  }

  // Reuse existing scope if already rendered for this uid
  const existing = getWaveform(uid);
  if (existing?.group?.parentNode) {
    if (opts.info && existing._infoText) {
      existing._infoText.textContent = opts.info;
    }
    return existing;
  }

  const bbox = targetEl.getBBox();

  // Text padding: info text at top, scope trace below
  let textPad = 0;
  let infoText = null;

  const fontSize = Math.max(14, Math.min(bbox.height * 0.07, 28));
  if (opts.info) {
    textPad = fontSize + 4;
  }

  const drawBbox = {
    x: bbox.x,
    y: bbox.y + textPad,
    width: bbox.width,
    height: bbox.height - textPad
  };

  // --- Build SVG group ---
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "oscilla-scope");
  g.setAttribute("pointer-events", "none");
  g.dataset.uid = uid;

  // Info text label
  if (opts.info) {
    infoText = document.createElementNS(SVG_NS, "text");
    infoText.setAttribute("x", bbox.x + 2);
    infoText.setAttribute("y", bbox.y + fontSize);
    infoText.setAttribute("font-family", "monospace");
    infoText.setAttribute("font-size", fontSize);
    infoText.setAttribute("fill", "#000");
    infoText.setAttribute("opacity", "0.55");
    infoText.textContent = opts.info;
    g.appendChild(infoText);
  }

  // Dashed centre line (zero crossing reference)
  const centreLine = document.createElementNS(SVG_NS, "line");
  centreLine.setAttribute("x1", drawBbox.x);
  centreLine.setAttribute("y1", drawBbox.y + drawBbox.height / 2);
  centreLine.setAttribute("x2", drawBbox.x + drawBbox.width);
  centreLine.setAttribute("y2", drawBbox.y + drawBbox.height / 2);
  centreLine.setAttribute("stroke", "#000");
  centreLine.setAttribute("stroke-width", "0.3");
  centreLine.setAttribute("opacity", "0.15");
  centreLine.setAttribute("stroke-dasharray", "4,4");

  // Scope trace polyline
  const color = opts.color || SCOPE_COLOR;
  const scopeLine = document.createElementNS(SVG_NS, "polyline");
  scopeLine.setAttribute("fill", "none");
  scopeLine.setAttribute("stroke", color);
  scopeLine.setAttribute("stroke-width", "1");
  scopeLine.setAttribute("stroke-linejoin", "round");
  scopeLine.setAttribute("opacity", "0.7");

  // Render static primed waveform if wave type is known
  if (opts.wave) {
    scopeLine.setAttribute("points", staticWavePoints(opts.wave, drawBbox));
  }

  // Cursor line
  const cursor = document.createElementNS(SVG_NS, "line");
  cursor.setAttribute("x1", bbox.x);
  cursor.setAttribute("y1", bbox.y - CURSOR_OVERHANG);
  cursor.setAttribute("x2", bbox.x);
  cursor.setAttribute("y2", bbox.y + bbox.height);
  cursor.setAttribute("stroke", color);
  cursor.setAttribute("stroke-width", "1");
  cursor.setAttribute("opacity", "0.5");

  g.appendChild(centreLine);
  g.appendChild(scopeLine);
  g.appendChild(cursor);

  // --- Insert into SVG ---
  // Same insertion logic as renderWaveform: child of <g>/<svg>,
  // sibling of shapes with transform observer.
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

    // Mirror transform changes from target onto scope group
    const syncTransform = () => {
      const t = targetEl.getAttribute("transform") || "";
      g.setAttribute("transform", t);
    };
    syncTransform();

    const observer = new MutationObserver(syncTransform);
    observer.observe(targetEl, { attributes: true, attributeFilter: ["transform"] });
    g._transformObserver = observer;
  }

  // --- Build handle ---
  const handle = {
    uid,
    group: g,
    cursor,
    bbox,
    _drawBbox: drawBbox,
    _cursorOverhang: CURSOR_OVERHANG,
    _scopeLine: scopeLine,
    _centreLine: centreLine,
    _infoText: infoText,
    _scopeColor: color,
    _scopeWave: opts.wave || null,
    _scopeRafId: null,
    _scopeRunning: false,
    _scopeAnalyser: null,
    _rafId: null,
    _running: false,
    // Stubs so waveform cursor functions don't error
    upperLine: null,
    lowerLine: null,
  };

  registerHandle(uid, handle);
  return handle;
}


// =============================================================
//  Real-time scope display
// =============================================================

/**
 * Start real-time scope display driven by an AnalyserNode.
 *
 * Reads getByteTimeDomainData each frame and maps the 0-255 byte
 * values to SVG y-coordinates within the draw bbox.  Downsamples
 * to match the SVG pixel width.
 *
 * @param {object}       handle   - scope handle from renderScope
 * @param {AnalyserNode} analyser - Web Audio AnalyserNode tapped from synth chain
 */
export function startScope(handle, analyser) {
  if (!handle?._scopeLine || !analyser) return;

  handle._scopeRunning = true;
  handle._scopeAnalyser = analyser;

  const fftSize = analyser.fftSize;
  const dataArray = new Uint8Array(fftSize);

  const { _drawBbox: draw, _scopeLine: line } = handle;
  const midY = draw.y + draw.height / 2;
  const halfH = draw.height / 2;

  // Downsample: only take as many points as SVG units of width
  const maxPoints = Math.min(fftSize, Math.round(draw.width));
  const sampleStep = Math.max(1, Math.floor(fftSize / maxPoints));
  const xStep = draw.width / maxPoints;

  function tick() {
    if (!handle._scopeRunning) return;

    analyser.getByteTimeDomainData(dataArray);

    // Build points string
    let points = "";
    for (let i = 0, si = 0; i < maxPoints && si < fftSize; i++, si += sampleStep) {
      // dataArray[si] is 0-255 where 128 = silence
      const v = (dataArray[si] - 128) / 128;
      const px = draw.x + i * xStep;
      const py = midY - v * halfH;
      points += `${px.toFixed(1)},${py.toFixed(1)} `;
    }

    line.setAttribute("points", points);
    line.setAttribute("opacity", "0.85");

    handle._scopeRafId = requestAnimationFrame(tick);
  }

  if (handle._scopeRafId) cancelAnimationFrame(handle._scopeRafId);
  handle._scopeRafId = requestAnimationFrame(tick);
}


/**
 * Stop the real-time scope display.
 * Restores the static primed waveform shape at reduced opacity.
 *
 * @param {object} handle - scope handle from renderScope
 */
export function stopScope(handle) {
  if (!handle) return;

  handle._scopeRunning = false;
  if (handle._scopeRafId) {
    cancelAnimationFrame(handle._scopeRafId);
    handle._scopeRafId = null;
  }
  handle._scopeAnalyser = null;

  // Restore static wave shape if one was primed
  if (handle._scopeLine && handle._scopeWave && handle._drawBbox) {
    handle._scopeLine.setAttribute("points",
      staticWavePoints(handle._scopeWave, handle._drawBbox));
    handle._scopeLine.setAttribute("opacity", "0.35");
  }
}
