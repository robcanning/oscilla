// ============================================================================
// oscillaAnimationShared.js
// Unified prestates, fade-in, ghost, ghostClickable,
// helper functions for all cue types (rotate, scale, o2p, text)
// ============================================================================
//
// GHOSTCLICKABLE THREE-PHASE LIFECYCLE:
//   1. REGISTERED  - element invisible (opacity:0), hit-label clickable
//   2. ARMED       - playhead reached → fade to ghost opacity, waiting for click
//   3. RUNNING     - user clicked → full opacity, animation playing
//
// Phase transitions:
//   applyPrestateBeforeStart()  → sets up REGISTERED state (load time)
//   armGhostClickable()         → transitions REGISTERED → ARMED (playhead)
//   click handler               → transitions ARMED → RUNNING
//
// ============================================================================

console.log("%c[oscillaAnimationShared] loaded", "color:#8af");

// ============================================================================
// Helper: force reflow (ensures CSS transitions activate)
// ============================================================================
function forceReflow(el) {
    void el.offsetHeight;
}

// ============================================================================
// PHASE 1: REGISTERED STATE
// Called ONCE at load/registration time.
// Sets element invisible, parses ghostClickable params, installs hit-label.
// Does NOT fade to ghost - that happens at playhead intersection.
// ============================================================================
export function applyPrestateBeforeStart(el, cfg) {


    // Guard: only run registration once per element lifecycle
    if (cfg._prestateRegistered) {
        // console.log("[prestateBefore] SKIP - already registered", cfg.uid);
        return;
    }
    cfg._prestateRegistered = true;

    const p = cfg.prestate;

    // console.log("[prestateBefore] REGISTER", {
    //     uid: cfg.uid,
    //     prestate: p,
    //     pType: typeof p,
    //     pName: p?.name
    // });

    // ------------------------------------------------------------
    // FUNCTION FORM: ghostClickable(ms), fadein(ms)
    // ------------------------------------------------------------
    if (p && typeof p === "object" && p.type === "func") {

        // ---- fadein(ms) ----
        if (p.name === "fadein") {
            const ms = Number(p.args?.[0] ?? 1000);
            cfg._fadeInMs = ms;
            cfg._ghostState = "registered";

            el.style.opacity = "0";
            el.style.transition = "opacity 0ms";

            // console.log("[prestateBefore] fadein registered", { uid: cfg.uid, ms });
            return;
        }

        // ---- ghostClickable(mode, fadeMs, opacity) ----
        // Supports:
        //   ghostClickable(500)                    → fade after 500ms, default opacity 0.7
        //   ghostClickable(playhead)               → fade at playhead, default opacity 0.7
        //   ghostClickable(playhead, 2000)         → fade at playhead over 2000ms
        //   ghostClickable(playhead, 2000, 0.3)    → fade at playhead over 2000ms to opacity 0.3
        //   ghostClickable(5000, 1000, 0.2)        → fade after 5s delay, 1s fade, to 0.2 opacity
        if (p.name === "ghostClickable") {
            const args = p.args || [];
            
            // Parse first arg: "playhead" or delay in ms
            const arg0 = args[0];
            const isPlayheadMode = (typeof arg0 === "string" && arg0.toLowerCase() === "playhead");
            
            // Parse remaining args based on mode
            let delayMs = 0;      // delay before arming (only for timed mode)
            let fadeMs = 500;     // fade-in duration
            let opacity = 0.7;    // ghost opacity
            
            if (isPlayheadMode) {
                // ghostClickable(playhead, fadeMs?, opacity?)
                delayMs = 0;  // no delay - waits for playhead
                fadeMs = Number(args[1]) || 500;
                opacity = Number(args[2]) || 0.7;
            } else {
                // ghostClickable(delayMs, fadeMs?, opacity?)
                // OR legacy: ghostClickable(fadeMs) where fadeMs is both delay and fade
                if (args.length === 1) {
                    // Legacy: single arg is fade duration (also used as "immediate" with that fade time)
                    delayMs = 0;
                    fadeMs = Number(arg0) || 500;
                } else {
                    // New: explicit delay, fade, opacity
                    delayMs = Number(arg0) || 0;
                    fadeMs = Number(args[1]) || 500;
                    opacity = Number(args[2]) || 0.7;
                }
            }
            
            // Clamp opacity to valid range
            opacity = Math.max(0, Math.min(1, opacity));

            cfg._ghostClickable = true;
            cfg._ghostDelayMs = delayMs;      // NEW: delay before arming
            cfg._ghostFadeMs = fadeMs;        // fade-in duration
            cfg._ghostOpacity = opacity;      // target ghost opacity
            cfg._startBlocked = true;
            cfg._ghostState = "registered";
            cfg._ghostPlayheadMode = isPlayheadMode;

            // Element starts INVISIBLE (will fade to ghost at playhead or after delay)
            el.style.opacity = "0";
            el.style.transition = "opacity 0ms";
            el.style.pointerEvents = "all";  // clickable even when invisible

            // Install click handlers NOW so hit-label works immediately
            installGhostClickHandlers(el, cfg);

            // console.log("[prestateBefore] ghostClickable REGISTERED", { 
            //     uid: cfg.uid, 
            //     playheadMode: isPlayheadMode,
            //     delayMs,
            //     fadeMs,
            //     opacity
            // });
            return;
        }
    }

    // ------------------------------------------------------------
    // STRING FORM
    // ------------------------------------------------------------
    switch (p) {
        case "hide":
            cfg._ghostState = "registered";
            el.style.opacity = "0";
            el.style.transition = "opacity 0ms";
            // console.log("[prestateBefore] hide registered", cfg.uid);
            return;

        case "ghost":
            cfg._ghostState = "armed";  // ghost without click = already visible
            el.style.opacity = "0.3";
            el.style.transition = "opacity 0ms";
            // console.log("[prestateBefore] ghost registered", cfg.uid);
            return;

        case "show":
        default:
            cfg._ghostState = "running";  // show = already visible
            el.style.opacity = "1";
            el.style.transition = "opacity 0ms";
            // console.log("[prestateBefore] show registered", cfg.uid);
            return;
    }
}

