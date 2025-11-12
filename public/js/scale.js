// scale.js — OscillaScore Scale Cue (uniform & non-uniform)

// ============================================================
// OSC send helper for SCALE
// ============================================================
function sendOSCScale(el, sx, sy) {
    if (!window.socket) return;

    const uid = el.id || el.dataset.uid || null;
    const avg = (Number(sx) + Number(sy)) / 2;

    const msg = {
        type: "osc_scale",
        uid,
        sx: Number(sx),
        sy: Number(sy),
        avg,
        timestamp: Date.now()
    };

    try {
        window.socket.send(JSON.stringify(msg));
        console.log("[scale][osc]:", msg);
    } catch (e) {
        console.warn("[scale][osc] send failed:", e);
    }
}

// ============================================================
// Pattern Generators (Pseq, Prand, Pxrand, Pshuf) — cloned from rotate.js
// ============================================================
function makePatternGenerator(pattern) {
    if (!pattern || !pattern.values || !Array.isArray(pattern.values)) {
        console.warn("[scale] makePatternGenerator: invalid pattern:", pattern);
        return { next: () => null };
    }

    // Literal list → Pseq(..., inf)
    if (Array.isArray(pattern.values) && !pattern.name) {
        let arr = pattern.values.slice();
        let i = 0;
        return {
            next() {
                const v = arr[i % arr.length];
                i++;
                return v;
            }
        };
    }

    const values = pattern.values.slice();
    let repeats = pattern.repeats;
    if (repeats === "inf" || repeats === Infinity || repeats == null) repeats = Infinity;
    else {
        repeats = Number(repeats);
        if (Number.isNaN(repeats)) repeats = 1;
    }

    let index = 0;
    let last = null;
    let cycleCount = 0;

    switch (pattern.name) {
        case "Pseq":
            return {
                next() {
                    const v = values[index];
                    index++;
                    if (index >= values.length) {
                        index = 0;
                        cycleCount++;
                        if (cycleCount >= repeats) return null;
                    }
                    return v;
                }
            };

        case "Prand":
            return {
                next() {
                    if (cycleCount >= repeats) return null;
                    const v = values[Math.floor(Math.random() * values.length)];
                    cycleCount += 1 / values.length;
                    return v;
                }
            };

        case "Pxrand":
            return {
                next() {
                    if (cycleCount >= repeats) return last;
                    let v;
                    do {
                        v = values[Math.floor(Math.random() * values.length)];
                    } while (v === last && values.length > 1);
                    last = v;
                    cycleCount += 1 / values.length;
                    return v;
                }
            };

        case "Pshuf": {
            let buf = shuffle(values);
            return {
                next() {
                    if (index >= buf.length) {
                        index = 0;
                        buf = shuffle(values);
                        cycleCount++;
                        if (cycleCount >= repeats) return null;
                    }
                    const v = buf[index];
                    index++;
                    return v;
                }
            };
        }
    }

    console.warn("[scale] makePatternGenerator: unknown pattern type:", pattern.name);
    return { next: () => null };
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// A simpler value generator (not used directly; keep parity with rotate.js)
function makeValueGenerator(pattern) {
    const { name, values } = pattern;
    let i = 0;
    let last = null;

    if (name === "Pseq") {
        return { next() { const v = values[i % values.length]; i++; return v; } };
    }
    if (name === "Prand") {
        return { next() { const idx = Math.floor(Math.random() * values.length); return values[idx]; } };
    }
    if (name === "Pxrand") {
        return {
            next() {
                let choice;
                do { choice = values[Math.floor(Math.random() * values.length)]; }
                while (choice === last && values.length > 1);
                last = choice;
                return choice;
            }
        };
    }
    if (name === "Pshuf") {
        let bag = [...values];
        return {
            next() {
                if (bag.length === 0) bag = [...values];
                const idx = Math.floor(Math.random() * bag.length);
                const choice = bag[idx];
                bag.splice(idx, 1);
                return choice;
            }
        };
    }
    console.warn("[scale] Unknown pattern:", name);
    return { next() { return values[0]; } };
}

// ============================================================
// Utilities (pivot + current scale)
// ============================================================
function applySvgPivot(el) {
    if (!el.getBBox) return;
    const bb = el.getBBox();
    if (!bb || bb.width === 0 || bb.height === 0) return;
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    el.style.transformOrigin = `${cx}px ${cy}px`;
}

function getCurrentScale(el, fallback = { sx: 1, sy: 1 }) {
    const t = el.style.transform || "";
    const m = t.match(/scale\(\s*([-\d.+eE]+)(?:\s*,\s*([-\d.+eE]+))?\s*\)/);
    if (!m) return { ...fallback };
    const sx = parseFloat(m[1]);
    const sy = (m[2] != null) ? parseFloat(m[2]) : sx;
    const okx = Number.isFinite(sx) ? sx : fallback.sx;
    const oky = Number.isFinite(sy) ? sy : fallback.sy;
    return { sx: okx, sy: oky };
}

// ============================================================
// Sequence mode (lists/patterns)
// ============================================================
function handleScaleSequence(el, ax, ay, astArgs) {
    // ax/ay = either array of numbers or pattern object (or null to mirror the other)

    let dur = 1;
    let durGen = null;
    let mode = "loop";          // loop | once | alternate
    let pauseOnExit = true;
    let interp = "smooth";      // smooth | step
    let ease = "linear";
    let hold = null;
    let oscMode = 0;            // 0 off, 1 continuous, 2 per-step

    // Optional: allow patterns for axes via named keys in args
    let axGen = null, ayGen = null;

    // Parse arguments
    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const val = arg.value;

        // Uniform values: `values:[…]` or first positional pattern/list
        if (key === "values") {
            if (val && typeof val === "object" && val.type === "pattern") {
                axGen = makePatternGenerator(val);
                ayGen = makePatternGenerator(val);
                ax = null; ay = null;
            } else if (Array.isArray(val)) {
                ax = val.slice();
                ay = val.slice();
            }
        }

        // Non-uniform via named keys (supported in addition to scaleXY form)
        if (key === "x" || key === "valuesX") {
            if (val && typeof val === "object" && val.type === "pattern") {
                axGen = makePatternGenerator(val); ax = null;
            } else if (Array.isArray(val)) {
                ax = val.slice();
            } else if (Number.isFinite(Number(val))) {
                ax = [Number(val)];
            }
        }
        if (key === "y" || key === "valuesY") {
            if (val && typeof val === "object" && val.type === "pattern") {
                ayGen = makePatternGenerator(val); ay = null;
            } else if (Array.isArray(val)) {
                ay = val.slice();
            } else if (Number.isFinite(Number(val))) {
                ay = [Number(val)];
            }
        }

        // Duration
        if (key === "dur") {
            if (val && typeof val === "object" && val.type === "pattern") {
                durGen = makePatternGenerator(val);
            } else if (Array.isArray(val)) {
                durGen = makePatternGenerator({ values: val });
            } else {
                dur = Number(val);
            }
        }

        if (key === "mode") mode = String(val).trim().toLowerCase();
        if (key === "pauseOnExit") pauseOnExit = Boolean(val);
        if (key === "interp") interp = String(val).trim().toLowerCase();
        if (key === "ease") ease = String(val).trim();
        if (key === "hold") hold = Number(val);
        if (key === "osc") oscMode = Number(val) || 0;
    }

    // Defaults
    if (interp === "smooth" && (hold === null || Number.isNaN(hold))) {
        hold = 0;
    }
    if (interp === "step") hold = 0;

    // Stop previous
    if (el._oscillaScaleAnim) {
        el._oscillaScaleAnim.pause?.();
        clearTimeout(el._oscillaScaleAnim);
        el._oscillaScaleAnim = null;
    }

    applySvgPivot(el);

    // Determine sequence length only for literal lists
    const NX = Array.isArray(ax) ? ax.length : Infinity;
    const NY = Array.isArray(ay) ? ay.length : Infinity;
    const N = Math.max(NX, NY);

    let index = 0;
    let direction = 1;

    // Start driver from current scale
    const cur = getCurrentScale(el, {
        sx: Array.isArray(ax) ? ax[0] ?? 1 : 1,
        sy: Array.isArray(ay) ? ay[0] ?? 1 : 1
    });
    const driver = { sx: cur.sx, sy: cur.sy };

    function nextPair() {
        // pattern generators take precedence when present
        const sx = axGen ? axGen.next() : Array.isArray(ax) ? ax[index % NX] : driver.sx;
        const sy = ayGen ? ayGen.next() : Array.isArray(ay) ? ay[index % NY] : (axGen || Array.isArray(ax) ? sx : driver.sy);

        // If patterns terminate (null) under once-mode semantics
        if ((axGen && sx == null) || (ayGen && sy == null)) return null;
        return [Number(sx), Number(sy)];
    }
    
function stepIndexAdvance() {
  if (axGen || ayGen) return; // pattern generators handle repetition

  const len = Array.isArray(ax) ? ax.length : 0;
  const first = Array.isArray(ax) ? ax[0] : null;
  const last = Array.isArray(ax) ? ax[len - 1] : null;
  const isPingPongShape = len >= 2 && first === last;

  // Ping-pong or alternate → bounce back and forth
  if (mode === "alternate" || isPingPongShape) {
    index += direction;
    if (index >= N || index < 0) {
      direction *= -1;
      index += direction;
    }
  }
  // Restart loop → just wrap around to 0
  else {
    index = (index + 1) % N;
  }
}




    function atEndOnce() {
        if (axGen || ayGen) return false; // not applicable
        return (mode === "once" && index >= N);
    }

    function runNext() {
        const pair = nextPair();
        if (!pair || atEndOnce()) { /* ...existing exit... */ return; }

        const [tgtX, tgtY] = pair;

        // ✅ Skip redundant first tween (prevents initial stall)
        if (driver.sx === tgtX && driver.sy === tgtY) {
            stepIndexAdvance();
            return runNext();
        }

        // --- detect restart vs ping-pong just once per step ---
        const len = Array.isArray(ax) ? ax.length : 0;
        const first = Array.isArray(ax) ? ax[0] : null;
        const last = Array.isArray(ax) ? ax[len - 1] : null;
        const isPingPongShape = len >= 2 && first === last;   // e.g. [1,2,1]
        const isRestartLoop = !isPingPongShape && !axGen && !ayGen && len >= 2;
        const isLastStep = !axGen && !ayGen && index === (N - 1);

        // STEP MODE (unchanged)
        if (interp === "step") {
            driver.sx = tgtX; driver.sy = tgtY;
            el.style.transform = `scale(${driver.sx}, ${driver.sy})`;
            if (oscMode === 1 || oscMode === 2) sendOSCScale(el, driver.sx, driver.sy);

            // 🔁 snap at end of restart-type sequences
            if (isRestartLoop && isLastStep) {
                const sx0 = Array.isArray(ax) ? ax[0] : 1;
                const sy0 = Array.isArray(ay) ? ay[0] : sx0;
                driver.sx = sx0; driver.sy = sy0;
                el.style.transform = `scale(${sx0}, ${sy0})`;
                index = 0;
            } else {
                stepIndexAdvance();
            }

            const stepDur = durGen ? durGen.next() : dur;
            el._oscillaScaleAnim = setTimeout(() => requestAnimationFrame(runNext), (stepDur ?? 0) * 1000);
            return;
        }

        // SMOOTH MODE
        const curNow = getCurrentScale(el, driver);
        driver.sx = curNow.sx; driver.sy = curNow.sy;
        const stepDur = durGen ? durGen.next() : dur;

        const anim = anime({
            targets: driver,
            sx: tgtX, sy: tgtY,
            duration: (stepDur ?? 0) * 1000,
            easing: ease,
            update: () => {
                el.style.transform = `scale(${driver.sx}, ${driver.sy})`;
                if (oscMode === 1) sendOSCScale(el, driver.sx, driver.sy);
            },
            complete: () => {
                if (oscMode === 2) sendOSCScale(el, driver.sx, driver.sy);

                // 🔁 snap at the exact moment the last tween finishes (restart-type only)
                if (isRestartLoop && isLastStep) {
                    const sx0 = Array.isArray(ax) ? ax[0] : 1;
                    const sy0 = Array.isArray(ay) ? ay[0] : sx0;
                    driver.sx = sx0; driver.sy = sy0;
                    el.style.transform = `scale(${sx0}, ${sy0})`;
                    index = 0;
                } else {
                    stepIndexAdvance();
                }

                if (hold > 0) {
                    el._oscillaScaleAnim = setTimeout(() => requestAnimationFrame(runNext), hold * 1000);
                } else {
                    requestAnimationFrame(runNext);
                }
            }
        });

        el._oscillaScaleAnim = anim;
    }


    runNext();
}

