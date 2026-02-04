/*!
 * oscillaControlXY.js — Multitouch XY Control Pad
 * Part of oscillaScore control plane
 * © 2025 Rob Canning — GPLv3
 *
 * controlXY(...) defines a persistent, multitouch control surface.
 * Multiple handles can be constrained to a bounding shape and each
 * continuously publishes normalized X/Y values (0..1, up = 1).
 *
 * Syntax:
 *   controlXY(uid:pad1, handle:dot1)                    // single handle, bounds = self
 *   controlXY(uid:pad1, handle:[dot1,dot2,dot3])        // multitouch
 *   controlXY(uid:pad1, bounds:customRect, handle:dot1) // explicit bounds
 *   controlXY(uid:pad1, handle:dot1, label:true)        // show value labels
 *   controlXY(uid:pad1, handle:dot1, osc:true)          // enable OSC output
 */

import { publish } from "../control/paramBinding.js";
import { sendOSCMessage, createOscOverlay } from "./osc.js";
import * as shared from "../control/controlXYShared.js";

/**
 * handleControlXYCue()
 *
 * Args (DSL):
 *   uid:        required unique id for the control pad
 *   bounds:     id of bounding element, or "self" (default = self)
 *   handle:     id or array of ids for draggable handle elements
 *   label:      true | false - show value labels above handles
 *   osc:        false | true | number (throttle ms)
 *   oscAddr:    optional OSC address override
 */
