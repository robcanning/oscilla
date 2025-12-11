// oscillaAnimation.js
// ------------------------------------------------------------
// Oscilla animation cue layer (clean version)
// - cue handlers: handleRotateCue, handleScaleCue, handleO2PCue
// - values: number | [numbers] | pattern object
// - timing: dur, seqdur
// - trigger: auto | playhead
// ------------------------------------------------------------

const TAG = "[OSCILLA_ANIM]";
const DEBUG = true;

// -----------------------------
// Logger helpers
// -----------------------------
function log(...args) { if (DEBUG) console.log(TAG, ...args); }
function warn(...args) { console.warn(TAG, ...args); }

// -----------------------------
// Imports
// -----------------------------
import { handleScaleCue } from "./oscillaAnimationScale.js";
import { handleRotateCue } from "./oscillaAnimationRotate.js";
import { handleO2PCue } from "./oscillaAnimationO2p.js";
import { parseCueToAST } from "./oscillaParser.js";

// Ensure global registries exist
window.oscillaAnimRegistry = window.oscillaAnimRegistry || {};

// --------------------------------------------------------------
// ⭐ FIXED: runningAnimations is now a Map(), not a plain object
// --------------------------------------------------------------
window.runningAnimations = window.runningAnimations instanceof Map
    ? window.runningAnimations
    : new Map();


// ------------------------------------------------------------
//  UID RESOLUTION HELPER
// ------------------------------------------------------------
export function resolveAnimationUid(el, kind, astArgs = []) {

    // user-provided uid(x)
    const uidArg = astArgs.find(a => a.key === "uid" || a.type === "uid");
    if (uidArg && uidArg.value) {
        return String(uidArg.value).trim();
    }

    // persisted on element
    if (el.dataset && el.dataset.animUid) return el.dataset.animUid;

    // fallback
    return `${kind}_${Math.random().toString(36).slice(2)}`;
}


// ------------------------------------------------------------
// animationAssign(svgRoot)
// ------------------------------------------------------------
export function animationAssign(svgRoot) {
    console.group("[animationAssign] 🚀 Scanning SVG for animation expressions");

    if (!svgRoot) {
        console.groupEnd();
        return;
    }

    const elements = svgRoot.querySelectorAll("[id*='(']");

    elements.forEach(el => {
        const id = el.id?.trim();
        if (!id) return;

        // ❌ SKIP NON-ANIMATION IDS
        if (/^(propagate|reuse|use|assignCues|button)\s*\(/.test(id)) {
            return;
        }

        let ast = null;
        try {
            ast = parseCueToAST(id);
        } catch (err) {
            console.groupEnd();
            return;
        }

        if (!ast || !ast.type) {
            console.groupEnd();
            return;
        }

        switch (ast.type) {
            case "cueScale":
                handleScaleCue(ast, el);
                break;

            case "cueRotate":
                handleRotateCue(el, ast.args);
                break;

            case "cueO2P":
                handleO2PCue(el, ast.args);
                break;

            case "cueText": {
                el.style.opacity = "0";
                el.style.visibility = "hidden";
                el.style.pointerEvents = "none";

                const isPageMode = (window.navMode === "page" || window.mode === "page");

                const autostartFlag = ast.args?.some(a =>
                    a.type === "autostart" && String(a.value).trim() === "1"
                );

                if (isPageMode || autostartFlag) {
                    import("./oscillaText.js")
                        .then(mod => mod.handleCueTextFromAST(ast, el))
                        .catch(err => console.error("[animationAssign] cue:text autostart failed", err));
                }
                break;
            }

            default:
                break;
        }

        console.groupEnd();
    });

    console.groupEnd();
}



// ------------------------------------------------------------
// registerAnimation()
// ------------------------------------------------------------
export function registerAnimation(el, kind, cfg, startFn) {
    if (!window.oscillaAnimRegistry) {
        window.oscillaAnimRegistry = {};
    }

    if (el.dataset) el.dataset.animUid = cfg.uid;

    if (window.oscillaAnimRegistry[cfg.uid]) {
        console.warn(`[oscillaAnim] ⚠️ Duplicate UID "${cfg.uid}"`);
    }

    const trig = cfg.trig || "auto";

    window.oscillaAnimRegistry[cfg.uid] = {
        el,
        kind,
        cfg,
        trig,
        startFn,

        started: (trig === "playhead"),
        uid: cfg.uid,
        forceVisible: window.isPageOverlay === true
    };

    if (window.refreshObserver) window.refreshObserver();
}



// ------------------------------------------------------------
// ⭐ UPDATED: registerRunningAnimation(uid, instance)
// ------------------------------------------------------------
export function registerRunningAnimation(uid, instance) {
    if (!uid) return;

    // store instance in Map
    window.runningAnimations.set(uid, instance);

    // used by visibility system
    instance.wasPaused = false;

    log("🟢 Running instance registered:", uid, instance);
}



// ------------------------------------------------------------
// ⭐ UPDATED: clearRunningAnimation(uid)
// ------------------------------------------------------------
export function clearRunningAnimation(uid) {
    if (!uid) return;
    window.runningAnimations.delete(uid);
    log("🗑 clearRunningAnimation:", uid);
}



// ------------------------------------------------------------
// debugDump()
// ------------------------------------------------------------
export function debugDump() {
    console.log("====== ANIMATION REGISTRY ======");
    console.log(window.oscillaAnimRegistry);

    console.log("====== RUNNING INSTANCES (Map) ======");
    console.log([...window.runningAnimations.entries()]);
}



// ------------------------------------------------------------
// export all as module
// ------------------------------------------------------------
export default {
    resolveAnimationUid,
    registerAnimation,
    registerRunningAnimation,
    clearRunningAnimation,
    animationAssign,
    debugDump
};
