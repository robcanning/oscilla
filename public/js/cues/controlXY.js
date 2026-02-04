/*!
 * oscillaControlXY.js — Multitouch XY Control Pad
 * Part of oscillaScore control plane
 * © 2025 Rob Canning — GPLv3
 *
 * controlXY(...) defines a persistent, multitouch control surface.
 * Multiple handles can be constrained to a bounding shape and each
 * continuously publishes normalized X/Y values (0..1, up = 1).
 *
 * NEW FEATURES:
 *   - Sequence transport controls in launcher bar (▶/■)
 *   - Glow/pulsate effect when handles are touched
 *   - Mute/manual override: click handle to show toggle overlay
 */

import { publish } from "../control/paramBinding.js";
import { sendOSCMessage, createOscOverlay } from "./osc.js";
import * as shared from "../control/controlXYShared.js";

// ============================================================================
// Global muted handles set - handles in this set ignore automation updates
// ============================================================================
const mutedHandles = new Set();

/**
 * Check if a handle is muted (in manual override mode)
 */
export function isHandleMuted(uid, handleId) {
  return mutedHandles.has(`${uid}:${handleId}`);
}

/**
 * Set mute state for a handle
 */
export function setHandleMuted(uid, handleId, muted) {
  const key = `${uid}:${handleId}`;
  if (muted) {
    mutedHandles.add(key);
  } else {
    mutedHandles.delete(key);
  }
  window.dispatchEvent(new CustomEvent('controlxy:handleMuteChanged', {
    detail: { uid, handleId, muted }
  }));
}

/**
 * Toggle mute state for a handle
 */
export function toggleHandleMuted(uid, handleId) {
  const key = `${uid}:${handleId}`;
  const newState = !mutedHandles.has(key);
  setHandleMuted(uid, handleId, newState);
  return newState;
}

/**
 * Get all muted handles
 */
export function getMutedHandles() {
  return Array.from(mutedHandles);
}

/**
 * Clear all muted handles
 */
export function clearAllMutes() {
  mutedHandles.clear();
  window.dispatchEvent(new CustomEvent('controlxy:allMutesCleared'));
}

// Expose mute API globally
window.controlXYMute = {
  isHandleMuted,
  setHandleMuted,
  toggleHandleMuted,
  getMutedHandles,
  clearAllMutes
};

/**
 * handleControlXYCue()
 */
