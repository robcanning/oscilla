//////////////////////////////////////////////////////////
// OscillaScore — Animation Observer System (v2)
//
// Purpose:
//   Preserve system resources by pausing animations that
//   are offscreen and not needed. Resume when visible.
//
// Strategy:
//   Works through oscillaAnimRegistry (every animation
//   registers there). Uses cfg._anim.pause()/play() as
//   the universal pause/resume interface. Each animation
//   handler (rotate, scale, o2p, color) stores cfg._anim
//   with the appropriate backend-specific implementation.
//
// What gets paused:
//   - Continuous anime.js animations (rotate, scale, o2p)
//   - Color rAF loops
//
// What is NOT paused:
//   - Animations with active ParamBus subscribers
//     (they are modulating audio/other cues)
//   - O2P in touch mode (user-driven)
//   - Page overlay animations (forceVisible)
//   - trig:playhead animations that haven't started
//   - Sequence step-mode animations (near-zero cost)
//
// Requires:
//   - window.oscillaAnimRegistry = { uid → entry }
//     where entry has: { el, kind, cfg, trig, startFn,
//       started, forceVisible }
//   - cfg._anim = { pause(), play() }  on running anims
//   - hasSubscribers() from paramBus.js
//////////////////////////////////////////////////////////

import { hasSubscribers } from './control/paramBus.js';

// -------------------------------------------------------
// Signal prefix for a given animation source + uid
// Used to check if anything subscribes to this anim's
// published signals (i.e. it's modulating something)
// -------------------------------------------------------
function signalPrefix(kind, uid) {
    // Strip sub-kind suffixes: "rotate-sequence" → "rotate"
    const source = kind.split("-")[0];
    return `${source}:${uid}.`;
}

// -------------------------------------------------------
// Utility: element visibility in viewport
// -------------------------------------------------------
function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
    );
}

// -------------------------------------------------------
// Should this animation be managed by the observer?
// Returns false for animations we must never pause.
// -------------------------------------------------------
function shouldManage(entry) {
    if (!entry || !entry.cfg) return false;

    const cfg = entry.cfg;

    // Page overlay — always visible, never pause
    if (entry.forceVisible) return false;

    // O2P touch mode — user-driven, never pause
    if (cfg._touchModeActive) return false;

    // Not started yet and waiting for playhead — nothing to pause
    if (entry.trig === "playhead" && !entry.started) return false;

    // No animation instance to pause
    if (!cfg._anim) return false;

    return true;
}

// -------------------------------------------------------
// Should this animation be kept running even when offscreen?
// Returns true if the animation is feeding modulation.
// -------------------------------------------------------
function isModulationSource(entry) {
    const prefix = signalPrefix(entry.kind, entry.uid || entry.cfg?.uid);
    return hasSubscribers(prefix);
}

//////////////////////////////////////////////////////////
// 1. Initialize IntersectionObserver
//////////////////////////////////////////////////////////
export function initializeObserver() {
    // Disconnect previous instance
    if (window.oscillaObserver) {
        window.oscillaObserver.disconnect();
    }

    const rootContainer =
        document.getElementById("pageOverlay") ||
        document.getElementById("scoreContainer") ||
        null;

    ////////////////////////////////////////////////////////
    // OBSERVER CALLBACK
    ////////////////////////////////////////////////////////
    window.oscillaObserver = new IntersectionObserver(
        (entries) => {
            for (const ioEntry of entries) {
                const el = ioEntry.target;
                if (!el) continue;

                const uid = el.dataset?.animUid;
                if (!uid) continue;

                const regEntry = window.oscillaAnimRegistry?.[uid];
                if (!regEntry) continue;

                // ---- Autostart for trig:auto ----
                if (
                    regEntry.trig === "auto" &&
                    !regEntry.started &&
                    ioEntry.isIntersecting
                ) {
                    regEntry.startFn?.();
                    regEntry.started = true;
                }

                // ---- Pause / Resume ----
                if (!shouldManage(regEntry)) continue;
                if (isModulationSource(regEntry)) continue;

                const cfg = regEntry.cfg;
                const anim = cfg._anim;

                if (ioEntry.isIntersecting && regEntry._observerPaused) {
                    // Resume
                    if (typeof anim.play === "function") {
                        anim.play();
                    }
                    regEntry._observerPaused = false;

                } else if (!ioEntry.isIntersecting && !regEntry._observerPaused) {
                    // Pause
                    if (typeof anim.pause === "function") {
                        anim.pause();
                    }
                    regEntry._observerPaused = true;
                }
            }
        },
        {
            root: rootContainer,
            threshold: 0.01
        }
    );

    ////////////////////////////////////////////////////////
    // Attach observer to every registered animation element
    ////////////////////////////////////////////////////////
    const registry = window.oscillaAnimRegistry;
    if (!registry) return;

    for (const uid in registry) {
        const entry = registry[uid];
        if (entry?.el instanceof Element) {
            window.oscillaObserver.observe(entry.el);
        }
    }

    // console.log("[Observer] Initialized — managing", Object.keys(registry).length, "animations");
}

//////////////////////////////////////////////////////////
// 2. Refresh Observer (called from registerAnimation)
//////////////////////////////////////////////////////////
window.refreshObserver = function () {
    initializeObserver();
};

//////////////////////////////////////////////////////////
// 3. Manual visibility pass (after load / jump / seek)
//    Mirrors the observer callback logic for cases
//    where IntersectionObserver hasn't fired yet.
//////////////////////////////////////////////////////////
window.checkAnimationVisibility = function () {
    const registry = window.oscillaAnimRegistry;
    if (!registry) return;

    for (const uid in registry) {
        const entry = registry[uid];
        if (!entry) continue;

        const el = entry.el;
        if (!(el instanceof Element)) continue;

        const visible = isVisible(el);

        // ---- Autostart for trig:auto or forceVisible ----
        if (!entry.started) {
            if (entry.forceVisible) {
                entry.startFn?.();
                entry.started = true;
            } else if (entry.trig === "auto" && visible) {
                entry.startFn?.();
                entry.started = true;
            }
        }

        // ---- Pause / Resume ----
        if (!shouldManage(entry)) continue;
        if (isModulationSource(entry)) continue;

        const cfg = entry.cfg;
        const anim = cfg._anim;

        if (visible && entry._observerPaused) {
            if (typeof anim.play === "function") {
                anim.play();
            }
            entry._observerPaused = false;

        } else if (!visible && !entry._observerPaused) {
            if (typeof anim.pause === "function") {
                anim.pause();
            }
            entry._observerPaused = true;
        }
    }
};
