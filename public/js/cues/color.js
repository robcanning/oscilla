// oscillaAnimationColor.js — Oscilla Color Animation Cue
// Animates SVG fill/stroke colors using HSL interpolation
//
// Supports:
// - Discrete color sequences: vals:[#f00, #0f0, #00f]
// - Pattern sequences: vals:Pseq([#f00, #ff0], 3)
// - Continuous hue cycling: vals:hue or vals:hue(120, 240)
// - Modes: linear (smooth), alt (ping-pong), step (hard switch)

import { registerAnimation } from "./animation.js";
import { scheduleCueStart } from "../oscillaCueDispatcher.js";
import {
    applyPrestateBeforeStart,
    applyPrestateOnStart,
    installOscToggleHandler,
    armGhostClickable,
    needsArming,
    needsFadeIn,
    triggerFadeIn,
    isOscEnabled
} from "./animShared.js";

import { sendOSCMessage, createOscOverlay } from "./osc.js";

// ============================================================
// COLOR UTILITIES
// ============================================================

/**
 * Parse a color string to HSL
 * Supports: #rgb, #rrggbb, rgb(), hsl(), named colors
 */
function parseColorToHSL(colorStr) {
    if (!colorStr) return { h: 0, s: 50, l: 50 };
    
    const str = String(colorStr).trim().toLowerCase();
    
    // HSL format: hsl(h, s%, l%)
    const hslMatch = str.match(/^hsl\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)$/i);
    if (hslMatch) {
        return {
            h: parseFloat(hslMatch[1]) % 360,
            s: parseFloat(hslMatch[2]),
            l: parseFloat(hslMatch[3])
        };
    }
    
    // RGB format: rgb(r, g, b)
    const rgbMatch = str.match(/^rgb\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
    if (rgbMatch) {
        return rgbToHSL(
            parseFloat(rgbMatch[1]),
            parseFloat(rgbMatch[2]),
            parseFloat(rgbMatch[3])
        );
    }
    
    // Hex format: #rgb or #rrggbb
    if (str.startsWith('#')) {
        const hex = str.slice(1);
        let r, g, b;
        
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else {
            return { h: 0, s: 50, l: 50 };
        }
        
        return rgbToHSL(r, g, b);
    }
    
    // Named colors (common subset)
    const namedColors = {
        red: { h: 0, s: 100, l: 50 },
        orange: { h: 30, s: 100, l: 50 },
        yellow: { h: 60, s: 100, l: 50 },
        green: { h: 120, s: 100, l: 50 },
        cyan: { h: 180, s: 100, l: 50 },
        blue: { h: 240, s: 100, l: 50 },
        purple: { h: 270, s: 100, l: 50 },
        magenta: { h: 300, s: 100, l: 50 },
        pink: { h: 330, s: 100, l: 75 },
        white: { h: 0, s: 0, l: 100 },
        black: { h: 0, s: 0, l: 0 },
        gray: { h: 0, s: 0, l: 50 },
        grey: { h: 0, s: 0, l: 50 }
    };
    
    if (namedColors[str]) {
        return { ...namedColors[str] };
    }
    
    // Fallback
    return { h: 0, s: 50, l: 50 };
}

/**
 * Convert RGB to HSL
 */
function rgbToHSL(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    
    return {
        h: h * 360,
        s: s * 100,
        l: l * 100
    };
}

/**
 * Convert HSL to CSS string
 */
function hslToCSS(h, s, l) {
    return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
}

/**
 * Interpolate between two HSL colors
 * Uses shortest path for hue interpolation
 */
function interpolateHSL(from, to, t) {
    // Hue interpolation (shortest path around the circle)
    let hDiff = to.h - from.h;
    if (hDiff > 180) hDiff -= 360;
    if (hDiff < -180) hDiff += 360;
    
    const h = (from.h + hDiff * t + 360) % 360;
    const s = from.s + (to.s - from.s) * t;
    const l = from.l + (to.l - from.l) * t;
    
    return { h, s, l };
}

/**
 * Get current color from element
 */