export function handleControlXYCue(el, args = [], options = {}) {
  console.log("[controlXY] called...");

  // Parse args
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

  // Resolve bounds element
  const svg = el.ownerSVGElement;
  if (!svg) {
    console.warn("[controlXY] No parent SVG found");
    return;
  }

  let boundsEl;
  const boundsId = cfg.bounds;
  
  if (!boundsId || boundsId === "self") {
    boundsEl = el;
  } else {
    boundsEl = svg.getElementById(boundsId);
    if (!boundsEl) {
      console.warn("[controlXY] bounds element not found:", boundsId);
      return;
    }
  }

  // Parse handles
  let handleIds = cfg.handle;
  if (!handleIds) {
    console.warn("[controlXY] Missing handle parameter");
    return;
  }
  if (!Array.isArray(handleIds)) {
    handleIds = [handleIds];
  }

  const handleEls = handleIds.map(id => {
    const handleEl = svg.getElementById(id);
    if (!handleEl) {
      console.warn(`[controlXY] handle element not found: ${id}`);
      return null;
    }
    return { id, el: handleEl };
  }).filter(Boolean);

  if (handleEls.length === 0) {
    console.warn("[controlXY] No valid handles found");
    return;
  }

  // Parse options
  const showLabels = cfg.label === true || cfg.label === "true";
  const oscEnabled = cfg.osc !== false && cfg.osc !== "false";
  const oscThrottle = typeof cfg.osc === "number" ? cfg.osc : 30;
  const oscAddr = cfg.oscAddr || `controlXY/${uid}`;
  const launcherEnabled = cfg.launcher !== false && cfg.launcher !== "false";
  const launcherSlots = typeof cfg.launcher === "number" ? cfg.launcher : 8;
  const launcherBanks = typeof cfg.banks === "number" ? cfg.banks : 3;

  const bbox = boundsEl.getBBox();
  const parent = boundsEl.parentNode;

  let launcherElement = null;
  if (launcherEnabled) {
    launcherElement = createLauncher(uid, bbox, launcherSlots, launcherBanks, parent);
  }

  // Helper functions
  function svgPointFromEvent(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    if (!ctm) return { x: pt.x, y: pt.y };
    return pt.matrixTransform(ctm);
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function createLabel(handleEl) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "controlxy-label");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "auto");
    label.setAttribute("font-family", "monospace");
    label.setAttribute("font-size", "12");
    label.setAttribute("fill", "#000");
    label.setAttribute("pointer-events", "none");
    label.textContent = "0.50, 0.50";
    handleEl.parentNode.insertBefore(label, handleEl.nextSibling);
    return label;
  }

  function updateLabel(label, handleEl, normX, normY, offsetX, offsetY) {
    if (!label) return;
    const hbox = handleEl.getBBox();
    const labelX = hbox.x + hbox.width / 2 + offsetX;
    const labelY = hbox.y + offsetY - 8;
    label.setAttribute("x", labelX);
    label.setAttribute("y", labelY);
    label.textContent = `${normX.toFixed(2)}, ${normY.toFixed(2)}`;
  }

  let lastTouchedHandle = null;

  // Per-handle state
  const handles = handleEls.map(({ id, el: handleEl }, index) => {
    const originalTransform = handleEl.getAttribute("transform") || "";
    handleEl.removeAttribute("transform");
    
    const hbbox = handleEl.getBBox();
    const originalCenterX = hbbox.x + hbbox.width / 2;
    const originalCenterY = hbbox.y + hbbox.height / 2;
    
    if (originalTransform) {
      handleEl.setAttribute("transform", originalTransform);
    }

    let curX = bbox.x + bbox.width / 2;
    let curY = bbox.y + bbox.height / 2;
    const label = showLabels ? createLabel(handleEl) : null;
    let offsetX = curX - originalCenterX;
    let offsetY = curY - originalCenterY;

    handleEl.setAttribute("transform", `translate(${offsetX}, ${offsetY})`);
    handleEl.style.pointerEvents = "auto";
    handleEl.style.cursor = "grab";
    handleEl.style.touchAction = "none";
    handleEl.classList.add("controlxy-handle");
    handleEl.dataset.controlxyUid = uid;
    handleEl.dataset.controlxyHandle = id;
    handleEl.parentNode.appendChild(handleEl);

    if (label) {
      updateLabel(label, handleEl, 0.5, 0.5, offsetX, offsetY);
    }

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
      pointerId: null,
      dragging: false,
      lastOscSent: 0,
      muteOverlay: null,
      muteOverlayTimer: null,
      showOverlayTimer: null
    };
  });

  // Emit values
  function emit(handle) {
    const normX = clamp((handle.curX - bbox.x) / bbox.width, 0, 1);
    const normY = clamp(1 - (handle.curY - bbox.y) / bbox.height, 0, 1);

    publish("controlXY", uid, {
      handle: handle.id,
      x: normX,
      y: normY,
      [`${handle.id}.x`]: normX,
      [`${handle.id}.y`]: normY
    });

    if (handle.label) {
      updateLabel(handle.label, handle.el, normX, normY, handle.offsetX, handle.offsetY);
    }

    if (oscEnabled) {
      const now = performance.now();
      if (now - handle.lastOscSent >= oscThrottle) {
        handle.lastOscSent = now;
        const addr = handles.length > 1 ? `${oscAddr}/${handle.id}` : oscAddr;
        sendOSCMessage?.({
          type: "osc_value",
          addr: addr,
          args: [normX, normY],
          timestamp: Date.now()
        });
      }
    }
  }

  function applyPosition(handle, targetX, targetY) {
    handle.curX = clamp(targetX, bbox.x, bbox.x + bbox.width);
    handle.curY = clamp(targetY, bbox.y, bbox.y + bbox.height);
    handle.offsetX = handle.curX - handle.originalCenterX;
    handle.offsetY = handle.curY - handle.originalCenterY;
    handle.el.setAttribute("transform", `translate(${handle.offsetX}, ${handle.offsetY})`);
  }

  function findHandleByPointerId(pointerId) {
    return handles.find(h => h.pointerId === pointerId);
  }

  function findNearestFreeHandle(svgPt) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const h of handles) {
      if (h.dragging) continue;
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
  // Mute overlay functions
  // ---------------------------------------------
  function showMuteOverlay(handle) {
    hideMuteOverlay(handle);
    
    const hbbox = handle.el.getBBox();
    const overlaySize = 24;
    const isMuted = isHandleMuted(uid, handle.id);
    
    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
    overlay.classList.add("controlxy-mute-overlay");
    overlay.style.cursor = "pointer";
    
    const overlayX = hbbox.x + hbbox.width / 2 + handle.offsetX + 18;
    const overlayY = hbbox.y + hbbox.height / 2 + handle.offsetY - 18;
    overlay.setAttribute("transform", `translate(${overlayX}, ${overlayY})`);
    
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bg.setAttribute("cx", 0);
    bg.setAttribute("cy", 0);
    bg.setAttribute("r", overlaySize / 2);
    bg.setAttribute("fill", isMuted ? "#ff6b6b" : "#4ecdc4");
    bg.setAttribute("stroke", "#fff");
    bg.setAttribute("stroke-width", "2");
    bg.classList.add("controlxy-mute-overlay-bg");
    overlay.appendChild(bg);
    
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "text");
    icon.setAttribute("x", 0);
    icon.setAttribute("y", 1);
    icon.setAttribute("text-anchor", "middle");
    icon.setAttribute("dominant-baseline", "middle");
    icon.setAttribute("font-size", "11");
    icon.setAttribute("font-weight", "bold");
    icon.setAttribute("fill", "#fff");
    icon.setAttribute("pointer-events", "none");
    icon.textContent = isMuted ? "M" : "A";
    overlay.appendChild(icon);
    
    overlay.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const newMuted = toggleHandleMuted(uid, handle.id);
      bg.setAttribute("fill", newMuted ? "#ff6b6b" : "#4ecdc4");
      icon.textContent = newMuted ? "M" : "A";
      
      if (newMuted) {
        handle.el.classList.add("controlxy-handle--muted");
      } else {
        handle.el.classList.remove("controlxy-handle--muted");
      }
      
      clearTimeout(handle.muteOverlayTimer);
      handle.muteOverlayTimer = setTimeout(() => hideMuteOverlay(handle), 2000);
    });
    
    handle.el.parentNode.appendChild(overlay);
    handle.muteOverlay = overlay;
    
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.15s ease-out";
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });
    
    handle.muteOverlayTimer = setTimeout(() => hideMuteOverlay(handle), 2000);
  }
  
  function hideMuteOverlay(handle) {
    if (handle.muteOverlay) {
      handle.muteOverlay.style.opacity = "0";
      const overlay = handle.muteOverlay;
      setTimeout(() => overlay?.remove(), 150);
      handle.muteOverlay = null;
    }
    clearTimeout(handle.muteOverlayTimer);
  }

  // ---------------------------------------------
  // Pointer events
  // ---------------------------------------------
  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();

    const svgPt = svgPointFromEvent(e);
    let targetHandle = null;
    
    for (const h of handles) {
      if (h.el === e.target || h.el.contains(e.target)) {
        targetHandle = h;
        break;
      }
    }

    if (!targetHandle) {
      targetHandle = findNearestFreeHandle(svgPt);
    }

    if (!targetHandle || targetHandle.dragging) return;

    // Show mute overlay after brief delay (not during drag start)
    clearTimeout(targetHandle.showOverlayTimer);
    targetHandle.showOverlayTimer = setTimeout(() => {
      if (!targetHandle.dragging) {
        showMuteOverlay(targetHandle);
      }
    }, 250);

    targetHandle.dragging = true;
    targetHandle.pointerId = e.pointerId;
    targetHandle.el.setPointerCapture?.(e.pointerId);
    targetHandle.el.classList.add("controlxy-handle--active");
    
    if (targetHandle.label) {
      targetHandle.label.classList.add("dragging");
    }
    
    if (lastTouchedHandle && lastTouchedHandle !== targetHandle && lastTouchedHandle.label) {
      lastTouchedHandle.label.classList.remove("last-touched");
    }
    lastTouchedHandle = targetHandle;
    
    applyPosition(targetHandle, svgPt.x, svgPt.y);
    emit(targetHandle);
  }

  function onPointerMove(e) {
    const handle = findHandleByPointerId(e.pointerId);
    if (!handle || !handle.dragging) return;
    
    // Cancel mute overlay show if dragging
    clearTimeout(handle.showOverlayTimer);

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
    handle.el.classList.remove("controlxy-handle--active");
    
    if (handle.label) {
      handle.label.classList.remove("dragging");
      handle.label.classList.add("last-touched");
    }
  }

  function onPointerCancel(e) {
    onPointerUp(e);
  }

  // Register events
  for (const handle of handles) {
    handle.el.addEventListener("pointerdown", onPointerDown);
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

  // Prevent score dragging
  const preventScoreDrag = (e) => {
    e.stopPropagation();
    if (e.type === 'pointerdown' || e.type === 'mousedown' || e.type === 'touchstart') {
      e.preventDefault();
    }
  };

  boundsEl.addEventListener("pointerdown", preventScoreDrag, true);
  boundsEl.addEventListener("mousedown", preventScoreDrag, true);
  boundsEl.addEventListener("touchstart", preventScoreDrag, { passive: false, capture: true });

  // Global move/up handlers
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);

  // Initial emit
  for (const handle of handles) {
    emit(handle);
  }

  // ---------------------------------------------
  // External position updates (presets, tweening)
  // Respects mute state!
  // ---------------------------------------------
  function setPosition(handleId, normX, normY) {
    // Check if handle is muted
    if (isHandleMuted(uid, handleId)) {
      console.log(`[controlXY] Handle ${handleId} is muted, ignoring automation`);
      return;
    }
    
    const handle = handles.find(h => h.id === handleId);
    if (!handle) return;
    
    const targetX = bbox.x + normX * bbox.width;
    const targetY = bbox.y + (1 - normY) * bbox.height;
    
    applyPosition(handle, targetX, targetY);
    emit(handle);
  }

  function captureState() {
    const state = {};
    for (const handle of handles) {
      const normX = clamp((handle.curX - bbox.x) / bbox.width, 0, 1);
      const normY = clamp(1 - (handle.curY - bbox.y) / bbox.height, 0, 1);
      state[handle.id] = { x: normX, y: normY };
    }
    return state;
  }

  function applyPositions(positions, options = {}) {
    for (const [handleId, pos] of Object.entries(positions)) {
      // Check mute state
      if (isHandleMuted(uid, handleId)) {
        console.log(`[controlXY] Handle ${handleId} is muted, skipping`);
        continue;
      }
      setPosition(handleId, pos.x, pos.y);
    }
  }

  // Register pad
  window._controlXYPads = window._controlXYPads || {};
  window._controlXYPads[uid] = {
    uid,
    handles: handles.map(h => h.id),
    setPosition,
    captureState,
    applyPositions,
    getBounds: () => bbox
  };

  // Cleanup function
  function cleanup() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    
    for (const handle of handles) {
      handle.el.removeEventListener("pointerdown", onPointerDown);
      handle.label?.remove();
      hideMuteOverlay(handle);
    }

    if (launcherElement && launcherElement.parentNode) {
      launcherElement.parentNode.removeChild(launcherElement);
    }
    
    delete window._controlXYPads[uid];
  }

  return { cleanup, uid, handles, setPosition, captureState, applyPositions };
}

