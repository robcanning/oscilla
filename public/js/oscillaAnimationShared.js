// ============================================================================
// oscillaAnimationShared.js
// Unified prestates, fade-in, ghost, ghostClickable,
// helper functions for all cue types (rotate, scale, o2p, text)
// ============================================================================

import { setHitLabelOscMode } from "./oscillaHitLabels.js";

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

    console.log("[prestateBefore] ENTER", {
        uid: cfg.uid,
        prestate: p,
        pType: typeof p,
        pTypeField: p?.type,
        pName: p?.name
    });

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
            cfg._ghostFadeMs = ms;
            cfg._ghostOpacity = 0.7;
            cfg._startBlocked = true;

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
            console.log("[prestateBefore] hide -> opacity=0", cfg.uid);
            return;

        case "ghost":
            el.style.opacity = "0.3";
            el.style.transition = "opacity 0ms";
            console.log("[prestateBefore] ghost -> opacity=0.3", cfg.uid);
            return;

        case "show":
        default:
            el.style.opacity = "1";
            el.style.transition = "opacity 0ms";
            console.log("[prestateBefore] show -> opacity=1", cfg.uid);
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
    // ghostClickable - fade to ghostOpacity and install click handler
    // ============================================================
    if (cfg._ghostClickable) {

        // initialise state once
        cfg._ghostState = cfg._ghostState ?? "waiting";

        console.log("[ghostClickable] applyPrestateOnStart -> ensure click handler", {
            uid: cfg.uid,
            state: cfg._ghostState,
            opacity: cfg._ghostOpacity,
            blocked: cfg._startBlocked
        });

        // fade to ghost only on first entry
        if (cfg._ghostState === "waiting") {
            el.style.transition = `opacity ${cfg._ghostFadeMs}ms ease`;
            forceReflow(el);
            el.style.opacity = cfg._ghostOpacity;
        }

        // ----------------------------------------------------
        // PLAY/PAUSE HANDLER (single-click via oscilla-hit)
        // ----------------------------------------------------
        if (!cfg._clickHandler) {

            cfg._clickHandler = (e) => {
                // Filter: ignore hits meant for other animations
                if (e.detail?.kind && cfg.kind && e.detail.kind !== cfg.kind) {
                    return;
                }

                console.log("[ghostClickable] PLAY/PAUSE click", {
                    uid: cfg.uid,
                    state: cfg._ghostState,
                    kind: e.detail?.kind
                });

                // -----------------------------------------
                // waiting -> running (start)
                // -----------------------------------------
                if (cfg._ghostState === "waiting") {
                    cfg._ghostState = "running";
                    cfg._startBlocked = false;

                    el.style.transition = "opacity 400ms ease";
                    forceReflow(el);
                    el.style.opacity = "1";

                    console.log("[ghostClickable] START animation", cfg.uid);

                    if (typeof cfg._start === "function") {
                        cfg._start();
                    }
                    return;
                }

                // -----------------------------------------
                // running -> paused
                // -----------------------------------------
                if (cfg._ghostState === "running") {
                    cfg._ghostState = "paused";

                    el.style.transition = "opacity 400ms ease";
                    forceReflow(el);
                    el.style.opacity = cfg._ghostOpacity ?? 0.3;

                    if (cfg._anim) {
                        console.log("[ghostClickable] PAUSE animation", cfg.uid);
                        cfg._anim.pause();
                    }
                    return;
                }

                // -----------------------------------------
                // paused -> running
                // -----------------------------------------
                if (cfg._ghostState === "paused") {
                    cfg._ghostState = "running";

                    el.style.transition = "opacity 400ms ease";
                    forceReflow(el);
                    el.style.opacity = "1";

                    if (cfg._anim) {
                        console.log("[ghostClickable] RESUME animation", cfg.uid);
                        cfg._anim.play();
                    } else if (typeof cfg._start === "function") {
                        cfg._start();
                    }
                    return;
                }
            };

            // ----------------------------------------------------
            // OSC TOGGLE HANDLER (double-click via oscilla-osc-toggle)
            // ----------------------------------------------------
            cfg._oscToggleHandler = (e) => {
                // Filter: ignore hits meant for other animations
                if (e.detail?.kind && cfg.kind && e.detail.kind !== cfg.kind) {
                    return;
                }

                const oscEnabled = e.detail?.oscEnabled ?? false;
                cfg._oscEnabled = oscEnabled;

                // Update the osc config flag that animation engines use
                if (cfg.oscCfg) {
                    cfg.oscCfg.enabled = oscEnabled;
                }
                // For rotate/scale that use numeric osc mode
                if (oscEnabled) {
                    cfg.osc = 1;  // enable continuous OSC
                } else {
                    cfg.osc = 0;  // disable OSC
                }

                console.log("[ghostClickable] OSC TOGGLE", {
                    uid: cfg.uid,
                    oscEnabled
                });
            };

            // Listen to both event types
            el.addEventListener("oscilla-hit", cfg._clickHandler);
            el.addEventListener("oscilla-osc-toggle", cfg._oscToggleHandler);
            el.style.pointerEvents = "all";
        }

        return;

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
    // hide -> show at start
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
        el.removeEventListener("oscilla-hit", cfg._clickHandler);
        cfg._clickHandler = null;
    }
    if (cfg._oscToggleHandler) {
        el.removeEventListener("oscilla-osc-toggle", cfg._oscToggleHandler);
        cfg._oscToggleHandler = null;
    }
}