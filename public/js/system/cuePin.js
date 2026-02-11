// =============================================================
//  cuePin.js -- pin elements to playhead for a duration
//
//  Generic system: works with any cue type via `pin:N` param.
//  Element scrolls normally -> hooks to playhead when center
//  aligns -> stays pinned for N seconds -> releases and
//  drifts off-screen with normal scroll.
//
//  Coordinate space: SVG world units (same as window.playheadX)
//
//  Exports:
//    registerPin(element, durationSec)
//    updatePins()          -- called from RAF tick pipeline
//    clearAllPins()        -- called on stop/reset
// =============================================================

const SVG_NS = "http://www.w3.org/2000/svg";


// =============================================================
//  Pin registry
// =============================================================

/** @type {Map<Element, PinState>} */
const pins = new Map();

/**
 * @typedef {object} PinState
 * @property {SVGGElement}  wrapper       - <g> wrapping the element
 * @property {number}       centerX       - original center X in SVG world coords
 * @property {number}       duration      - pin duration in seconds
 * @property {"waiting"|"pinned"|"released"} phase
 * @property {number}       pinnedAtTime  - elapsedTime when pin engaged
 * @property {number}       frozenOffset  - frozen translateX on release
 */


// =============================================================
//  registerPin
// =============================================================

/**
 * Register an element for pin behavior.
 * Wraps the element in a <g> to isolate the pin transform
 * from any animation transforms on the element itself.
 *
 * @param {SVGElement} element     - the cue element
 * @param {number}     durationSec - how long to stay pinned (seconds)
 */
export function registerPin(element, durationSec) {
  if (!element || !durationSec || durationSec <= 0) return;
  if (pins.has(element)) return;

  // Measure center X BEFORE wrapping (getBBox in SVG world coords)
  const box = element.getBBox();
  const centerX = box.x + box.width / 2;

  // Wrap in a <g> to avoid transform conflicts with animations
  const wrapper = document.createElementNS(SVG_NS, "g");
  wrapper.classList.add("pin-wrapper");
  element.parentNode.insertBefore(wrapper, element);
  wrapper.appendChild(element);

  const state = {
    wrapper,
    centerX,
    duration: durationSec * 1000,  // convert to ms (matches window.elapsedTime)
    phase: "waiting",
    pinnedAtTime: 0,
    frozenOffset: 0
  };

  pins.set(element, state);

  console.log(`[cuePin] Registered pin:${durationSec}s centerX=${centerX.toFixed(1)}`);
}


// =============================================================
//  updatePins -- called every RAF frame
// =============================================================

export function updatePins() {
  if (pins.size === 0) return;
  if (!window.isPlaying) return;

  const playX = window.playheadX;
  const elapsed = window.elapsedTime;
  if (playX == null || elapsed == null) return;

  for (const [element, state] of pins) {
    switch (state.phase) {

      case "waiting": {
        if (playX >= state.centerX) {
          state.phase = "pinned";
          state.pinnedAtTime = elapsed;
          console.log(`[cuePin] Pinned at elapsed=${elapsed.toFixed(1)}s, playX=${playX.toFixed(1)}`);
        }
        break;
      }

      case "pinned": {
        // If playhead rewound before center, reset to waiting
        if (playX < state.centerX) {
          state.wrapper.removeAttribute("transform");
          state.phase = "waiting";
          state.pinnedAtTime = 0;
          break;
        }

        const offset = playX - state.centerX;
        state.wrapper.setAttribute("transform", `translate(${offset}, 0)`);

        const pinElapsed = elapsed - state.pinnedAtTime;
        if (pinElapsed >= state.duration) {
          state.phase = "released";
          state.frozenOffset = offset;
          console.log(`[cuePin] Released after ${state.duration / 1000}s, offset=${offset.toFixed(1)}`);
        }
        break;
      }

      case "released":
        // If playhead rewound before center, reset to waiting
        if (playX < state.centerX) {
          state.wrapper.removeAttribute("transform");
          state.phase = "waiting";
          state.frozenOffset = 0;
        }
        // Otherwise transform stays frozen; element resumes normal scroll
        break;
    }
  }
}


// =============================================================
//  clearAllPins -- reset on stop/rewind
// =============================================================

export function clearAllPins() {
  for (const [element, state] of pins) {
    // Reset transform and phase -- keep wrapper intact for re-pin
    state.wrapper.removeAttribute("transform");
    state.phase = "waiting";
    state.pinnedAtTime = 0;
    state.frozenOffset = 0;
  }
}