function getCurrentColor(el, target = "both") {
    const style = window.getComputedStyle(el);
    
    // Try fill first, then stroke
    if (target === "fill" || target === "both") {
        const fill = style.fill;
        if (fill && fill !== 'none') {
            return parseColorToHSL(fill);
        }
    }
    
    if (target === "stroke" || target === "both") {
        const stroke = style.stroke;
        if (stroke && stroke !== 'none') {
            return parseColorToHSL(stroke);
        }
    }
    
    return { h: 0, s: 100, l: 50 };
}

/**
 * Apply color to element
 * @param {SVGElement} el - Target element
 * @param {object} hsl - HSL color object
 * @param {string} target - "fill", "stroke", or "both" (default)
 */
function applyColor(el, hsl, target = "both") {
    const css = hslToCSS(hsl.h, hsl.s, hsl.l);
    
    if (target === "fill" || target === "both") {
        el.style.fill = css;
    }
    
    if (target === "stroke" || target === "both") {
        el.style.stroke = css;
    }
}

// ============================================================
// OSC SEND HELPER
// ============================================================
function sendOSCColor(cfg, hsl) {
    const addr = cfg.oscAddr ?? cfg.oscaddr ?? cfg.addr ?? null;
    
    const payload = {
        type: "osc_color",
        uid: cfg.uid,
        h: hsl.h,
        s: hsl.s,
        l: hsl.l,
        hNorm: hsl.h / 360,
        sNorm: hsl.s / 100,
        lNorm: hsl.l / 100,
        timestamp: Date.now()
    };
    
    if (addr) payload.addr = addr;
    
    sendOSCMessage(payload);
}

// ============================================================
// PATTERN GENERATOR
// ============================================================
function makePatternGenerator(pattern) {
    if (!pattern || !pattern.values || !Array.isArray(pattern.values)) {
        console.warn("[color] makePatternGenerator: invalid pattern:", pattern);
        return { next: () => null };
    }

    // Literal list → infinite sequence
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

    console.warn("[color] makePatternGenerator: unknown pattern type:", pattern.name);
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

// ============================================================
// HUE CYCLING ENGINE
// ============================================================
function handleColorHueCycle(el, cfg) {
    const astArgs = cfg.astArgs || [];
    
    let dur = 6;
    let loop = 0; // infinite by default
    let hueStart = 0;
    let hueEnd = 360;
    let oscMode = 0;
    let target = cfg.target || "both"; // fill, stroke, or both
    
    // Parse args
    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const val = arg.value;
        
        if (key === "dur") dur = Number(val) || 6;
        if (key === "loop") loop = Number(val);
        if (key === "osc") oscMode = Number(val) || 0;
        if (key === "oscaddr" || key === "oscAddr") cfg.oscAddr = String(val).trim();
        if (key === "target") target = String(val).toLowerCase();
    }
    
    // Check for hue range in vals: hue(start, end)
    const valsArg = astArgs.find(a => a.key === "vals" || a.type === "vals");
    if (valsArg?.value?.type === "func" && valsArg.value.name === "hue") {
        const args = valsArg.value.args || [];
        if (args.length >= 2) {
            hueStart = Number(args[0]) || 0;
            hueEnd = Number(args[1]) || 360;
        }
    }
    
    // Get base saturation/lightness from element
    const baseColor = getCurrentColor(el, target);
    const baseSat = baseColor.s;
    const baseLight = baseColor.l;
    
    // Stop any existing animation
    if (el._oscillaColorAnim) {
        cancelAnimationFrame(el._oscillaColorAnim);
    }
    
    const ms = dur * 1000;
    const hueRange = hueEnd - hueStart;
    let startTime = null;
    let completedCycles = 0;
    
    // OSC overlay
    if (cfg._overlay) {
        cfg._overlay.destroy();
        cfg._overlay = null;
    }
    
    if (isOscEnabled(cfg, oscMode)) {
        cfg._overlay = createOscOverlay({
            anchorEl: el,
            label: cfg.oscAddr || cfg.uid || "color",
            anchorMode: "center",
            mode: "auto"
        });
        cfg._overlay.update("hue:0");
        cfg._overlay.position();
    }
    
    function tick(time) {
        if (!startTime) startTime = time;
        const elapsed = time - startTime;
        
        // Calculate progress through current cycle
        const cycleProgress = (elapsed % ms) / ms;
        
        // Check for cycle completion
        const currentCycle = Math.floor(elapsed / ms);
        if (currentCycle > completedCycles) {
            completedCycles = currentCycle;
            
            // Check loop limit
            if (loop > 0 && completedCycles >= loop) {
                // Land on final hue
                const finalHue = hueEnd % 360;
                applyColor(el, { h: finalHue, s: baseSat, l: baseLight }, target);
                return; // Stop animation
            }
        }
        
        // Calculate current hue
        const currentHue = (hueStart + hueRange * cycleProgress) % 360;
        const hsl = { h: currentHue, s: baseSat, l: baseLight };
        
        applyColor(el, hsl, target);
        
        // OSC
        if (isOscEnabled(cfg, oscMode)) {
            sendOSCColor(cfg, hsl);
            if (cfg._overlay) {
                cfg._overlay.update(`hue:${currentHue.toFixed(0)}`);
            }
        }
        
        el._oscillaColorAnim = requestAnimationFrame(tick);
    }
    
    el._oscillaColorAnim = requestAnimationFrame(tick);
    cfg._anim = { pause: () => cancelAnimationFrame(el._oscillaColorAnim) };
}