// ============================================================================
// LAUNCHER with Sequence Transport Controls
// ============================================================================

function createLauncher(uid, bbox, slots, totalBanks, parent) {
  const buttonHeight = 44;
  const buttonSpacing = 5;
  const bankBarHeight = 34;
  const padding = 8;
  const totalHeight = buttonHeight + buttonSpacing + bankBarHeight + padding;
  
  const launcherY = bbox.y + bbox.height + 8;
  
  const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
  fo.setAttribute("x", bbox.x);
  fo.setAttribute("y", launcherY);
  fo.setAttribute("width", bbox.width);
  fo.setAttribute("height", totalHeight);
  fo.classList.add("controlxy-launcher-container");
  fo.style.overflow = "visible";
  
  const container = document.createElement("div");
  container.className = "controlxy-launcher";
  container.dataset.uid = uid;
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.overflow = "visible";
  container.style.boxSizing = "border-box";
  
  // Button row
  const buttonRow = document.createElement("div");
  buttonRow.className = "controlxy-launcher-buttons";
  
  for (let i = 0; i < slots; i++) {
    const btn = document.createElement("button");
    btn.className = "controlxy-launcher-slot";
    btn.dataset.slot = i;
    btn.innerHTML = `<span class="slot-number">${i + 1}</span><span class="slot-label">Empty</span>`;
    btn.title = "Left-click: Recall | Long-press: Store current";
    buttonRow.appendChild(btn);
  }
  
  container.appendChild(buttonRow);
  
  // Bank bar with sequence transport
  const bankBar = document.createElement("div");
  bankBar.className = "controlxy-launcher-bank-bar";
  bankBar.innerHTML = `
    <button class="controlxy-launcher-seq-play" data-action="seq-play" title="Play Sequence">▶</button>
    <button class="controlxy-launcher-seq-stop" data-action="seq-stop" title="Stop Sequence">■</button>
    <span class="controlxy-launcher-seq-status"></span>
    <span class="controlxy-launcher-spacer"></span>
    <button class="controlxy-launcher-bank-btn" data-action="prev" title="Previous Bank">←</button>
    <span class="controlxy-launcher-bank-label">
      <span class="bank-name">Bank 1</span>
      <span class="bank-count">(1/${totalBanks})</span>
    </span>
    <button class="controlxy-launcher-bank-btn" data-action="next" title="Next Bank">→</button>
    <button class="controlxy-launcher-mode-btn" data-mode="preset" title="Toggle Preset/Sequence Mode">P</button>
    <button class="controlxy-launcher-tween-btn active" data-tween="true" title="Toggle Tween/Jump">~</button>
    <button class="controlxy-launcher-settings-btn" title="Open Preset Manager">⚙</button>
  `;
  container.appendChild(bankBar);
  
  fo.appendChild(container);
  parent.appendChild(fo);
  
  initializeLauncher(uid, container, slots, totalBanks);
  
  return fo;
}

