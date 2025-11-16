//
// o2p.js — Clean Modern Rewrite
// -----------------------------------------------------------
// Modes:
//   - forward
//   - reverse
//   - alternate (true ping-pong)
// Features:
//   - dur (seconds)
//   - loop (0 = infinite)
//   - rotate:true/false (visual rotation)
//   - osc:false, 0, true, or number (throttle ms)
//   - ease: single int/string or list [...]
//   - start/end: 0..1 segment slicing
//   - uid override
// -----------------------------------------------------------


/* ---------------------------------------------------------
 *  1. normalizeOrigin(el)
 *     Centers ANY SVG element/group at (0,0)
 * --------------------------------------------------------*/
function normalizeOrigin(el) {
    function flatten(node) {
        try {
            if (typeof SVGPathCommander !== "undefined") {
                SVGPathCommander.toPath(node);
            }
        } catch (_) { }
    }

    // flatten transform on self
    if (el.hasAttribute("transform")) {
        flatten(el);
        el.removeAttribute("transform");
    }

    // flatten child transforms if group
    if (el instanceof SVGGElement) {
        for (const child of [...el.children]) {
            if (child.hasAttribute("transform")) {
                flatten(child);
                child.removeAttribute("transform");
            }
        }
    }

    // compute bbox center
    const bbox = el.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    if (!isFinite(cx) || !isFinite(cy)) return;

    // recursive shift
    function shift(node, dx, dy) {
        const tag = node.tagName;

        if (tag === "path") {
            const d = node.getAttribute("d");
            if (d) {
                try {
                    const cmd = new SVGPathCommander(d);
                    node.setAttribute("d", cmd.translate(-dx, -dy).toString());
                } catch (_) { }
            }
        }
        else if (tag === "rect") {
            const x = parseFloat(node.getAttribute("x")) || 0;
            const y = parseFloat(node.getAttribute("y")) || 0;
            node.setAttribute("x", x - dx);
            node.setAttribute("y", y - dy);
        }
        else if (tag === "circle" || tag === "ellipse") {
            const x = parseFloat(node.getAttribute("cx")) || 0;
            const y = parseFloat(node.getAttribute("cy")) || 0;
            node.setAttribute("cx", x - dx);
            node.setAttribute("cy", y - dy);
        }
        else if (tag === "polygon" || tag === "polyline") {
            const pts = node.points;
            for (let i = 0; i < pts.numberOfItems; i++) {
                const p = pts.getItem(i);
                p.x -= dx;
                p.y -= dy;
            }
        }
        else if (node instanceof SVGGElement) {
            for (const c of [...node.children]) shift(c, dx, dy);
        }
    }

    shift(el, cx, cy);
}


/* ---------------------------------------------------------
 *  2. ease controller
 * --------------------------------------------------------*/
function normalizeEase(easeVal) {
    const easingMap = {
        0: "linear",
        1: "easeInSine",
        2: "easeOutSine",
        3: "easeInOutSine",
        4: "easeInBack",
        5: "easeOutBack",
        6: "easeInOutBack",
        7: "easeInElastic",
        8: "easeOutElastic",
        9: "easeInOutElastic"
    };

    let seq = [];

    if (Array.isArray(easeVal)) {
        seq = easeVal.map(e =>
            typeof e === "number" ? easingMap[e] || "easeInOutSine" : String(e)
        );
    } else if (typeof easeVal === "number") {
        seq = [easingMap[easeVal] || "easeInOutSine"];
    } else if (typeof easeVal === "string") {
        seq = [easeVal];
    } else {
        seq = ["easeInOutSine"];
    }

    let i = 0;
    return {
        next() {
            const val = seq[i % seq.length];
            i++;
            return val;
        }
    };
}


/* ---------------------------------------------------------
 *  3. VirtualPath
 *     Unified sampler with segment slicing
 * --------------------------------------------------------*/
class VirtualPath {
    constructor(paths) {
        this.paths = paths;
        if (!paths || paths.length === 0) {
            this.totalLen = 0;
            return;
        }
        this.totalLen = this.computeTotalLength();
    }

    computeTotalLength() {
        let sum = 0;
        for (const p of this.paths) sum += p.getTotalLength();
        return sum;
    }

    // globalT: 0..1 mapped to concatenated paths
    sample(globalT) {
        if (!this.totalLen || globalT < 0 || globalT > 1) return null;

        let target = globalT * this.totalLen;
        let acc = 0;

        for (const path of this.paths) {
            const L = path.getTotalLength();
            if (acc + L >= target) {
                const local = target - acc;
                const point = path.getPointAtLength(local);
                const pathT = local / L;
                return { path, point, pathT, distance: local };
            }
            acc += L;
        }
        return null;
    }
}