// ============================================================
// COLOR SEQUENCE ENGINE
// ============================================================
function handleColorSequence(el, cfg) {
    const astArgs = cfg.astArgs || [];
    
    let values = cfg.values || null;
    let pattern = cfg.pattern || null;
    let dur = 1;
    let durGen = null;
    let mode = "linear"; // linear | alt | step
    let loop = 0;
    let oscMode = 0;
    let target = cfg.target || "both"; // fill, stroke, or both
    
    // Pattern/value generator
    let valueGen = null;
    
    // Parse args
    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const val = arg.value;
        
        switch (key) {
            case "vals":
            case "values":
                if (val && val.type === "pattern") {
                    pattern = val;
                } else if (Array.isArray(val)) {
                    values = val.slice();
                }
                break;
                
            case "dur":
                if (val && val.type === "pattern") {
                    durGen = makePatternGenerator(val);
                } else if (Array.isArray(val)) {
                    durGen = makePatternGenerator({ values: val });
                } else {
                    dur = Number(val) || 1;
                }
                break;
                
            case "mode":
                mode = String(val).trim().toLowerCase();
                break;
                
            case "loop":
                loop = Number(val);
                break;
                
            case "osc":
                oscMode = Number(val) || 0;
                break;
                
            case "oscaddr":
            case "oscAddr":
                cfg.oscAddr = String(val).trim();
                break;
                
            case "target":
                target = String(val).toLowerCase();
                break;
        }
    }
    
    // Set up value generator
    if (pattern) {
        valueGen = makePatternGenerator(pattern);
        values = null;
    }
    
    // Need values array for sequence
    if (!values && !valueGen) {
        console.warn("[color] No values for sequence");
        return;
    }
    
    // Convert values to HSL
    let hslValues = [];
    if (values) {
        hslValues = values.map(v => parseColorToHSL(v));
    }
    
    // Stop existing animation
    if (el._oscillaColorAnim) {
        cancelAnimationFrame(el._oscillaColorAnim);
    }
    
    // OSC overlay
    if (cfg._overlay) {
        cfg._overlay.destroy();
        cfg._overlay = null;
    }
    
    if (isOscEnabled(cfg, oscMode)) {
        cfg._overlay = createOscOverlay({
            anchorEl: el,
            label: cfg.oscAddr || cfg.uid || "color",
            anchorMode: "center",
            mode: "auto"
        });
        cfg._overlay.update("...");
        cfg._overlay.position();
    }
    
    // Animation state
    let startTime = null;
    let currentIndex = 0;
    let direction = 1; // for alt mode
    let completedCycles = 0;
    let segmentStartTime = 0;
    let currentDur = durGen ? durGen.next() : dur;
    
    function tick(time) {
        if (!startTime) {
            startTime = time;
            segmentStartTime = time;
        }
        
        const segmentElapsed = time - segmentStartTime;
        const segmentMs = (currentDur || dur) * 1000;
        
        // Get color values (from pattern or array)
        let fromHSL, toHSL;
        
        if (valueGen) {
            // Pattern mode - get current and next
            if (!el._colorPatternCurrent) {
                el._colorPatternCurrent = parseColorToHSL(valueGen.next());
                el._colorPatternNext = parseColorToHSL(valueGen.next());
            }
            fromHSL = el._colorPatternCurrent;
            toHSL = el._colorPatternNext;
        } else {
            // Array mode
            const nextIndex = mode === "alt" 
                ? currentIndex + direction
                : (currentIndex + 1) % hslValues.length;
            
            fromHSL = hslValues[currentIndex];
            toHSL = hslValues[Math.abs(nextIndex) % hslValues.length];
        }
        
        // Calculate interpolation progress
        let t = Math.min(1, segmentElapsed / segmentMs);
        
        // Apply easing (linear for now, could add more)
        // t = t; // linear
        
        let currentHSL;
        
        if (mode === "step") {
            // No interpolation - hard switch at 50%
            currentHSL = t < 0.5 ? fromHSL : toHSL;
        } else {
            // Smooth interpolation
            currentHSL = interpolateHSL(fromHSL, toHSL, t);
        }
        
        applyColor(el, currentHSL, target);
        
        // OSC
        if (isOscEnabled(cfg, oscMode)) {
            sendOSCColor(cfg, currentHSL);
            if (cfg._overlay) {
                cfg._overlay.update(`h:${currentHSL.h.toFixed(0)}`);
            }
        }
        
        // Segment complete?
        if (segmentElapsed >= segmentMs) {
            segmentStartTime = time;
            currentDur = durGen ? durGen.next() : dur;
            
            if (valueGen) {
                // Pattern mode - shift colors
                el._colorPatternCurrent = el._colorPatternNext;
                const nextVal = valueGen.next();
                if (nextVal === null) {
                    // Pattern exhausted
                    return;
                }
                el._colorPatternNext = parseColorToHSL(nextVal);
            } else {
                // Array mode
                if (mode === "alt") {
                    currentIndex += direction;
                    // Reverse at ends
                    if (currentIndex >= hslValues.length - 1) {
                        direction = -1;
                        completedCycles++;
                    } else if (currentIndex <= 0) {
                        direction = 1;
                        completedCycles++;
                    }
                } else {
                    currentIndex = (currentIndex + 1) % hslValues.length;
                    if (currentIndex === 0) {
                        completedCycles++;
                    }
                }
                
                // Check loop limit
                if (loop > 0 && completedCycles >= loop) {
                    return; // Stop animation
                }
            }
        }
        
        el._oscillaColorAnim = requestAnimationFrame(tick);
    }
    
    el._oscillaColorAnim = requestAnimationFrame(tick);
    cfg._anim = { pause: () => cancelAnimationFrame(el._oscillaColorAnim) };
}

