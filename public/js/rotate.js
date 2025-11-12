// OSC send helper for ROTATE

function sendOSCRotation(el, angle) {
 if (!window.socket) return;

    const uid = el.id || el.dataset.uid || null;
    const radians = angle * (Math.PI / 180);
    const norm = ((angle % 360) + 360) % 360 / 360;

    const msg = {
        type: "osc_rotate",
        uid,
        angle,
        radians,
        norm,
        timestamp: Date.now()
    };

    try {
        window.socket.send(JSON.stringify(msg));
        console.log("[rotate][osc]:", msg);

    } catch (e) {
        console.warn("[rotate][osc] send failed:", e);
    }
}


// ============================================================
// Pattern Generator (Pseq, Prand, Pxrand, Pshuf)
// ============================================================
function makePatternGenerator(pattern) {

    if (!pattern || !pattern.values || !Array.isArray(pattern.values)) {
        console.warn("[rotate] makePatternGenerator: invalid pattern:", pattern);
        return { next: () => null };
    }

    // Simple literal array case → treat as Pseq(..., inf)
    if (Array.isArray(pattern.values) && !pattern.type) {
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

    const values = pattern.values.slice(); // shallow copy
    let repeats = pattern.repeats;
    if (repeats === "inf" || repeats === Infinity || repeats == null) {
        repeats = Infinity;
    } else {
        repeats = Number(repeats);
        if (Number.isNaN(repeats)) repeats = 1;
    }

    let index = 0;
    let last = null;
    let cycleCount = 0;

    switch (pattern.name) {

        // --------------------------------------------------------
        // Pseq([a,b,c], repeats)
        // --------------------------------------------------------
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

        // --------------------------------------------------------
        // Prand([a,b,c], repeats)
        // fully random, allows repeats
        // --------------------------------------------------------
        case "Prand":
            return {
                next() {
                    if (cycleCount >= repeats) return null;
                    const v = values[Math.floor(Math.random() * values.length)];
                    cycleCount += 1 / values.length; // keeps approximate total length
                    return v;
                }
            };

        // --------------------------------------------------------
        // Pxrand([a,b,c], repeats)
        // random, but avoids immediate repetition
        // --------------------------------------------------------
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

        // --------------------------------------------------------
        // Pshuf([a,b,c], repeats)
        // shuffle the array, walk through, reshuffle at end
        // --------------------------------------------------------
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

    console.warn("[rotate] makePatternGenerator: unknown pattern type:", pattern.name);
    return { next: () => null };
}

// Utility: Fisher-Yates shuffle (pure)
function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}


// ---------------- VALUE PATTERN GENERATOR ----------------
function makeValueGenerator(pattern) {
    const { name, values } = pattern;
    let i = 0;
    let last = null;

    if (name === "Pseq") {
        return {
            next() {
                const v = values[i % values.length];
                i++;
                return v;
            }
        };
    }

    if (name === "Prand") {
        return {
            next() {
                const idx = Math.floor(Math.random() * values.length);
                return values[idx];
            }
        };
    }

    if (name === "Pxrand") {
        return {
            next() {
                let choice;
                do {
                    choice = values[Math.floor(Math.random() * values.length)];
                } while (choice === last && values.length > 1);
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

    console.warn("[rotate] Unknown pattern:", name);
    return { next() { return values[0]; } };
}



// ---------------------- PIVOT (no flashing) ----------------------
function applySvgPivot(el) {
    if (!el.getBBox) return;
    const bb = el.getBBox();
    if (!bb || bb.width === 0 || bb.height === 0) return;
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    el.style.transformOrigin = `${cx}px ${cy}px`; // critical fix
}

// ---------------------- ANGLE READING ----------------------
function getCurrentAngle(el, defaultDeg = 0) {
    const t = el.style.transform;
    if (!t) return defaultDeg;
    const m = t.match(/rotate\(([-+0-9.]+)(deg|rad)\)/);
    if (!m) return defaultDeg;

    let val = parseFloat(m[1]);
    if (m[2] === "rad") val = val * (180 / Math.PI);
    return isNaN(val) ? defaultDeg : val;
}

// ---------------------- SEQUENCE MODE ----------------------
function handleRotateSequence(el, values, astArgs) {

    let dur = 1;
    let durGen = null;       // pattern generator for duration
    let valueGen = null;     // pattern generator for values
    let mode = "loop";       // "loop" | "once" | "alternate"
    let pauseOnExit = true;
    let interp = "smooth";   // "smooth" or "step"
    let ease = "linear";
    let hold = null;
    let oscMode = 0; // 0 = off, 1 = continuous, 2 = per-step


    // ---- parse args ----
    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const val = arg.value;

        // VALUES argument (list or pattern)
        if (key === "values") {
            if (val && typeof val === "object" && val.type === "pattern") {
                valueGen = makePatternGenerator(val);   // pattern-based values
            } else if (Array.isArray(val)) {
                values = val.slice();                   // literal list
            }
        }

        // DUR argument (scalar, list, or pattern)
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

    // ---- default hold behavior ----
    if (interp === "smooth" && (hold === null || Number.isNaN(hold))) {
        hold = dur * 0.25;
    }
    if (interp === "step") {
        hold = 0; // not used in step mode
    }

    // ---- stop previous animation ----
    if (el._oscillaRotateAnim) {
        el._oscillaRotateAnim.pause?.();
        clearTimeout(el._oscillaRotateAnim);
        el._oscillaRotateAnim = null;
    }

    applySvgPivot(el);

    const N = Array.isArray(values) ? values.length : Infinity;
    let index = 0;
    let direction = 1;

    // driver holds the continuous angle value
    let start = getCurrentAngle(el, values[0] ?? 0);
    start = ((start % 360) + 360) % 360;
    const driver = { a: start };

    function runNext() {

        // ---- retrieve next angle ----
        const target = valueGen ? valueGen.next() : values[index];

        // ---- once-terminal condition ----
        if (!valueGen && mode === "once" && index >= N) {
            if (!pauseOnExit) {
                el.style.transform = `rotate(${values[0]}deg)`;
            }
            el._oscillaRotateAnim = null;
            return;
        }

        // ---- determine next index (literal list only) ----
        if (!valueGen) {
            let nextIndex = index + 1;

            if (mode === "alternate") {
                nextIndex = index + direction;
                if (nextIndex >= N || nextIndex < 0) {
                    direction *= -1;
                    nextIndex = index + direction;
                }
            }

            index = (mode === "loop" ? (nextIndex % N) : nextIndex);
        }

        // ---- STEP MODE (immediate snap + wait) ----
        if (interp === "step") {
            driver.a = target;
            el.style.transform = `rotate(${target}deg)`;

            if (oscMode === 1 || oscMode === 2) {
                sendOSCRotation(el, target);
            }

            const stepDur = durGen ? durGen.next() : dur;
            el._oscillaRotateAnim = setTimeout(runNext, stepDur * 1000);
            return;
        }
        // ---- SMOOTH MODE ----
        // Always re-sync driver to actual rendered angle before calculating delta
        let current = getCurrentAngle(el, driver.a);
        current = ((current % 360) + 360) % 360;
        driver.a = current; // authoritative sync        
        // 
        let tgt = ((target % 360) + 360) % 360;
        let delta = tgt - current;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        if (tgt === driver.deg) { stepIndexAdvance(); return runNext(); }

        const stepDur = durGen ? durGen.next() : dur;

        const anim = anime({
            targets: driver,
            a: driver.a + delta,
            duration: stepDur * 1000,
            easing: ease,
            update: () => {
                let a = ((driver.a % 360) + 360) % 360;
                el.style.transform = `rotate(${a}deg)`;

                if (oscMode === 1) { // continuous
                    sendOSCRotation(el, a);
                }
            },
            complete: () => {
                if (oscMode === 2) { // step mode send only at step completion
                    let finalA = ((driver.a % 360) + 360) % 360;
                    sendOSCRotation(el, finalA);
                }

                if (hold > 0) {
                    el._oscillaRotateAnim = setTimeout(runNext, hold * 1000);
                } else {
                    runNext();
                }
            }
        });


        el._oscillaRotateAnim = anim;
    }

    runNext();
}



// ---------------------- MAIN ENTRY ----------------------
export function handleRotateCue(el, astArgs) {
    console.log("[rotate] raw astArgs:", astArgs);

    if (!el) return;

    // Locate the "values" argument (works whether arg is stored as key or type)
    const valuesArg = astArgs.find(o =>
        o.key === "values" ||
        o.type === "values"
    );

    if (valuesArg) {
        const v = valuesArg.value;

        // Pattern object case (Pseq / Prand / Pxrand / Pshuf / others)
        // We do NOT unpack here. We simply pass the pattern object onward.
        if (v && v.type === "pattern" && Array.isArray(v.values)) {
            return handleRotateSequence(el, v, astArgs);
        }

        // Literal array case
        if (Array.isArray(v)) {
            return handleRotateSequence(el, v, astArgs);
        }
    }

    // --------------------------------------------------------------------
    // Continuous rotation fallback (rotate(dir:-1, dur:2, loop:0, ...))
    // This is only used when there is no values:[...] provided.
    // --------------------------------------------------------------------

    let dir = 1;
    let dur = 2;
    let loop = 0;       // 0 = infinite
    let interp = "smooth";
    let ease = "linear";
    let mode = "loop";        // included to properly read mode even though fallback ignores it
    let pauseOnExit = true;

    // Parse remaining args
    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const value = arg.value;

        if (key === "dir") dir = Number(value);
        if (key === "dur") dur = Number(value);
        if (key === "loop") loop = Number(value);
        if (key === "mode") mode = String(value).trim().toLowerCase();
        if (key === "pauseOnExit") pauseOnExit = Boolean(value);
        if (key === "interp") interp = String(value).trim().toLowerCase();
        if (key === "ease") ease = String(value).trim();
    }

    // Cancel previous animation if still running
    if (el._oscillaRotateAnim) el._oscillaRotateAnim.pause?.();
    applySvgPivot(el);

    const fullTurn = dir * 360;
    const ms = dur * 1000;

    // Continuous rotation via anime.js
    const anim = anime({
        targets: el,
        rotate: `+=${fullTurn}`,
        duration: ms,
        easing: ease,
        loop: loop === 0 ? true : loop
    });

    el._oscillaRotateAnim = anim;

    console.log(`[rotate] start fallback`, {
        id: el.id,
        dir,
        dur,
        loop,
        interp,
        ease,
        pivot: el.style.transformOrigin
    });
}