export function handleControlXYCue(el, args = [], options = {}) {
  console.log("[controlXY] called...");

  // ---------------------------------------------
  // Parse args
  // ---------------------------------------------
  const cfg = {};
  for (const a of args) {
    if (!a?.type) continue;
    cfg[a.type] = a.value;
  }

  const uid = cfg.uid || el.id;
  if (!uid) {
    console.warn("[controlXY] Missing uid");
    return;
  }

  // ---------------------------------------------
  // Resolve bounds element (default = self)
  // ---------------------------------------------
  const svg = el.ownerSVGElement;
  if (!svg) {
    console.warn("[controlXY] No parent SVG found");
    return;
  }

  let boundsEl;
  const boundsId = cfg.bounds;
  
  if (!boundsId || boundsId === "self") {
    // Default: use the element the DSL is attached to
    boundsEl = el;
    console.log("[controlXY] bounds: self →", el.id || el.tagName);
  } else {
    boundsEl = svg.getElementById(boundsId);
    if (!boundsEl) {
      console.warn("[controlXY] bounds element not found:", boundsId);
      return;
    }
  }

  // ---------------------------------------------
  // Parse handle(s) - support single or array
  // ---------------------------------------------
  let handleIds = cfg.handle;
  
  if (!handleIds) {
    console.warn("[controlXY] handle is required", cfg);
    return;
  }

  // Normalize to array
  if (!Array.isArray(handleIds)) {
    handleIds = [handleIds];
  }

  // Resolve handle elements
  const handleEls = [];
  for (const hid of handleIds) {
    const hel = svg.getElementById(hid);
    if (hel) {
      handleEls.push({ id: hid, el: hel });
    } else {
      console.warn("[controlXY] handle not found:", hid);
    }
  }

  if (handleEls.length === 0) {
    console.warn("[controlXY] No valid handles found");
    // Debug: list available IDs
    const allIds = [...svg.querySelectorAll('[id]')].map(e => e.id).filter(Boolean);
    console.log("[controlXY] Available IDs:", allIds.slice(0, 50), allIds.length > 50 ? `... and ${allIds.length - 50} more` : '');
    return;
  }

  // ---------------------------------------------
  // Compute bounds bbox (static)
  // ---------------------------------------------
  const bbox = boundsEl.getBBox();
  if (!bbox || bbox.width === 0 || bbox.height === 0) {
    console.warn("[controlXY] Invalid bounds bbox", bbox);
    return;
  }

  console.log("[controlXY] bounds bbox:", bbox);

  // ---------------------------------------------
  // Add discrete hide/show circle at corner
  // ---------------------------------------------
  const hideShowCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  hideShowCircle.setAttribute("cx", bbox.x + bbox.width);
  hideShowCircle.setAttribute("cy", bbox.y + bbox.height);
  hideShowCircle.setAttribute("r", "7.5");
  hideShowCircle.setAttribute("fill", "none");
  hideShowCircle.setAttribute("stroke", "#ff0000");
  hideShowCircle.setAttribute("stroke-width", "1");
  hideShowCircle.classList.add("controlxy-hideshow-circle");
  hideShowCircle.style.cursor = "pointer";
  hideShowCircle.dataset.uid = uid;
  
  hideShowCircle.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    window.controlXYLauncher?.toggle(uid);
  });
  
  // Insert into SVG
  const parent = boundsEl.parentNode || svg;
  parent.appendChild(hideShowCircle);

  // ---------------------------------------------
  // Config options
  // ---------------------------------------------
  const showLabels = cfg.label === true || cfg.label === "true";
  const oscEnabled = cfg.osc !== false && cfg.osc !== "false" && cfg.osc !== 0;
  const oscThrottle = typeof cfg.osc === "number" ? cfg.osc : 30;
  const oscAddr = cfg.oscAddr
    ? cfg.oscAddr.replace(/^\//, "")
    : `controlXY/${uid}`;
  
  // Launcher options
  const launcherEnabled = cfg.launcher !== false && cfg.launcher !== "false";
  const launcherSlots = typeof cfg.launcher === "number" ? cfg.launcher : 8;
  const launcherBanks = typeof cfg.banks === "number" ? cfg.banks : 3;

  // ---------------------------------------------
  // Preset Launcher Buttons
  // ---------------------------------------------
  let launcherElement = null;
  
  if (launcherEnabled) {
    launcherElement = createLauncher(uid, bbox, launcherSlots, launcherBanks, parent);
  }

  // ---------------------------------------------
  // Helpers
  // ---------------------------------------------
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function svgPointFromEvent(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // ---------------------------------------------
  // Create label element for a handle
  // ---------------------------------------------
  function createLabel(handleEl) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.classList.add("controlxy-label");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "auto");
    label.setAttribute("font-size", "12");
    label.setAttribute("font-family", "monospace");
    label.setAttribute("fill", "#000000");
    label.setAttribute("font-weight", "600");
    label.setAttribute("pointer-events", "none");
    label.textContent = "0.50, 0.50";
    
    // Insert after handle's parent or into SVG root
    const parent = handleEl.parentNode || svg;
    parent.appendChild(label);
    
    return label;
  }

  // ---------------------------------------------
  // Update label position and text
  // ---------------------------------------------
  function updateLabel(label, handleEl, normX, normY, offsetX, offsetY) {
    if (!label) return;
    
    // Position above the handle
    const hbox = handleEl.getBBox();
    const labelX = hbox.x + hbox.width / 2 + offsetX;
    const labelY = hbox.y + offsetY - 8; // 8px above handle
    
    label.setAttribute("x", labelX);
    label.setAttribute("y", labelY);
    label.textContent = `${normX.toFixed(2)}, ${normY.toFixed(2)}`;
  }

  // ---------------------------------------------
  // Track last touched handle for label visibility
  // ---------------------------------------------
  let lastTouchedHandle = null;

  // ---------------------------------------------
  // Per-handle state and setup
  // ---------------------------------------------
  const handles = handleEls.map(({ id, el: handleEl }, index) => {
    // Capture original center
    const originalTransform = handleEl.getAttribute("transform") || "";
    handleEl.removeAttribute("transform");
    
    const hbbox = handleEl.getBBox();
    const originalCenterX = hbbox.x + hbbox.width / 2;
    const originalCenterY = hbbox.y + hbbox.height / 2;
    
    if (originalTransform) {
      handleEl.setAttribute("transform", originalTransform);
    }

    // Initial position: center of bounds
    let curX = bbox.x + bbox.width / 2;
    let curY = bbox.y + bbox.height / 2;

    // Create label if enabled
    const label = showLabels ? createLabel(handleEl) : null;

    // Compute initial offset
    let offsetX = curX - originalCenterX;
    let offsetY = curY - originalCenterY;

    // Apply initial position
    handleEl.setAttribute("transform", `translate(${offsetX}, ${offsetY})`);

    // Style for interactivity
    handleEl.style.pointerEvents = "auto";
    handleEl.style.cursor = "grab";
    handleEl.style.touchAction = "none";
    handleEl.style.opacity = "1";
    handleEl.style.visibility = "visible";
    
    // Add CSS class for styling
    handleEl.classList.add("controlxy-handle");

    // Bring to front
    handleEl.parentNode.appendChild(handleEl);

    // Update label initial position
    if (label) {
      const normX = 0.5;
      const normY = 0.5;
      updateLabel(label, handleEl, normX, normY, offsetX, offsetY);
    }

    console.log(`[controlXY] handle ${id} initialized at center`);

    return {
      id,
      el: handleEl,
      label,
      originalCenterX,
      originalCenterY,
      curX,
      curY,
      offsetX,
      offsetY,
      pointerId: null,  // For multitouch tracking
      dragging: false,
      lastOscSent: 0
    };
  });

  // ---------------------------------------------
  // Emit values for a handle
  // ---------------------------------------------
  function emit(handle) {
    const normX = clamp((handle.curX - bbox.x) / bbox.width, 0, 1);
    const normY = clamp(1 - (handle.curY - bbox.y) / bbox.height, 0, 1);

    // Publish to control plane with handle index
    // Format: controlXY:<uid>.<handleId> or controlXY:<uid> for single
    const publishKey = handles.length > 1 ? `${handle.id}` : uid;
    
    publish("controlXY", uid, {
      handle: handle.id,
      x: normX,
      y: normY,
      // Also publish indexed values for convenience
      [`${handle.id}.x`]: normX,
      [`${handle.id}.y`]: normY
    });

    // Update label
    if (handle.label) {
      updateLabel(handle.label, handle.el, normX, normY, handle.offsetX, handle.offsetY);
    }

    // OSC output
    if (oscEnabled) {
      const now = performance.now();
      if (now - handle.lastOscSent >= oscThrottle) {
        handle.lastOscSent = now;

        const addr = handles.length > 1 
          ? `${oscAddr}/${handle.id}` 
          : oscAddr;

        sendOSCMessage?.({
          type: "osc_value",
          addr: addr,
          args: [normX, normY],
          timestamp: Date.now()
        });
      }
    }
  }

  // ---------------------------------------------
  // Apply position to a handle
  // ---------------------------------------------
  function applyPosition(handle, targetX, targetY) {
    handle.curX = clamp(targetX, bbox.x, bbox.x + bbox.width);
    handle.curY = clamp(targetY, bbox.y, bbox.y + bbox.height);
    
    handle.offsetX = handle.curX - handle.originalCenterX;
    handle.offsetY = handle.curY - handle.originalCenterY;
    
    handle.el.setAttribute("transform", `translate(${handle.offsetX}, ${handle.offsetY})`);
  }

  // ---------------------------------------------
  // Find handle by pointer ID (for multitouch)
  // ---------------------------------------------
  function findHandleByPointerId(pointerId) {
    return handles.find(h => h.pointerId === pointerId);
  }

  // ---------------------------------------------
  // Find nearest handle to a point (for new touches)
  // ---------------------------------------------
  function findNearestFreeHandle(svgPt) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const h of handles) {
      if (h.dragging) continue; // Skip already-dragging handles
      
      const dx = h.curX - svgPt.x;
      const dy = h.curY - svgPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = h;
      }
    }

    return nearest;
  }

  // ---------------------------------------------
  // Pointer event handlers
  // ---------------------------------------------
  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();

    const svgPt = svgPointFromEvent(e);
    
    // Find which handle was clicked (check if inside handle bounds)
    let targetHandle = null;
    
    for (const h of handles) {
      if (h.el === e.target || h.el.contains(e.target)) {
        targetHandle = h;
        break;
      }
    }

    // If no direct hit, find nearest free handle
    if (!targetHandle) {
      targetHandle = findNearestFreeHandle(svgPt);
    }

    if (!targetHandle || targetHandle.dragging) return;

    targetHandle.dragging = true;
    targetHandle.pointerId = e.pointerId;
    targetHandle.el.setPointerCapture?.(e.pointerId);
    
    // Add active class for CSS styling
    targetHandle.el.classList.add("controlxy-handle--active");
    
    // Update label visibility - show dragging label
    if (targetHandle.label) {
      targetHandle.label.classList.add("dragging");
    }
    
    // Update last touched - remove from previous, set to current
    if (lastTouchedHandle && lastTouchedHandle !== targetHandle && lastTouchedHandle.label) {
      lastTouchedHandle.label.classList.remove("last-touched");
    }
    lastTouchedHandle = targetHandle;
    
    // Move to touch position
    applyPosition(targetHandle, svgPt.x, svgPt.y);
    emit(targetHandle);

    console.log(`[controlXY] pointer down on ${targetHandle.id}`);
  }

  function onPointerMove(e) {
    const handle = findHandleByPointerId(e.pointerId);
    if (!handle || !handle.dragging) return;

    const svgPt = svgPointFromEvent(e);
    applyPosition(handle, svgPt.x, svgPt.y);
    emit(handle);
  }

  function onPointerUp(e) {
    const handle = findHandleByPointerId(e.pointerId);
    if (!handle) return;

    handle.dragging = false;
    handle.pointerId = null;
    handle.el.releasePointerCapture?.(e.pointerId);
    
    // Remove active class
    handle.el.classList.remove("controlxy-handle--active");
    
    // Update label visibility - switch from dragging to last-touched
    if (handle.label) {
      handle.label.classList.remove("dragging");
      handle.label.classList.add("last-touched");
    }

    console.log(`[controlXY] pointer up on ${handle.id}`);
  }

  function onPointerCancel(e) {
    onPointerUp(e);
  }

  // ---------------------------------------------
  // Register event listeners on each handle
  // ---------------------------------------------
  for (const handle of handles) {
    handle.el.addEventListener("pointerdown", onPointerDown);
    
    // Hover events for label visibility
    handle.el.addEventListener("pointerenter", () => {
      if (handle.label && !handle.dragging) {
        handle.label.classList.add("hovered");
      }
    });
    
    handle.el.addEventListener("pointerleave", () => {
      if (handle.label) {
        handle.label.classList.remove("hovered");
      }
    });
  }

  // ---------------------------------------------
  // IMPORTANT: Prevent score dragging when interacting with pad
  // ---------------------------------------------
  const preventScoreDrag = (e) => {
    // Stop propagation to prevent transport/score from handling this event
    e.stopPropagation();
    
    // Only preventDefault if we're actually interacting (not just hovering)
    if (e.type === 'pointerdown' || e.type === 'mousedown' || e.type === 'touchstart') {
      e.preventDefault();
    }
  };

  // Add event capture to the bounds element (the pad background)
  boundsEl.addEventListener("pointerdown", preventScoreDrag, true);
  boundsEl.addEventListener("mousedown", preventScoreDrag, true);
  boundsEl.addEventListener("touchstart", preventScoreDrag, { passive: false, capture: true });
  
  // Also prevent pointer events from bubbling up during drag
  boundsEl.addEventListener("pointermove", (e) => {
    if (handles.some(h => h.dragging)) {
      e.stopPropagation();
    }
  }, true);

  // Global listeners for move/up (to handle drag outside element)
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);

  // ---------------------------------------------
  // Emit initial values
  // ---------------------------------------------
  for (const handle of handles) {
    emit(handle);
  }

  // ---------------------------------------------
  // Store reference for cleanup and preset system
  // ---------------------------------------------
  const instance = {
    uid,
    handles,
    boundsEl,
    oscEnabled,
    oscThrottle,
    oscAddr,
    updateLabel,
    cleanup: () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      
      // Remove bounds element listeners
      boundsEl.removeEventListener("pointerdown", preventScoreDrag, true);
      boundsEl.removeEventListener("mousedown", preventScoreDrag, true);
      boundsEl.removeEventListener("touchstart", preventScoreDrag, true);
      
      // Remove hide/show circle
      if (hideShowCircle && hideShowCircle.parentNode) {
        hideShowCircle.parentNode.removeChild(hideShowCircle);
      }
      
      // Remove launcher
      if (launcherElement && launcherElement.parentNode) {
        launcherElement.parentNode.removeChild(launcherElement);
      }
      
      for (const h of handles) {
        h.el.removeEventListener("pointerdown", onPointerDown);
        if (h.label) h.label.remove();
      }
      // Remove from registry
      window._controlXYRegistry?.delete(uid);
    }
  };
  
  el._controlXY = instance;
  
  // Register globally for preset system
  window._controlXYRegistry = window._controlXYRegistry || new Map();
  window._controlXYRegistry.set(uid, instance);

  console.log(`[controlXY] registered ${uid} with ${handles.length} handle(s)`);
}