// ============================================================================
// PHASE 2: ARM GHOST CLICKABLE
// Called at PLAYHEAD INTERSECTION (cue trigger time).
// Transitions from REGISTERED → ARMED (fades to ghost opacity).
// Does NOT reset to opacity:0 or re-install handlers.
// ============================================================================
export function armGhostClickable(el, cfg) {

    if (!cfg._ghostClickable) {
        // console.log("[armGhost] not ghostClickable, skipping", cfg.uid);
        return false;
    }

    const state = cfg._ghostState;

    // Already armed or running - don't re-arm
    if (state === "armed" || state === "running" || state === "paused") {
        // console.log("[armGhost] already armed/running, skipping", { uid: cfg.uid, state });
        return false;
    }

    // Transition: REGISTERED → ARMED
    // console.log("[armGhost] ARMING ghostClickable", { uid: cfg.uid, from: state });

    cfg._ghostState = "armed";

    // Fade from invisible (0) to ghost opacity
    el.style.transition = `opacity ${cfg._ghostFadeMs}ms ease`;
    forceReflow(el);
    el.style.opacity = String(cfg._ghostOpacity);

    // console.log("[armGhost] → ARMED (ghost visible, waiting for click)", cfg.uid);
    return true;
}

// ============================================================================
// Install OSC toggle handlers for ANY animation (not just ghostClickable)
// This should be called from every animation handler (scale, rotate, o2p)
// ============================================================================
export function installOscToggleHandler(el, cfg) {
    // Guard: only install once per element
    if (cfg._oscToggleHandler) {
        return;
    }

    cfg._oscToggleHandler = (e) => {
        const eventUid = e.detail?.uid;
        const eventKind = e.detail?.kind;
        
        // ✅ STRICT UID FILTERING: Only respond if UID matches exactly
        if (!eventUid || eventUid !== cfg.uid) {
            return;
        }
        
        // Double-check kind matches too
        if (eventKind && cfg.kind && eventKind !== cfg.kind) {
            return;
        }

        const oscEnabled = e.detail?.oscEnabled ?? false;
        
        cfg._oscEnabled = oscEnabled;
        
        if (cfg.oscCfg) {
            cfg.oscCfg.enabled = oscEnabled;
        }
        
        cfg.osc = oscEnabled ? 1 : 0;

        // console.log("[oscToggle] OSC state changed", { 
        //     uid: cfg.uid, 
        //     kind: cfg.kind,
        //     oscEnabled,
        //     cfgOsc: cfg.osc
        // });
    };

    el.addEventListener("oscilla-osc-toggle", cfg._oscToggleHandler);
    // console.log("[oscToggle] handler installed for", cfg.uid);
}