// ============================================================
// MAIN CUE HANDLER
// ============================================================
export function handleColorCue(el, astArgs, options = {}) {
    if (!el) return;
    
    const { fromCueTrigger = false } = options;
    
    // Check for existing cfg (playhead re-trigger)
    const existingCfg = el._oscillaCfg;
    
    if (fromCueTrigger && existingCfg && existingCfg._ghostClickable) {
        if (needsArming(existingCfg)) {
            armGhostClickable(el, existingCfg);
        }
        return;
    }
    
    if (fromCueTrigger && existingCfg && existingCfg._fadeInMs) {
        if (needsFadeIn(existingCfg)) {
            triggerFadeIn(el, existingCfg);
        }
        return;
    }
    
    // Parse basic params
    let trig = "auto";
    let uid = el.id || ("color_" + Math.random().toString(36).slice(2));
    let cfgStartDelay = 0;
    let prestate = "show";
    let target = "both"; // fill, stroke, or both
    
    for (const a of astArgs) {
        const key = a.key || a.type;
        const val = a.value;
        
        if (key === "trig") trig = String(val).toLowerCase();
        if (key === "uid") uid = String(val).trim();
        if (key === "tdelay") cfgStartDelay = Number(val) || 0;
        if (key === "prestate" && val != null) prestate = val;
        if (key === "target") target = String(val).toLowerCase();
    }
    
    const shouldStartNow = fromCueTrigger || trig === "auto" || trig === "playhead";
    
    // Build config
    const baseCfg = {
        uid,
        trig,
        start: cfgStartDelay,
        prestate,
        target,
        astArgs,
        fromCueTrigger,
        kind: "color",
        _anim: null
    };
    
    // Check vals argument to determine mode
    const valsArg = astArgs.find(a => a.key === "vals" || a.type === "vals");
    
    // Determine if hue cycling mode
    let isHueCycle = false;
    if (valsArg?.value === "hue") {
        isHueCycle = true;
    } else if (valsArg?.value?.type === "func" && valsArg.value.name === "hue") {
        isHueCycle = true;
    }
    
    function makeRawStart(cfg, modeFn) {
        return () => {
            modeFn(el, cfg);
        };
    }
    
    function wrapStart(cfg, rawStartFn) {
        cfg._start = rawStartFn;
        cfg._applyPrestateOnStart = () => applyPrestateOnStart(el, cfg);
        
        return () => {
            if (cfg.start > 0) {
                scheduleCueStart(
                    cfg,
                    el,
                    () => {
                        if (cfg._ghostClickable && cfg._startBlocked) {
                            applyPrestateOnStart(el, cfg);
                            return;
                        }
                        applyPrestateOnStart(el, cfg);
                        rawStartFn();
                    },
                    cfg.uid
                );
            } else {
                if (cfg._ghostClickable && cfg._startBlocked) {
                    applyPrestateOnStart(el, cfg);
                    return;
                }
                applyPrestateOnStart(el, cfg);
                rawStartFn();
            }
        };
    }
    
    // ============================================================
    // HUE CYCLING MODE
    // ============================================================
    if (isHueCycle) {
        const cfg = {
            ...baseCfg,
            mode: "hue-cycle"
        };
        
        el._oscillaCfg = cfg;
        
        installOscToggleHandler(el, cfg);
        applyPrestateBeforeStart(el, cfg);
        
        const rawStart = makeRawStart(cfg, handleColorHueCycle);
        const start = wrapStart(cfg, rawStart);
        
        registerAnimation(el, "color-hue", cfg, start);
        
        if (shouldStartNow) start();
        return;
    }
    
    // ============================================================
    // PATTERN SEQUENCE MODE
    // ============================================================
    if (valsArg?.value?.type === "pattern") {
        const cfg = {
            ...baseCfg,
            pattern: valsArg.value,
            mode: "sequence-pattern"
        };
        
        el._oscillaCfg = cfg;
        
        installOscToggleHandler(el, cfg);
        applyPrestateBeforeStart(el, cfg);
        
        // Apply first color
        if (Array.isArray(valsArg.value.values) && valsArg.value.values.length > 0) {
            const firstHSL = parseColorToHSL(valsArg.value.values[0]);
            applyColor(el, firstHSL, cfg.target);
        }
        
        const rawStart = makeRawStart(cfg, handleColorSequence);
        const start = wrapStart(cfg, rawStart);
        
        registerAnimation(el, "color-sequence", cfg, start);
        
        if (shouldStartNow) start();
        return;
    }
    
    // ============================================================
    // LITERAL ARRAY SEQUENCE MODE
    // ============================================================
    if (valsArg && Array.isArray(valsArg.value)) {
        const cfg = {
            ...baseCfg,
            values: valsArg.value,
            mode: "sequence"
        };
        
        el._oscillaCfg = cfg;
        
        installOscToggleHandler(el, cfg);
        applyPrestateBeforeStart(el, cfg);
        
        // Apply first color
        if (cfg.values.length > 0) {
            const firstHSL = parseColorToHSL(cfg.values[0]);
            applyColor(el, firstHSL, cfg.target);
        }
        
        const rawStart = makeRawStart(cfg, handleColorSequence);
        const start = wrapStart(cfg, rawStart);
        
        registerAnimation(el, "color-sequence", cfg, start);
        
        if (shouldStartNow) start();
        return;
    }
    
    // ============================================================
    // FALLBACK: No vals specified - do nothing useful
    // ============================================================
    console.warn("[color] No valid vals parameter found:", astArgs);
}

// Export for parser/dispatcher
export default { handleColorCue };