// ============================================================
// Continuous fallback (pulse) if no values provided
// ============================================================
function handleScaleContinuous(el, astArgs) {
    // Defaults
    let min = 1, max = 1.2;
    let minX = null, maxX = null, minY = null, maxY = null;
    let dur = 2;
    let loop = 0;              // 0 = infinite
    let ease = "linear";

    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const v = arg.value;
        if (key === "min") min = Number(v);
        if (key === "max") max = Number(v);
        if (key === "minX") minX = Number(v);
        if (key === "maxX") maxX = Number(v);
        if (key === "minY") minY = Number(v);
        if (key === "maxY") maxY = Number(v);
        if (key === "dur") dur = Number(v);
        if (key === "loop") loop = Number(v);
        if (key === "ease") ease = String(v).trim();
    }

    // Resolve axis ranges
    const useX = [minX ?? min, maxX ?? max];
    const useY = [minY ?? min, maxY ?? max];

    // Stop previous
    if (el._oscillaScaleAnim) el._oscillaScaleAnim.pause?.();
    applySvgPivot(el);

    const ms = dur * 1000;

    // Pulse X and Y with yoyo
    const anim = anime.timeline({ loop: loop === 0 ? true : loop });

    anim.add({
        targets: el,
        duration: ms,
        easing: ease,
        scaleX: useX[1],
        scaleY: useY[1]
    }).add({
        targets: el,
        duration: ms,
        easing: ease,
        scaleX: useX[0],
        scaleY: useY[0]
    });

    el._oscillaScaleAnim = anim;

    console.log(`[scale] start fallback pulse`, {
        id: el.id,
        useX, useY, dur, loop, ease, pivot: el.style.transformOrigin
    });
}