/* ---------------------------------------------------------
 *  4. Path segment mapper (start/end)
 * --------------------------------------------------------*/
function makeTMapper(start, end) {
    const a = Math.max(0, Math.min(1, start ?? 0));
    const b = Math.max(0, Math.min(1, end ?? 1));
    const d = b - a;
    return t => a + t * d;
}


/* ---------------------------------------------------------
 *  5. Unified transform writer
 * --------------------------------------------------------*/
function applyTransform(el, point, angleDeg, rotate) {
    let t = `translate(${point.x}, ${point.y})`;
    if (rotate === true) {
        t += ` rotate(${angleDeg})`;
    }
    el.setAttribute("transform", t);
    el.style.transform = "";
}


/* ---------------------------------------------------------
 *  6. OSC emitter
 * --------------------------------------------------------*/
function emitO2POsc({ uid, path, point, pathT, oscCfg }) {
    if (!oscCfg.enabled) return;

    const now = performance.now();
    if (now - oscCfg.lastSent < oscCfg.throttle) return;
    oscCfg.lastSent = now;

    const bbox = path.getBBox();
    const normX = (point.x - bbox.x) / bbox.width;
    const normY = (point.y - bbox.y) / bbox.height;

    const length = path.getTotalLength();
    const localL = pathT * length;
    const ahead = path.getPointAtLength(Math.min(length, localL + 0.1));
    const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);

    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) return;

    window.socket.send(
        JSON.stringify({
            type: "osc_obj2path",
            uid,
            x: normX,
            y: normY,
            angle
        })
    );
}


/* ---------------------------------------------------------
 *  7. Continuous mode (forward/reverse)
 * --------------------------------------------------------*/
function startContinuousO2P(el, cfg, virtual, uid) {
    const { dur, loop, rotate, oscCfg, start, end, next, nextOn } = cfg;
    normalizeOrigin(el);

    if (el._o2pAnim) el._o2pAnim.pause?.();

    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center";

    const easeCtrl = normalizeEase(cfg.ease);
    const tMap = makeTMapper(start, end);

    const driver = { u: 0 };
    const cycles = loop === 0 ? true : loop;
    const durationMs = dur * 1000;

    if (!window.runningAnimations) window.runningAnimations = {};
    window.runningAnimations[uid] = {
        pause: () => el._o2pAnim?.pause(),
        play: () => el._o2pAnim?.play(),
        resume: () => el._o2pAnim?.play(),
        stop: () => el._o2pAnim?.pause(),
        wasPaused: false
    };

    const anim = anime({
        targets: driver,
        u: 1,
        duration: durationMs,
        easing: easeCtrl.next(),
        loop: cycles,
        direction: "normal",

        update: () => {
            let phase = driver.u;
            if (cfg.mode === "reverse") phase = 1 - phase;

            const globalT = tMap(phase);
            const sample = virtual.sample(globalT);
            if (!sample) return;

            const { path, point, pathT } = sample;

            const length = path.getTotalLength();
            const localL = pathT * length;
            const ahead = path.getPointAtLength(Math.min(length, localL + 0.1));
            const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);

            applyTransform(el, point, angle, rotate);

            emitO2POsc({ uid, path, point, pathT, oscCfg });
        },

        loopComplete: () => {
            if (next && nextOn === "cycle") {
                window.handleCueTrigger?.(next);
            }
        },

        complete: () => {
            if (loop !== 0 && next && nextOn === "stop") {
                window.handleCueTrigger?.(next);
            }
        }
    });

    el._o2pAnim = anim;
}


/* ---------------------------------------------------------
 *  8. Alternate mode (true ping-pong)
 * --------------------------------------------------------*/
