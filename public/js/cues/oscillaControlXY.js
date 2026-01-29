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

import { publish } from "../oscillaParamBinding.js";
import { sendOSCMessage, createOscOverlay } from "./oscillaOSC.js";

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
  // Config options
  // ---------------------------------------------
  const showLabels = cfg.label === true || cfg.label === "true";
  const oscEnabled = cfg.osc !== false && cfg.osc !== "false" && cfg.osc !== 0;
  const oscThrottle = typeof cfg.osc === "number" ? cfg.osc : 30;
  const oscAddr = cfg.oscAddr
    ? cfg.oscAddr.replace(/^\//, "")
    : `controlXY/${uid}`;

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
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#fff");
    label.setAttribute("stroke", "#000");
    label.setAttribute("stroke-width", "0.5");
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
  }

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
