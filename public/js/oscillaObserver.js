//////////////////////////////////////////////////////////
// OscillaScore — Animation Observer System 
//
// Behaviour:
//   - trig:auto
//       • autostart when element becomes visible
//   - trig:playhead
//       • NEVER autostart via observer (only via cue handler)
//   - Page overlay (window.isPageOverlay === true)
//       • forceVisible: animations autostart once, never paused
//   - O2P (kind === "o2p")
//       • always forceVisible: autostart once, never paused/resumed
//   - Pause/Resume
//       • ONLY for kind "rotate" or "scale" in scroll mode
//       • O2P is excluded from pause/resume to avoid teleport bugs
//
// Requires:
//   - window.oscillaAnimRegistry = { uid → { el, kind, trig, startFn, started, forceVisible? } }
//   - window.runningAnimations   = { uid → animeInstance }
//   - each animated element has data-anim-uid="<uid>"
//////////////////////////////////////////////////////////

// Ensure global registries exist
window.oscillaAnimRegistry = window.oscillaAnimRegistry || {};
window.runningAnimations = window.runningAnimations || {};

// Utility: element visibility in viewport
function isVisible(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

//////////////////////////////////////////////////////////
// 1. Initialize IntersectionObserver
//////////////////////////////////////////////////////////
export function initializeObserver() {
  // Disconnect older observer instance if any
  if (window.oscillaObserver) window.oscillaObserver.disconnect();

  const rootContainer =
    document.getElementById("pageOverlay") ||
    document.getElementById("scoreContainer") ||
    null;

  ////////////////////////////////////////////////////////
  // OBSERVER CALLBACK
  ////////////////////////////////////////////////////////
  window.oscillaObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (!el) continue;

        const uid = el.dataset.animUid;
        if (!uid) continue;

        const anim = window.oscillaAnimRegistry[uid];
        if (!anim) continue;

        const instance = window.runningAnimations[uid];
        const kind = anim.kind; // "rotate" | "scale" | "o2p" | ...
        const isO2P = kind === "o2p";

        // forceVisible:
        //   - explicit anim.forceVisible (page overlay etc.)
        //   - OR any O2P animation (always treated as "always visible")
        const forceVisible = anim.forceVisible === true || isO2P;

        ////////////////////////////////////////////////////////
        // A) FORCE-VISIBLE (page overlay OR O2P)
        //    → autostart once, NO pause/resume
        ////////////////////////////////////////////////////////
        if (forceVisible) {
          if (!anim.started) {
            // console.log(`[Observer] ▶ forceVisible autostart "${uid}" (kind="${kind}")`);
            anim.started = true;
            anim.startFn?.();
          }
          // No pause/resume for forceVisible animations.
          continue;
        }

        ////////////////////////////////////////////////////////
        // B) AUTOSTART (ONLY trig:auto)
        ////////////////////////////////////////////////////////
        if (
          anim.trig === "auto" &&
          !anim.started &&
          entry.isIntersecting
        ) {
          // console.log(`[Observer] ▶ autostart "${uid}" (kind="${kind}")`);
          anim.startFn?.();
          anim.started = true;
          // fall through to pause/resume logic below if needed
        }

        ////////////////////////////////////////////////////////
        // C) PAUSE/RESUME on visibility
        //    Only for rotate/scale, never for O2P or forceVisible
        ////////////////////////////////////////////////////////
        if (!instance) continue;

        const supportsPauseResume =
          (kind === "rotate" || kind === "scale");

        if (!supportsPauseResume) {
          // O2P and any other kinds are left running continuously.
          continue;
        }

        if (entry.isIntersecting && instance.wasPaused) {
          // console.log(`[Observer] ▶ resume "${uid}" (kind="${kind}")`);
          if (typeof instance.play === "function") {
            instance.play();
          } else if (typeof instance.resume === "function") {
            instance.resume();
          }
          instance.wasPaused = false;
        } else if (!entry.isIntersecting && !instance.wasPaused) {
          // console.log(`[Observer] ▶ pause "${uid}" (kind="${kind}")`);
          if (typeof instance.pause === "function") {
            instance.pause();
          }
          instance.wasPaused = true;
        }
      }
    },
    {
      root: rootContainer,
      threshold: 0.01
    }
  );

  ////////////////////////////////////////////////////////
  // Attach observer to every animation element
  ////////////////////////////////////////////////////////
  for (const uid in window.oscillaAnimRegistry) {
    const anim = window.oscillaAnimRegistry[uid];
    if (anim?.el instanceof Element) {
      window.oscillaObserver.observe(anim.el);
    }
  }

  // console.log("[Observer] Initialized (auto-start, rotate/scale pause-resume, O2P forceVisible).");
}

//////////////////////////////////////////////////////////
// 2. Refresh Observer after animations registered
//////////////////////////////////////////////////////////

window.refreshObserver = function () {
  // console.log("[Observer] Refresh request → reinitializing observer");
  initializeObserver();
};

//////////////////////////////////////////////////////////
// 3. Manual visibility pass (after load / jump)
//    Mirrors the same rules as the IntersectionObserver:
//      - autostart for trig:auto
//      - forceVisible (page overlay + O2P) autostarts, no pause/resume
//      - pause/resume only for rotate/scale
//////////////////////////////////////////////////////////

window.checkAnimationVisibility = function () {
  // console.log("[Observer] Manual visibility scan…");

  for (const uid in window.oscillaAnimRegistry) {
    const anim = window.oscillaAnimRegistry[uid];
    if (!anim) continue;

    const el = anim.el;
    if (!(el instanceof Element)) continue;

    const instance = window.runningAnimations[uid];
    const kind = anim.kind;
    const isO2P = kind === "o2p";
    const forceVisible = anim.forceVisible === true || isO2P;
    const visible = isVisible(el);

    ////////////////////////////////////////////////////////
    // Autostart for trig:auto and/or forceVisible
    ////////////////////////////////////////////////////////
    if (!anim.started) {
      if (forceVisible && !anim.started) {
        // console.log(`[Observer] ▶ manual forceVisible autostart "${uid}" (kind="${kind}")`);
        anim.startFn?.();
        anim.started = true;
      } else if (anim.trig === "auto" && visible) {
        // console.log(`[Observer] ▶ manual autostart "${uid}" (kind="${kind}")`);
        anim.startFn?.();
        anim.started = true;
      }
    }

    ////////////////////////////////////////////////////////
    // Pause/Resume only for rotate/scale, never for O2P or forceVisible
    ////////////////////////////////////////////////////////
    if (!instance) continue;

    const supportsPauseResume =
      (kind === "rotate" || kind === "scale");

    if (!supportsPauseResume || forceVisible) {
      continue;
    }

    if (visible && instance.wasPaused) {
      // console.log(`[Observer] ▶ manual resume "${uid}" (kind="${kind}")`);
      if (typeof instance.play === "function") {
        instance.play();
      } else if (typeof instance.resume === "function") {
        instance.resume();
      }
      instance.wasPaused = false;
    } else if (!visible && !instance.wasPaused) {
      // console.log(`[Observer] ▶ manual pause "${uid}" (kind="${kind}")`);
      if (typeof instance.pause === "function") {
        instance.pause();
      }
      instance.wasPaused = true;
    }
  }
};