// thin wrappers

export function handleControlXYRecallCue(ast) {
  const api = window.controlXYPresets;
  if (!api) return;

  const args = {};
  for (const a of ast.args || []) args[a.key || a.type] = a.value;

  const preset = args.preset;
  if (!preset) {
    console.warn("[controlXYRecall] missing preset");
    return;
  }

  const options = {};
  if (args.dur !== undefined) options.dur = args.dur;
  if (args.ease !== undefined) options.ease = args.ease;

  api.recall(preset, options);
}

// ============================================================================
// PRESET LAUNCHER UI
// ============================================================================

/**
 * Create preset launcher button overlay
 */
function createLauncher(uid, bbox, slots, totalBanks, parent) {
  const buttonHeight = 44;      // Increased for better touch targets
  const buttonSpacing = 5;      // Gap between rows
  const bankBarHeight = 34;     // Taller bank bar
  const padding = 8;            // Account for padding/borders
  const totalHeight = buttonHeight + buttonSpacing + bankBarHeight + padding;
  
  // Position below the pad
  const launcherY = bbox.y + bbox.height + 8;
  
  // Create foreignObject container
  const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
  fo.setAttribute("x", bbox.x);
  fo.setAttribute("y", launcherY);
  fo.setAttribute("width", bbox.width);
  fo.setAttribute("height", totalHeight);
  fo.classList.add("controlxy-launcher-container");
  
  // IMPORTANT: Allow overflow so content isn't clipped
  fo.style.overflow = "visible";
  
  // Create HTML content
  const container = document.createElement("div");
  container.className = "controlxy-launcher";
  container.dataset.uid = uid;
  
  // Explicitly set dimensions on the HTML container
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.overflow = "visible";
  container.style.boxSizing = "border-box";
  
  // Button row - NOW FIRST (slots for presets/sequences)
  const buttonRow = document.createElement("div");
  buttonRow.className = "controlxy-launcher-buttons";
  
  for (let i = 0; i < slots; i++) {
    const btn = document.createElement("button");
    btn.className = "controlxy-launcher-slot";
    btn.dataset.slot = i;
    btn.innerHTML = `<span class="slot-number">${i + 1}</span><span class="slot-label">Empty</span>`;
    btn.title = "Left-click: Recall | Right-click: Store current";
    buttonRow.appendChild(btn);
  }
  
  container.appendChild(buttonRow);
  
  // Bank selector bar - NOW SECOND (full width with placeholder)
  const bankBar = document.createElement("div");
  bankBar.className = "controlxy-launcher-bank-bar";
  bankBar.innerHTML = `
    <button class="controlxy-launcher-bank-btn" data-action="prev" title="Previous Bank">←</button>
    <span class="controlxy-launcher-bank-label">
      <span class="bank-name">Bank 1</span>
      <span class="bank-count">(1/${totalBanks})</span>
    </span>
    <button class="controlxy-launcher-bank-btn" data-action="next" title="Next Bank">→</button>
    <button class="controlxy-launcher-mode-btn" data-mode="preset" title="Toggle Preset/Sequence Mode">P</button>
    <button class="controlxy-launcher-tween-btn active" data-tween="true" title="Toggle Tween/Jump">~</button>
    <button class="controlxy-launcher-settings-btn" title="Open Preset Manager">⚙</button>
    <div class="controlxy-launcher-placeholder" data-placeholder="future-features"></div>
  `;
  container.appendChild(bankBar);
  
  fo.appendChild(container);
  parent.appendChild(fo);
  
  // Initialize launcher state
  initializeLauncher(uid, container, slots, totalBanks);
  
  return fo;
}