// ============================================================
// MAIN ENTRY — matches dispatcher usage: handleScaleCue(ast, cueElement)
// ============================================================
export function handleScaleCue(ast, cueElement = null) {
    const el = cueElement;
    if (!el) return;

    const astArgs = ast?.args || [];
    console.log("[scale] raw astArgs:", astArgs);

    // --- shorthand: scale(2) → scale(min:1, max:2, dur:2) ---
    if (astArgs.length === 1 && typeof astArgs[0].value === "number") {
        const val = Number(astArgs[0].value);
        return handleScaleContinuous(el, [
            { key: "min", value: 1 },
            { key: "max", value: val },
            { key: "dur", value: 2 }
        ]);
    }

    // Extract uniform or XY lists/patterns
    // 1) Try implicit/explicit uniform via `values`
    let values = null;
    const valuesArg = astArgs.find(o => o.key === "values" || o.type === "values");
    if (valuesArg) values = valuesArg.value;

    // 2) Try non-uniform named x/y
    let xVals = null, yVals = null;
    const xArg = astArgs.find(o => ["x", "valuesX"].includes(o.key || o.type));
    const yArg = astArgs.find(o => ["y", "valuesY"].includes(o.key || o.type));
    if (xArg) xVals = xArg.value;
    if (yArg) yVals = yArg.value;

    // Decide path
    if (values && values.type === "pattern") {
        // uniform pattern for both axes
        return handleScaleSequence(el, null, null, astArgs); // generators inside will mirror
    }
    if (Array.isArray(values)) {
        // uniform list → mirror to Y
        return handleScaleSequence(el, values, values, astArgs);
    }

    // If either x or y provided (list or pattern), treat as non-uniform
    if (xVals || yVals) {
        const ax = xVals && xVals.type === "pattern" ? null : (Array.isArray(xVals) ? xVals : null);
        const ay = yVals && yVals.type === "pattern" ? null : (Array.isArray(yVals) ? yVals : null);
        return handleScaleSequence(el, ax, ay, astArgs);
    }

    // No explicit values — continuous pulse fallback
    return handleScaleContinuous(el, astArgs);
}