// ============================================================================
// Install click handlers for ghostClickable
// Separated so it can be called once at registration time.
// ============================================================================
function installGhostClickHandlers(el, cfg) {

    if (cfg._clickHandler) {
        // console.log("[installGhostClick] handlers already installed", cfg.uid);
        return;
    }

    // ----------------------------------------------------
    // PLAY/PAUSE HANDLER (single-click via oscilla-hit)
    // ----------------------------------------------------
    cfg._clickHandler = (e) => {
        // Filter: ignore hits meant for other animations
        if (e.detail?.kind && cfg.kind && e.detail.kind !== cfg.kind) {
            return;
        }

        const state = cfg._ghostState;

        // console.log("[ghostClickable] CLICK", {
        //     uid: cfg.uid,
        //     state,
        //     kind: e.detail?.kind
        // });

        // -----------------------------------------
        // REGISTERED state - not yet armed by playhead
        // In scroll mode, clicking before playhead should do nothing
        // (or optionally: could auto-arm here for manual start)
        // -----------------------------------------
        if (state === "registered") {
            // console.log("[ghostClickable] not armed yet - ignoring click", cfg.uid);
            return;
        }

        // -----------------------------------------
        // ARMED → RUNNING (start animation)
        // -----------------------------------------
        if (state === "armed") {
            cfg._ghostState = "running";
            cfg._startBlocked = false;

            el.style.transition = "opacity 400ms ease";
            forceReflow(el);
            el.style.opacity = "1";

            // console.log("[ghostClickable] ARMED → RUNNING", cfg.uid);

            if (typeof cfg._start === "function") {
                cfg._start();
            }
            return;
        }

        // -----------------------------------------
        // RUNNING → PAUSED
        // -----------------------------------------
        if (state === "running") {
            cfg._ghostState = "paused";

            el.style.transition = "opacity 400ms ease";
            forceReflow(el);
            el.style.opacity = String(cfg._ghostOpacity ?? 0.3);

            if (cfg._anim) {
                // console.log("[ghostClickable] RUNNING → PAUSED", cfg.uid);
                cfg._anim.pause();
            }
            return;
        }

        // -----------------------------------------
        // PAUSED → RUNNING (resume)
        // -----------------------------------------
        if (state === "paused") {
            cfg._ghostState = "running";

            el.style.transition = "opacity 400ms ease";
            forceReflow(el);
            el.style.opacity = "1";

            if (cfg._anim) {
                // console.log("[ghostClickable] PAUSED → RUNNING", cfg.uid);
                cfg._anim.play();
            } else if (typeof cfg._start === "function") {
                cfg._start();
            }
            return;
        }
    };

    // Install OSC toggle handler (uses the shared function)
    installOscToggleHandler(el, cfg);

    el.addEventListener("oscilla-hit", cfg._clickHandler);
    el.style.pointerEvents = "all";

    // console.log("[installGhostClick] handlers installed", cfg.uid);
}