function startAlternateO2P(el, cfg, virtual, uid) {
    const { dur, loop, rotate, oscCfg, start, end, next, nextOn } = cfg;
    normalizeOrigin(el);

    if (el._o2pAnim) el._o2pAnim.pause?.();
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center";

    const tMap = makeTMapper(start, end);
    const easeCtrl = normalizeEase(cfg.ease);

    const driver = { u: 0 };
    let remaining = loop === 0 ? Infinity : loop;
    let stopped = false;

    if (!window.runningAnimations) window.runningAnimations = {};
    window.runningAnimations[uid] = {
        pause: () => el._o2pAnim?.pause(),
        resume: () => el._o2pAnim?.play(),
        play: () => el._o2pAnim?.play(),
        stop: () => { stopped = true; el._o2pAnim?.pause(); },
        wasPaused: false
    };

    function halfCycle(directionSign) {
        return new Promise(resolve => {
            driver.u = 0;
            const ease = easeCtrl.next();

            const anim = anime({
                targets: driver,
                u: 1,
                duration: dur * 1000,
                easing: ease,

                update: () => {
                    const phase = directionSign === 1 ? driver.u : 1 - driver.u;
                    const globalT = tMap(phase);
                    const sample = virtual.sample(globalT);
                    if (!sample) return;

                    const { path, point, pathT } = sample;

                    const length = path.getTotalLength();
                    const localL = pathT * length;
                    const ahead = path.getPointAtLength(Math.min(length, localL + 0.1));
                    const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);

                    applyTransform(el, point, angle, rotate);
                    emitO2POsc({ uid, path, point, pathT, oscCfg });
                },

                complete: resolve
            });

            el._o2pAnim = anim;
        });
    }

    (async () => {
        while (!stopped && remaining > 0) {
            await halfCycle(+1);
            if (stopped) break;

            await halfCycle(-1);
            if (stopped) break;

            if (remaining !== Infinity) remaining--;
            if (next && nextOn === "cycle") {
                window.handleCueTrigger?.(next);
            }
        }

        if (!stopped && loop !== 0 && next && nextOn === "stop") {
            window.handleCueTrigger?.(next);
        }
    })();
}


/* ---------------------------------------------------------
 *  9. Dispatcher: startO2PForElement
 * --------------------------------------------------------*/
function startO2PForElement(el, cfg) {
    // kill existing
    if (el._o2pAnim) {
        try { el._o2pAnim.pause(); } catch (_) { }
        el._o2pAnim = null;
    }

    // normalize mode
    cfg.mode = (cfg.mode ?? "forward").toLowerCase();

    // build OSC config
    const osc = cfg.osc;
    let oscCfg = { enabled: false, throttle: 30, lastSent: 0 };
    if (osc === false || osc === 0) {
        oscCfg.enabled = false;
    } else if (osc === true) {
        oscCfg.enabled = true;
    } else if (typeof osc === "number") {
        oscCfg.enabled = true;
        oscCfg.throttle = Math.max(5, osc);
    }
    cfg.oscCfg = oscCfg;

    // resolve path(s)
    const svg = el.ownerSVGElement || document.querySelector("svg");
    const p = svg.querySelector(`#${cfg.path}`);
    if (!p) {
        console.warn("[o2p] Path not found:", cfg.path);
        return;
    }

    const virtual = new VirtualPath([p]);
    if (!virtual.totalLen) return;

    const uid = cfg.uid || el.id || ("o2p_" + Math.random().toString(36).slice(2));
    cfg.uid = uid;

    window.o2pState ??= {};
    window.o2pState[uid] = {};

    if (cfg.mode === "alternate") {
        startAlternateO2P(el, cfg, virtual, uid);
    } else {
        startContinuousO2P(el, cfg, virtual, uid);
    }
}
export function handleO2PCue(el, args) {
    try {
        // args may be missing or malformed → normalize it
        if (!Array.isArray(args)) args = [];

        const cfg = {
            path: null,
            mode: "forward",
            dur: 1,
            loop: 0,
            rotate: false,
            ease: 3,
            osc: false,
            start: 0,
            end: 1,
            uid: null,
            next: null,
            nextOn: null
        };

        // Parse args (from DSL AST)
        for (const a of args) {
            const key = a.type;
            const val = a.value;

            switch (key) {
                case "path": cfg.path = val; break;
                case "mode": if (val != null) cfg.mode = String(val).toLowerCase(); break;
                case "dur": cfg.dur = Number(val) || 1; break;
                case "loop": cfg.loop = Number(val) || 0; break;
                case "rotate": cfg.rotate = Boolean(val); break;
                case "ease": cfg.ease = val; break;
                case "osc": cfg.osc = val; break;
                case "start": cfg.start = Number(val); break;
                case "end": cfg.end = Number(val); break;
                case "uid": cfg.uid = val; break;
                case "next": cfg.next = val; break;
                case "nextOn": cfg.nextOn = val; break;
            }
        }
        // Alias support
        if (cfg.mode === "fwd") cfg.mode = "forward";
        if (cfg.mode === "rev") cfg.mode = "reverse";
        if (cfg.mode === "alt") cfg.mode = "alternate";

        // Fallback: first arg is path if unlabeled
        if (!cfg.path && args.length > 0) {
            const first = args[0];
            if (typeof first.value === "string") cfg.path = first.value;
        }

        if (!cfg.path) {
            console.warn("[o2p] Missing required argument: path — parsed args:", args);
            return;
        }

        startO2PForElement(el, cfg);

    } catch (err) {
        console.error("[o2p] ERROR in handleO2PCue:", err);
    }
}
