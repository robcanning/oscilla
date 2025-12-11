// ============================================================================
// oscillaAnimationShared.js
// Unified prestates, fade-in, ghost, ghostClickable,
// helper functions for all cue types (rotate, scale, o2p, text)
// ============================================================================

console.log("%c[oscillaAnimationShared] loaded", "color:#8af");

// ============================================================================
// Helper: force reflow (ensures CSS transitions activate)
// ============================================================================
function forceReflow(el) {
    void el.offsetHeight;
}

// ============================================================================
// PRESTATE PARSER
// Converts DSL prestate values (string | func) into internal cfg flags
// Called from cue handlers BEFORE any animation logic.
// ============================================================================
export function applyPrestateBeforeStart(el, cfg) {

    const p = cfg.prestate;

    // ------------------------------------------------------------
    // FUNCTION FORM (fadein(ms), ghostClickable(ms))
    // ------------------------------------------------------------
    if (p && typeof p === "object" && p.type === "func") {

        // ---- fadein(ms) ----
        if (p.name === "fadein") {
            const ms = Number(p.args?.[0] ?? 1000);
            cfg._fadeInMs = ms;

            el.style.opacity = "0";
            el.style.transition = "opacity 0ms";

            console.log("[prestateBefore] apply fadein", { uid: cfg.uid, ms });
            return;
        }

        // ---- ghostClickable(ms) ----
        if (p.name === "ghostClickable") {
            const ms = Number(p.args?.[0] ?? 500);

            cfg._ghostClickable = true;
            cfg._ghostFadeMs    = ms;
            cfg._ghostOpacity   = 0.3;
            cfg._startBlocked   = true;

            el.style.opacity = "0";
            el.style.transition = "opacity 0ms";

            console.log("[prestateBefore] apply ghostClickable", { uid: cfg.uid, ms });
            return;
        }
    }

    // ------------------------------------------------------------
    // STRING FORM
    // ------------------------------------------------------------
    switch (p) {

        case "hide":
            el.style.opacity = "0";
            el.style.transition = "opacity 0ms";
            console.log("[prestateBefore] hide → opacity=0", cfg.uid);
            return;

        case "ghost":
            el.style.opacity = "0.3";
            el.style.transition = "opacity 0ms";
            console.log("[prestateBefore] ghost → opacity=0.3", cfg.uid);
            return;

        case "show":
        default:
            el.style.opacity = "1";
            el.style.transition = "opacity 0ms";
            console.log("[prestateBefore] show → opacity=1", cfg.uid);
            return;
    }
}

// ============================================================================
// applyPrestateOnStart()
// Runs at actual animation start or end of tdelay
// Handles fade-in, ghostClickable fading, click activation, etc.
// ============================================================================
export function applyPrestateOnStart(el, cfg) {

    // ============================================================
    // ghostClickable — fade to ghostOpacity and install click handler
    // ============================================================
    if (cfg._ghostClickable && cfg._startBlocked) {
// ============================================================
// ghostClickable — fade to ghostOpacity and install click handler
// ============================================================
if (cfg._ghostClickable && cfg._startBlocked) {
    console.log("[ghostClickable] applyPrestateOnStart → fade to ghost", cfg.uid);

    // ghost fade-in
    el.style.transition = `opacity ${cfg._ghostFadeMs}ms ease`;
    forceReflow(el);
    el.style.opacity = cfg._ghostOpacity;

    // Unified click logic
    let clickCount = 0;

    const clickHandler = () => {
        clickCount++;

        // ----------------------------------------------------
        // FIRST CLICK → selection only (handled externally)
        // ----------------------------------------------------
        if (clickCount === 1) {
            // Reset counter if no second click follows quickly
            setTimeout(() => { clickCount = 0 }, 350);
            return;
        }

        // ----------------------------------------------------
        // SECOND CLICK → activate ghostClickable
        // ----------------------------------------------------
        console.log("[ghostClickable] DOUBLE CLICK → activate", cfg.uid);

        cfg._startBlocked = false;

        // Remove handler
        el.removeEventListener("click", clickHandler);

        // Fade to full opacity
        el.style.transition = "opacity 400ms ease";
        forceReflow(el);
        el.style.opacity = "1";

        // Start animation
        if (typeof cfg._start === "function") {
            cfg._start();
        }
    };

    cfg._clickHandler = clickHandler;

    // Install handler on the element
    el.addEventListener("click", clickHandler);

    return;
}

    }

    // ============================================================
    // fadein(ms)
    // ============================================================
    if (cfg._fadeInMs) {
        console.log("[prestateOnStart] fadein", cfg.uid);

        el.style.transition = `opacity ${cfg._fadeInMs}ms ease`;
        forceReflow(el);
        el.style.opacity = "1";
        return;
    }

    // ============================================================
    // ghost (static)
    // ============================================================
    if (cfg.prestate === "ghost") {
        el.style.opacity = "0.3";
        return;
    }

    // ============================================================
    // hide → show at start
    // ============================================================
    if (cfg.prestate === "hide") {
        el.style.opacity = "1";
        return;
    }

    // default show
    el.style.opacity = "1";
}

// ============================================================================
// Allow external cleanup (optional)
// ============================================================================
export function clearGhostClickableListeners(el, cfg) {
    if (cfg._clickHandler) {
        el.removeEventListener("click", cfg._clickHandler);
        cfg._clickHandler = null;
    }
}