/**
 * Initialize launcher state and event handlers
 * Uses controlXYShared for persistence (localStorage pattern matching shared.js)
 */
function initializeLauncher(uid, container, slots, totalBanks) {
  // Use shared module for state management
  if (!shared.state.initialized) {
    console.warn("[controlXY] Shared state not initialized, launcher will not persist");
    // Initialize with current project if possible
    const project = shared.getProjectName();
    if (project && project !== "unknown_project") {
      shared.init(project);
    }
  }
  
  // Get or create launcher state using shared module
  const launcherData = shared.getOrCreateLauncher(uid, {
    currentBank: 0,
    mode: 'preset',
    tween: true,
    visible: true,
    banks: Array(totalBanks).fill(null).map((_, i) => ({
      name: `Bank ${i + 1}`,
      slots: Array(slots).fill(null)
    }))
  });
  
  // Use launcherData as the state reference
  const state = launcherData;
  
  // ====== PATCH: Ensure banks array has correct length ======
  while (state.banks.length < totalBanks) {
    state.banks.push({
      name: `Bank ${state.banks.length + 1}`,
      slots: Array(slots).fill(null)
    });
  }
  
  // Ensure each bank has correct number of slots
  state.banks.forEach(bank => {
    while ((bank.slots?.length || 0) < slots) {
      bank.slots = bank.slots || [];
      bank.slots.push(null);
    }
  });
  // ====== END PATCH ======
  
  // Store uid on container for event lookup
  container.dataset.uid = uid;
  
  // Get sequence list for sequence mode
  function getSequenceList() {
    return shared.listSequences();
  }
  
  // Helper to save current launcher state
  function saveLauncherState() {
    shared.saveLauncher(uid, state);
  }
  
  // Render current bank
  function renderBank() {
    const bank = state.banks[state.currentBank];
    const bankLabel = container.querySelector('.bank-name');
    const bankCount = container.querySelector('.bank-count');
    const buttons = container.querySelectorAll('.controlxy-launcher-slot');
    const modeBtn = container.querySelector('.controlxy-launcher-mode-btn');
    const tweenBtn = container.querySelector('.controlxy-launcher-tween-btn');
    
    // Update mode button
    if (state.mode === 'sequence') {
      modeBtn.textContent = 'S';
      modeBtn.classList.add('sequence-mode');
      modeBtn.title = 'Sequence Mode (click for Preset mode)';
    } else {
      modeBtn.textContent = 'P';
      modeBtn.classList.remove('sequence-mode');
      modeBtn.title = 'Preset Mode (click for Sequence mode)';
    }
    
    // Update tween button
    if (state.tween) {
      tweenBtn.classList.add('active');
      tweenBtn.title = 'Tween ON (click to Jump)';
    } else {
      tweenBtn.classList.remove('active');
      tweenBtn.title = 'Jump (click for Tween)';
    }
    
    bankLabel.textContent = bank.name;
    bankCount.textContent = `(${state.currentBank + 1}/${totalBanks})`;
    
    // Render based on mode
    if (state.mode === 'sequence') {
      // Sequence mode: auto-fill from sequence list
      const sequences = getSequenceList();
      const startIndex = state.currentBank * slots;
      
      buttons.forEach((btn, i) => {
        const slotLabel = btn.querySelector('.slot-label');
        const seqIndex = startIndex + i;
        
        if (seqIndex < sequences.length) {
          const seqName = sequences[seqIndex];
          btn.classList.add('assigned', 'type-sequence');
          btn.classList.remove('empty');
          btn.dataset.type = 'sequence';
          btn.dataset.name = seqName;
          slotLabel.textContent = seqName;
        } else {
          btn.classList.remove('assigned', 'type-sequence');
          btn.classList.add('empty');
          slotLabel.textContent = 'Empty';
          delete btn.dataset.type;
          delete btn.dataset.name;
        }
      });
    } else {
      // Preset mode: use saved slots
      buttons.forEach((btn, i) => {
        const slot = bank.slots[i];
        const slotLabel = btn.querySelector('.slot-label');
        
        if (slot) {
          btn.classList.add('assigned');
          btn.classList.remove('empty');
          btn.dataset.type = slot.type;
          btn.dataset.name = slot.name;
          slotLabel.textContent = slot.name;
          
          // Set color based on type
          if (slot.type === 'sequence') {
            btn.classList.add('type-sequence');
          } else {
            btn.classList.remove('type-sequence');
          }
        } else {
          btn.classList.remove('assigned', 'type-sequence');
          btn.classList.add('empty');
          slotLabel.textContent = 'Empty';
          delete btn.dataset.type;
          delete btn.dataset.name;
        }
      });
    }
  }
  
  // Bank navigation
  container.querySelector('[data-action="prev"]').addEventListener('click', (e) => {
    e.stopPropagation();
    state.currentBank = (state.currentBank - 1 + totalBanks) % totalBanks;
    renderBank();
    saveLauncherState();
  });
  
  container.querySelector('[data-action="next"]').addEventListener('click', (e) => {
    e.stopPropagation();
    state.currentBank = (state.currentBank + 1) % totalBanks;
    renderBank();
    saveLauncherState();
  });
  
  // Mode toggle (Preset/Sequence)
  container.querySelector('.controlxy-launcher-mode-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.mode = state.mode === 'preset' ? 'sequence' : 'preset';
    renderBank();
    saveLauncherState();
  });
  
  // Tween toggle
  container.querySelector('.controlxy-launcher-tween-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.tween = !state.tween;
    renderBank();
    saveLauncherState();
  });
  
  // Settings/Preset Manager button
  container.querySelector('.controlxy-launcher-settings-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.controlXYPresetUI?.toggle();
  });
  
  // Slot button handlers
  container.querySelectorAll('.controlxy-launcher-slot').forEach(btn => {
    // Left click: Recall
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Get name from dataset (works for both modes)
      const name = btn.dataset.name;
      const type = btn.dataset.type;
      
      if (!name) return;
      
      // Highlight active button
      container.querySelectorAll('.controlxy-launcher-slot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Determine duration based on tween state
      const dur = state.tween ? 1 : 0;
      
      // Recall preset or play sequence
      if (type === 'preset') {
        window.controlXYPresets?.recall(name, { dur, ease: 'easeInOutSine' });
      } else if (type === 'sequence') {
        // Don't pass loop - let it use the stored sequence loop state
        window.controlXYPresets?.playSequence(name, { dur });
      }
      
      // Remove active state after animation
      setTimeout(() => btn.classList.remove('active'), 300);
    });
    
    // Right click: Store current state
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const slotIndex = parseInt(btn.dataset.slot);
      const slotName = prompt('Save current state as:', `slot_${state.currentBank + 1}_${slotIndex + 1}`);
      
      if (!slotName) return;
      
      // Save current state
      window.controlXYPresets?.save(slotName);
      
      // Assign to slot
      state.banks[state.currentBank].slots[slotIndex] = {
        type: 'preset',
        name: slotName
      };
      
      renderBank();
      saveLauncherState();
    });
    
    // Long press (touch): Store current state
    let pressTimer;
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // Only left button
      
      pressTimer = setTimeout(() => {
        // Trigger right-click behavior
        const contextEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        btn.dispatchEvent(contextEvent);
      }, 500);
    });
    
    btn.addEventListener('pointerup', () => {
      clearTimeout(pressTimer);
    });
    
    btn.addEventListener('pointercancel', () => {
      clearTimeout(pressTimer);
    });
  });
  
  // Initial render
  renderBank();
  
  // ====== PATCH: Listen for external refresh requests ======
  const refreshHandler = (event) => {
    const { uid: targetUid } = event.detail || {};
    // Refresh if this launcher matches or if no specific uid given
    if (!targetUid || targetUid === uid) {
      // Re-read state from shared module
      const launcher = shared.getLauncher(uid);
      const updatedState = launcher?.data;
      if (updatedState) {
        // Update local state reference - merge banks properly
        state.currentBank = updatedState.currentBank ?? state.currentBank;
        state.mode = updatedState.mode ?? state.mode;
        state.tween = updatedState.tween ?? state.tween;
        state.visible = updatedState.visible ?? state.visible;
        if (updatedState.banks) {
          state.banks = updatedState.banks;
        }
      }
      renderBank();
    }
  };
  
  window.addEventListener('controlxy:launcherRefresh', refreshHandler);
  
  // ====== PATCH: Listen for presets loaded ======
  // This handles the case where launcher initializes before data finish loading
  const loadedHandler = (event) => {
    console.log(`[controlXY] Data loaded, refreshing launcher ${uid}`);
    // Re-read state from shared module after data is loaded
    const launcher = shared.getLauncher(uid);
    const loadedState = launcher?.data;
    if (loadedState) {
      // Merge loaded state into current state
      state.currentBank = loadedState.currentBank ?? state.currentBank;
      state.mode = loadedState.mode ?? state.mode;
      state.tween = loadedState.tween ?? state.tween;
      state.visible = loadedState.visible ?? state.visible;
      if (loadedState.banks && loadedState.banks.length > 0) {
        // Only use loaded banks if they have actual data
        state.banks = loadedState.banks;
        // Ensure slot arrays are correct length
        state.banks.forEach(bank => {
          while ((bank.slots?.length || 0) < slots) {
            bank.slots = bank.slots || [];
            bank.slots.push(null);
          }
        });
      }
      renderBank();
      
      // Update visibility
      if (!state.visible) {
        const launcherFO = container.closest('.controlxy-launcher-container');
        if (launcherFO) {
          launcherFO.style.display = 'none';
        }
      }
    }
  };
  
  window.addEventListener('controlxy:loaded', loadedHandler);
  // ====== END PATCH ======
  
  // Store cleanup function for potential future use
  container._launcherCleanup = () => {
    window.removeEventListener('controlxy:launcherRefresh', refreshHandler);
    window.removeEventListener('controlxy:loaded', loadedHandler);
  };
  
  // Apply saved visibility state - hide entire launcher if needed
  if (!state.visible) {
    const launcherFO = container.closest('.controlxy-launcher-container');
    if (launcherFO) {
      launcherFO.style.display = 'none';
    }
  }
}