// ============================================================================
// applyPrestateOnStart()
// Called at animation start time (after tdelay, or at playhead for auto cues).
// For ghostClickable: this now calls armGhostClickable() instead of full setup.
//
// PLAYHEAD MODE: ghostClickable(playhead)
//   - When called from scheduleCueStart (timed), do nothing - wait for playhead
//   - When called from playhead intersection, arm the element
// ============================================================================
export function applyPrestateOnStart(el, cfg, source = "unknown") {

    // ============================================================
    // ghostClickable - ARM the element (fade to ghost)
    // ============================================================
    if (cfg._ghostClickable) {

        // If already running/paused, don't re-arm
        if (cfg._ghostState === "running" || cfg._ghostState === "paused") {
            // console.log("[prestateOnStart] ghostClickable already running/paused", cfg.uid);
            return;
        }

        // PLAYHEAD MODE: only arm when called from playhead intersection
        // Skip if this is a timed call (from scheduleCueStart)
        if (cfg._ghostPlayheadMode && source === "scheduled") {
            // console.log("[prestateOnStart] ghostClickable(playhead) - skipping scheduled fade, waiting for playhead", cfg.uid);
            return;
        }

        // Arm the element (registered → armed)
        armGhostClickable(el, cfg);
        return;
    }

    // ============================================================
    // fadein(ms)
    // ============================================================
    if (cfg._fadeInMs) {
        // console.log("[prestateOnStart] fadein", cfg.uid);

        el.style.transition = `opacity ${cfg._fadeInMs}ms ease`;
        forceReflow(el);
        el.style.opacity = "1";
        return;
    }

    // ============================================================
    // ghost (static - no click interaction)
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
// Check if a ghostClickable element is ready to start animation
// Used by cue handlers to determine if they should proceed with animation.
// ============================================================================
export function isGhostClickableReady(cfg) {
    if (!cfg._ghostClickable) return true;  // not ghostClickable = always ready
    return cfg._ghostState === "running";    // only ready after user clicked
}

// ============================================================================
// Check if element needs arming (for playhead intersection logic)
// ============================================================================
export function needsArming(cfg) {
    // if (!el) return false;
    if (!cfg._ghostClickable) return false;
    return cfg._ghostState === "registered";
}

// ============================================================================
// Get current ghost state for debugging
// ============================================================================
export function getGhostState(cfg) {
    return cfg._ghostState ?? "unknown";
}

// ============================================================================
// Reset ghost state (for rewind/jump operations)
// ============================================================================
export function resetGhostState(el, cfg) {
    if (!cfg._ghostClickable) return;

    // console.log("[resetGhost] resetting to registered state", cfg.uid);

    cfg._ghostState = "registered";
    cfg._startBlocked = true;

    el.style.transition = "opacity 200ms ease";
    el.style.opacity = "0";

    if (cfg._anim) {
        try { cfg._anim.pause(); } catch (_) {}
        cfg._anim = null;
    }
}

// ============================================================================
// Cleanup listeners
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

// ============================================================================
// Animation wrapper helper (unchanged)
// ============================================================================
export function ensureAnimWrapper(el) {
    if (!el || el._oscillaAnimWrapper) {
        return el._oscillaAnimWrapper || el;
    }

    if (!(el instanceof SVGGElement)) {
        return el;
    }

    const existing = el.querySelector(":scope > g.oscilla-anim");
    if (existing) {
        el._oscillaAnimWrapper = existing;
        return existing;
    }

    const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.classList.add("oscilla-anim");

    while (el.firstChild) {
        wrapper.appendChild(el.firstChild);
    }

    el.appendChild(wrapper);
    el._oscillaAnimWrapper = wrapper;

    return wrapper;
}


// ============================================================================
// OSC ENABLE HELPER (shared by scale / rotate / o2p)
// ----------------------------------------------------------------------------
// Rules:
// - DSL osc:1 enables OSC by default
// - UI double-click toggles cfg._oscEnabled live
// - UI override WINS (can disable osc:1)
// ============================================================================
export function isOscEnabled(cfg, oscMode = 0) {
    if (!cfg) return false;

    // Explicit UI override
    if (cfg._oscEnabled === true) return true;
    if (cfg._oscEnabled === false) return false;

    // Fallback to DSL
    return Number(oscMode) > 0;
}
