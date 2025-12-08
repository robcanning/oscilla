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
window.runningAnimations = window.runningAnimations || {};


// ------------------------------------------------------------
//  UID RESOLUTION HELPER (required by rotate/scale/o2p)
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
//   • Parses IDs
//   • Produces AST
//   • Calls correct handler (scale/rotate/o2p)
// ------------------------------------------------------------
export function animationAssign(svgRoot) {
    console.group("[animationAssign] 🚀 Scanning SVG for animation expressions");

    if (!svgRoot) {
        // console.warn("[animationAssign] ❌ svgRoot is null/undefined.");
        console.groupEnd();
        return;
    }

    const elements = svgRoot.querySelectorAll("[id*='(']");
    // console.log(`[animationAssign] Found ${elements.length} candidate elements`);

    elements.forEach(el => {
        const id = el.id?.trim();
        if (!id) return;

        // ------------------------------------------------------------
        // ❌ SKIP NON-ANIMATION IDS
        // ------------------------------------------------------------
        if (/^propagate\s*\(/.test(id)) {
            // console.log("[animationAssign] ⏭ skipping propagate():", id);
            return;
        }

        if (/^reuse\s*\(/.test(id)) {
            // console.log("[animationAssign] ⏭ skipping reuse():", id);
            return;
        }

        if (/^use\s*\(/.test(id)) {
            // console.log("[animationAssign] ⏭ skipping use():", id);
            return;
        }

        if (/^assignCues\s*\(/.test(id)) {
            // console.log("[animationAssign] ⏭ skipping assignCues():", id);
            return;
        }

        if (/^button\s*\(/.test(id)) {
            // console.log("[animationAssign] ⏭ skipping button():", id);
            return;
        }

        // console.groupCollapsed(`[animationAssign] 🎯 Checking id="${id}"`);

        let ast = null;
        try {
            // console.log("• Parsing →", id);
            ast = parseCueToAST(id);
        } catch (err) {
            // console.warn("• ❌ parseCueToAST failed — probably not a cue:", err.message);
            console.groupEnd();
            return;
        }

        if (!ast || !ast.type) {
            // console.warn("• ❌ No AST returned — ignoring element");
            console.groupEnd();
            return;
        }

        // console.log("• AST:", ast);

        // ------------------------------------------------------------
        // DISPATCH
        // ------------------------------------------------------------
        switch (ast.type) {
            case "cueScale":
                // console.log("• 📐 Dispatch → handleScaleCue()");
                handleScaleCue(ast, el);
                break;

            case "cueRotate":
                // console.log("• 🔄 Dispatch → handleRotateCue()");
                handleRotateCue(el, ast.args);
                break;

            case "cueO2P":
                // console.log("• 🛤 Dispatch → handleO2PCue()");
                handleO2PCue(el, ast.args);
                break;

            case "cueText": {

                // Hide the element that declares the text cue
                // but keep it in DOM for geometry reference if needed.
                el.style.opacity = "0";
                el.style.visibility = "hidden";
                el.style.pointerEvents = "none";
                
                const isPageMode = (window.navMode === "page" || window.mode === "page");

                // read autostart:<1|0>
                const autostartFlag = ast.args?.some(a =>
                    a.type === "autostart" && String(a.value).trim() === "1"
                );

                if (isPageMode || autostartFlag) {
                    console.log("[animationAssign] 🟣 Autostart cue:text →", el.id, ast);

                    import("./oscillaText.js")
                        .then(mod => mod.handleCueTextFromAST(ast, el))
                        .catch(err => console.error("[animationAssign] cue:text autostart failed", err));
                }

                // otherwise: do nothing here → scroll mode will trigger via intersection
                break;
            }

            default:
                // console.log(`• ⚠️ Not an animation cue → type="${ast.type}"`);
                break;
        }

        console.groupEnd();
    });

    console.groupEnd();
}



// ------------------------------------------------------------
// registerAnimation()
// Called by handlers (rotate/scale/o2p)
// Adds to registry and attaches data-anim-uid
// ------------------------------------------------------------
// ------------------------------------------------------------
// registerAnimation()
// ------------------------------------------------------------
export function registerAnimation(el, kind, cfg, startFn) {
    if (!window.oscillaAnimRegistry) {
        // console.warn("[oscillaAnim] ⚠️ Registry not initialized — creating new one.");
        window.oscillaAnimRegistry = {};
    }

    // console.groupCollapsed(
    //     `[oscillaAnim] 🆕 Register animation`,
    //     `uid="${cfg.uid}"`,
    //     `kind="${kind}"`,
    //     `trig="${cfg.trig || "auto"}"`
    // );

    // console.log("• Element:", el);
    // console.log("• Trigger:", cfg.trig || "auto");
    // console.log("• Full cfg:", cfg);

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

        // ✅ In playhead mode, observer should never autostart it
        started: (trig === "playhead"),

        uid: cfg.uid,

        // ✅ NEW: in page overlay mode, always treat as visible
        forceVisible: window.isPageOverlay === true
    };

    // console.log("• Registry size:", Object.keys(window.oscillaAnimRegistry).length);
    console.groupEnd();

    if (window.refreshObserver) window.refreshObserver();
}




// ------------------------------------------------------------
// registerRunningAnimation(uid, instance)
// Used by rotate/scale/o2p.js to mark running anime.js animations
// ------------------------------------------------------------
export function registerRunningAnimation(uid, instance) {
    window.runningAnimations[uid] = instance;
    window.runningAnimations[uid].wasPaused = false;

    // console.log(`[oscillaAnim] 🟢 Running instance registered for uid="${uid}"`);
}



// ------------------------------------------------------------
// clearRunningAnimation(uid)
// ------------------------------------------------------------
export function clearRunningAnimation(uid) {
    delete window.runningAnimations[uid];
}



// ------------------------------------------------------------
// debugDump() — developer helper
// ------------------------------------------------------------
export function debugDump() {
    console.log("====== ANIMATION REGISTRY ======");
    console.log(window.oscillaAnimRegistry);

    console.log("====== RUNNING INSTANCES ======");
    console.log(window.runningAnimations);
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