function initializeLauncher(uid, container, slots, totalBanks) {
  if (!shared.state.initialized) {
    const project = shared.getProjectName();
    if (project && project !== "unknown_project") {
      shared.init(project);
    }
  }
  
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
  
  const state = launcherData;
  
  while (state.banks.length < totalBanks) {
    state.banks.push({
      name: `Bank ${state.banks.length + 1}`,
      slots: Array(slots).fill(null)
    });
  }
  
  state.banks.forEach(bank => {
    while ((bank.slots?.length || 0) < slots) {
      bank.slots = bank.slots || [];
      bank.slots.push(null);
    }
  });
  
  container.dataset.uid = uid;
  
  function getSequenceList() {
    return shared.listSequences();
  }
  
  function saveLauncherState() {
    shared.saveLauncher(uid, state);
  }
  
  // Sequence status element
  const seqStatus = container.querySelector('.controlxy-launcher-seq-status');
  const seqPlayBtn = container.querySelector('.controlxy-launcher-seq-play');
  const seqStopBtn = container.querySelector('.controlxy-launcher-seq-stop');
  
  // Update sequence status display
  function updateSeqStatus() {
    const active = window.controlXYPresets?.getActiveSequence?.();
    if (active && active.running) {
      seqStatus.textContent = `▶ ${active.name}`;
      seqStatus.classList.add('active');
      seqPlayBtn.classList.add('playing');
      seqStopBtn.classList.add('active');
    } else {
      seqStatus.textContent = '';
      seqStatus.classList.remove('active');
      seqPlayBtn.classList.remove('playing');
      seqStopBtn.classList.remove('active');
    }
  }
  
  // Listen for sequence events
  window.addEventListener('controlxy:sequenceStarted', updateSeqStatus);
  window.addEventListener('controlxy:sequenceStopped', updateSeqStatus);
  window.addEventListener('controlxy:sequenceStep', updateSeqStatus);
  
  // Initial status update
  setTimeout(updateSeqStatus, 100);
  
  function renderBank() {
    const bank = state.banks[state.currentBank];
    const bankLabel = container.querySelector('.bank-name');
    const bankCount = container.querySelector('.bank-count');
    const buttons = container.querySelectorAll('.controlxy-launcher-slot');
    const modeBtn = container.querySelector('.controlxy-launcher-mode-btn');
    const tweenBtn = container.querySelector('.controlxy-launcher-tween-btn');
    
    if (state.mode === 'sequence') {
      modeBtn.textContent = 'S';
      modeBtn.classList.add('sequence-mode');
      modeBtn.title = 'Sequence Mode (click for Preset mode)';
    } else {
      modeBtn.textContent = 'P';
      modeBtn.classList.remove('sequence-mode');
      modeBtn.title = 'Preset Mode (click for Sequence mode)';
    }
    
    if (state.tween) {
      tweenBtn.classList.add('active');
      tweenBtn.title = 'Tween ON (click to Jump)';
    } else {
      tweenBtn.classList.remove('active');
      tweenBtn.title = 'Jump (click for Tween)';
    }
    
    bankLabel.textContent = bank.name;
    bankCount.textContent = `(${state.currentBank + 1}/${totalBanks})`;
    
    if (state.mode === 'sequence') {
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
      buttons.forEach((btn, i) => {
        const slot = bank.slots[i];
        const slotLabel = btn.querySelector('.slot-label');
        
        if (slot) {
          btn.classList.add('assigned');
          btn.classList.remove('empty');
          btn.dataset.type = slot.type;
          btn.dataset.name = slot.name;
          slotLabel.textContent = slot.name;
          
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
    
    updateSeqStatus();
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
  
  // Sequence transport controls
  seqPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const active = window.controlXYPresets?.getActiveSequence?.();
    if (active && active.running) {
      // Already playing - could toggle pause here if supported
    } else {
      // Try to play last used sequence or first available
      const sequences = getSequenceList();
      if (sequences.length > 0) {
        const seqName = sequences[0];
        window.controlXYPresets?.playSequence(seqName, {
          dur: state.tween ? 1 : 0
        });
      }
    }
    updateSeqStatus();
  });
  
  seqStopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.controlXYPresets?.stopSequence?.();
    updateSeqStatus();
  });
  
  // Mode toggle
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
  
  // Settings
  container.querySelector('.controlxy-launcher-settings-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.controlXYPresetUI?.toggle();
  });
  
  // Slot buttons
  container.querySelectorAll('.controlxy-launcher-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const name = btn.dataset.name;
      const type = btn.dataset.type;
      
      if (!name) return;
      
      container.querySelectorAll('.controlxy-launcher-slot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const dur = state.tween ? 1 : 0;
      
      if (type === 'preset') {
        window.controlXYPresets?.recall(name, { dur, ease: 'easeInOutSine' });
      } else if (type === 'sequence') {
        window.controlXYPresets?.playSequence(name, { dur });
      }
      
      setTimeout(() => btn.classList.remove('active'), 300);
      updateSeqStatus();
    });
    
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const slotIndex = parseInt(btn.dataset.slot);
      const slotName = prompt('Save current state as:', `slot_${state.currentBank + 1}_${slotIndex + 1}`);
      
      if (!slotName) return;
      
      window.controlXYPresets?.save(slotName);
      
      state.banks[state.currentBank].slots[slotIndex] = {
        type: 'preset',
        name: slotName
      };
      
      renderBank();
      saveLauncherState();
    });
    
    let pressTimer;
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      
      pressTimer = setTimeout(() => {
        const contextEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        btn.dispatchEvent(contextEvent);
      }, 500);
    });
    
    btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
    btn.addEventListener('pointercancel', () => clearTimeout(pressTimer));
  });
  
  renderBank();
  
  // Refresh handlers
  const refreshHandler = (event) => {
    const { uid: targetUid } = event.detail || {};
    if (!targetUid || targetUid === uid) {
      const launcher = shared.getLauncher(uid);
      const updatedState = launcher?.data;
      if (updatedState) {
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
  
  const loadedHandler = (event) => {
    const launcher = shared.getLauncher(uid);
    const loadedState = launcher?.data;
    if (loadedState) {
      state.currentBank = loadedState.currentBank ?? state.currentBank;
      state.mode = loadedState.mode ?? state.mode;
      state.tween = loadedState.tween ?? state.tween;
      state.visible = loadedState.visible ?? state.visible;
      if (loadedState.banks && loadedState.banks.length > 0) {
        state.banks = loadedState.banks;
        state.banks.forEach(bank => {
          while ((bank.slots?.length || 0) < slots) {
            bank.slots = bank.slots || [];
            bank.slots.push(null);
          }
        });
      }
      renderBank();
    }
  };
  
  window.addEventListener('controlxy:loaded', loadedHandler);
}

export default handleControlXYCue;
