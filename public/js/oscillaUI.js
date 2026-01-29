// ============================================================================
// oscillaUi.js — UI / CSS Control Cue Handler for OscillaScore
// -----------------------------------------------------------------------------
// Supports declarative UI state changes via:
//   ui(selector, opacity:0.5, scale:1.2, x:10, y:-20, rotate:15, visible:false, dur:0.3)
//
// Applies to ANY HTML element (not SVG).
// Uses whitelisted properties only.
// Keeps internal transform state per element.
// ============================================================================

const uiState = new WeakMap();

/**
 * Whitelisted UI properties
 * (do NOT allow arbitrary CSS injection)
 */
const UI_PROPS = new Set([
  "opacity",
  "scale",
  "x",
  "y",
  "rotate",
  "visible",
  "color",
  "bg",
  "z",
]);

/**
 * handleUICue(ast)
 * ---------------------------------------------------------------------------
 * AST format expected:
 * {
 *   type: "cueUi",
 *   args: [
 *     { type: "selector", value: "#playhead" },
 *     { type: "opacity", value: 0 },
 *     { type: "dur", value: 0.3 }
 *   ]
 * }
 */
export function handleUICue(ast) {

  // ----------------------------------
  // Action mode (control-plane bridge)
  // ----------------------------------
  const actionArg = ast.args?.find(a => a.type === "action");
  if (actionArg) {
    handleUIAction(ast.args);
    return;
  }

  // ----------------------------------
  // Regular UI mode (requires selector)
  // ----------------------------------
  if (!ast || !Array.isArray(ast.args)) {
    console.warn("[ui] Invalid AST:", ast);
    return;
  }

  let selector = null;
  let dur = 0;
  const params = {};

  // ----------------------------------
  // Extract selector + params
  // ----------------------------------
  for (const arg of ast.args) {
    if (!arg || !arg.type) continue;

    if (arg.type === "selector" || arg.type === "target") {
      selector = arg.value;
      continue;
    }

    if (arg.type === "dur") {
      dur = Number(arg.value) || 0;
      continue;
    }

    if (UI_PROPS.has(arg.type)) {
      params[arg.type] = arg.value;
    }
  }

  if (!selector) {
    console.warn("[ui] Missing selector (required for UI manipulation):", ast);
    return;
  }

  const elements = document.querySelectorAll(selector);
  if (!elements.length) {
    console.warn(`[ui] No elements match selector: ${selector}`);
    return;
  }

  elements.forEach(el => applyUiToElement(el, params, dur));
}


function handleUIAction(args) {
  const params = {};
  for (const a of args) {
    if (!a?.type) continue;
    params[a.type] = a.value;
  }

  const action = params.action;
  if (!action) {
    console.warn("[ui] action missing");
    return;
  }

  switch (action) {
    case "controlXYSave":
      window.controlXYPresets?.save(
        params.preset,
        params.uid
      );
      break;

    case "controlXYRecall":
      window.controlXYPresets?.recall(
        params.preset,
        {
          dur: params.dur,
          ease: params.ease
        }
      );
      break;

    case "controlXYDefineSequence":
      {
        const name = params.name || params.seq || params.sequence;
        if (!name) {
          console.warn("[ui] controlXYDefineSequence: name required");
          return;
        }
        
        // Parse steps from comma-separated string or array
        let steps;
        if (typeof params.steps === 'string') {
          steps = params.steps.split(',').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(params.steps)) {
          steps = params.steps;
        } else {
          console.warn("[ui] controlXYDefineSequence: steps required (comma-separated string or array)");
          return;
        }
        
        if (steps.length === 0) {
          console.warn("[ui] controlXYDefineSequence: empty steps");
          return;
        }
        
        window.controlXYPresets?.defineSequence(name, steps);
        console.log(`[ui] Defined sequence "${name}" with ${steps.length} steps:`, steps);
      }
      break;

    case "controlXYSequence":
      window.controlXYPresets?.playSequence(
        params.seq || params.sequence,
        {
          dur: params.dur,
          ease: params.ease,
          loop: params.loop
        }
      );
      break;

    case "controlXYSequenceStop":
      window.controlXYPresets?.stopSequence();
      break;

    default:
      console.warn("[ui] Unknown action:", action);
  }
}



/**
 * Apply UI params to a single element
 */
function applyUiToElement(el, params, dur) {
  // ----------------------------------
  // Initialise transform state
  // ----------------------------------
  if (!uiState.has(el)) {
    uiState.set(el, {
      scale: 1,
      x: 0,
      y: 0,
      rotate: 0,
    });
  }

  const state = uiState.get(el);

  // ----------------------------------
  // Transition handling
  // ----------------------------------
  if (dur > 0) {
    el.style.transition = [
      `opacity ${dur}s ease`,
      `transform ${dur}s ease`,
      `background-color ${dur}s ease`,
      `color ${dur}s ease`
    ].join(", ");
  } else {
    el.style.transition = "none";
  }

  // ----------------------------------
  // Visibility (display + pointer events)
  // ----------------------------------
  if ("visible" in params) {
    const visible = !!params.visible;

    if (!visible) {
      el.style.pointerEvents = "none";

      if (dur > 0) {
        el.style.opacity = "0";
        setTimeout(() => {
          el.style.display = "none";
        }, dur * 1000);
      } else {
        el.style.display = "none";
      }
    } else {
      el.style.display = "";
      el.style.pointerEvents = "auto";
      el.style.opacity = "1";
    }
  }

  // ----------------------------------
  // Opacity
  // ----------------------------------
  if ("opacity" in params) {
    el.style.opacity = String(params.opacity);
  }

  // ----------------------------------
  // Colour
  // ----------------------------------
  if ("color" in params) {
    el.style.color = params.color;
  }

  if ("bg" in params) {
    el.style.backgroundColor = params.bg;
  }

  // ----------------------------------
  // Z-index
  // ----------------------------------
  if ("z" in params) {
    el.style.zIndex = String(params.z);
  }

  // ----------------------------------
  // Transform state update
  // ----------------------------------
  if ("scale" in params) state.scale = Number(params.scale);
  if ("x" in params) state.x = Number(params.x);
  if ("y" in params) state.y = Number(params.y);
  if ("rotate" in params) state.rotate = Number(params.rotate);

  el.style.transform = `
    translate(${state.x}px, ${state.y}px)
    scale(${state.scale})
    rotate(${state.rotate}deg)
  `.trim();
}