/**
 * Global functions to show/hide launchers
 */
window.controlXYLauncher = {
  show: (uid) => {
    const launcher = document.querySelector(`.controlxy-launcher[data-uid="${uid}"]`);
    if (launcher) {
      const launcherFO = launcher.closest('.controlxy-launcher-container');
      if (launcherFO) {
        launcherFO.style.display = 'block';
        // Update state via shared module
        const launcherItem = shared.getLauncher(uid);
        if (launcherItem?.data) {
          launcherItem.data.visible = true;
          shared.saveLauncher(uid, launcherItem.data);
        }
      }
    }
  },
  hide: (uid) => {
    const launcher = document.querySelector(`.controlxy-launcher[data-uid="${uid}"]`);
    if (launcher) {
      const launcherFO = launcher.closest('.controlxy-launcher-container');
      if (launcherFO) {
        launcherFO.style.display = 'none';
        // Update state via shared module
        const launcherItem = shared.getLauncher(uid);
        if (launcherItem?.data) {
          launcherItem.data.visible = false;
          shared.saveLauncher(uid, launcherItem.data);
        }
      }
    }
  },
  toggle: (uid) => {
    const launcher = document.querySelector(`.controlxy-launcher[data-uid="${uid}"]`);
    if (launcher) {
      const launcherFO = launcher.closest('.controlxy-launcher-container');
      if (launcherFO) {
        const isVisible = launcherFO.style.display !== 'none';
        if (isVisible) {
          window.controlXYLauncher.hide(uid);
        } else {
          window.controlXYLauncher.show(uid);
        }
      }
    }
  }
};

export function handleControlXYSequenceCue(ast) {
  const api = window.controlXYPresets;
  if (!api) return;

  const args = {};
  for (const a of ast.args || []) args[a.key || a.type] = a.value;

  const seq = args.seq || args.sequence;
  if (!seq) return;

  const options = {};
  if (args.dur !== undefined) options.dur = args.dur;
  if (args.ease !== undefined) options.ease = args.ease;
  if (args.loop !== undefined) options.loop = args.loop;

  api.playSequence(seq, options);
}


export function handleControlXYSequenceStopCue() {
  window.controlXYPresets?.stopSequence();
}


export function handleControlXYSaveCue(ast) {
  const api = window.controlXYPresets;
  if (!api) return;

  const args = {};
  for (const a of ast.args || []) args[a.key || a.type] = a.value;

  const preset = args.preset;
  if (!preset) {
    console.warn("[controlXYSave] missing preset");
    return;
  }

  api.save(preset, args.uid);
}
