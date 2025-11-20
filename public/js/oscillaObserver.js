//////////////////////////////////////////////////////////
// OscillaScore — Clean Animation Observer System
// ----------------------------------------------------
// Supports:
//   - trig:auto     → start when visible (first time only)
//   - trig:playhead → start ONLY via cue (never autostart)
//   - pause/resume  → when leaving/entering viewport
//
// Requires:
//   - window.oscillaAnimRegistry = { uid → { el, trig, startFn, started } }
//   - window.runningAnimations = { uid → animeInstance }
//   - each animated element has data-anim-uid="<uid>"
//////////////////////////////////////////////////////////

// Ensure global registries exist
window.oscillaAnimRegistry = window.oscillaAnimRegistry || {};
window.runningAnimations = window.runningAnimations || {};

// Utility: element visibility
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

  // Disconnect older observer
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

        ////////////////////////////////////////////////////////
        // A) PAGE OVERLAY MODE → animations always visible
        ////////////////////////////////////////////////////////
        const forceVisible = anim.forceVisible === true;

        if (forceVisible) {
          if (!anim.started) {
            console.log(`[Observer] ▶ forceVisible autostart "${uid}"`);
            anim.started = true;
            anim.startFn?.();
          }
          continue;   // ← VALID HERE because inside loop
        }

        ////////////////////////////////////////////////////////
        // B) AUTOSTART (ONLY trig:auto)
        ////////////////////////////////////////////////////////
        if (
          anim.trig === "auto" &&
          !anim.started &&
          entry.isIntersecting
        ) {
          console.log(`[Observer] ▶ autostart "${uid}"`);
          anim.startFn?.();
          anim.started = true;
          continue;
        }

        ////////////////////////////////////////////////////////
        // C) PAUSE/RESUME on visibility
        ////////////////////////////////////////////////////////
        if (instance) {
          if (entry.isIntersecting && instance.paused) {
            console.log(`[Observer] ▶ resume "${uid}"`);
            instance.play();
            instance.paused = false;
          } else if (!entry.isIntersecting && !instance.paused) {
            console.log(`[Observer] ▶ pause "${uid}"`);
            instance.pause();
            instance.paused = true;
          }
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

  console.log("[Observer] Initialized.");
}

//////////////////////////////////////////////////////////
// 2. Refresh Observer after animations registered
//////////////////////////////////////////////////////////

window.refreshObserver = function () {
  console.log("[Observer] Refresh request");
  initializeObserver({ forceVisible: window.isPageOverlay });
};

//////////////////////////////////////////////////////////
// 3. Manual visibility pass (after load / jump)
//////////////////////////////////////////////////////////

window.checkAnimationVisibility = function () {
  console.log("[Observer] Manual visibility scan…");

  for (const uid in window.oscillaAnimRegistry) {
    const anim = window.oscillaAnimRegistry[uid];
    const el = anim.el;
    const instance = window.runningAnimations[uid];

    // AUTOSTART only if trig:auto
    if (anim.trig === "auto" && !anim.started && isVisible(el)) {
      console.log(`[Observer] ▶ autostart (manual) "${uid}"`);
      anim.startFn?.();
      anim.started = true;
    }

    // PAUSE / RESUME
    if (instance) {
      const vis = isVisible(el);
      if (vis && instance.wasPaused) {
        instance.resume?.();
        instance.wasPaused = false;
      } else if (!vis && !instance.wasPaused) {
        instance.pause?.();
        instance.wasPaused = true;
      }
    }
  }
};
