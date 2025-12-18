// ========================================================================
// oscillaText.js — Slot-based text display with time-based soft eviction
// ========================================================================

/* ------------------------------------------------------------------------
   1) Core Helpers
-------------------------------------------------------------------------*/

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function unquote(v) {
  if (typeof v !== "string") return v;
  return v.replace(/^[`'"]+|[`'"]+$/g, "");
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * RAF-based wait that respects cancellation token
 */
function rafWait(ms, token) {
  return new Promise((resolve) => {
    if (token.cancel) return resolve();
    const end = performance.now() + ms;
    function loop(t) {
      if (token.cancel) return resolve();
      if (t >= end) return resolve();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
}


/* ------------------------------------------------------------------------
   2) Pause/Resume System
-------------------------------------------------------------------------*/

function initPauseToken(token) {
  if (!token) return;
  if (token.paused === undefined) token.paused = false;
  if (!token._resumeResolvers) token._resumeResolvers = [];
}

async function waitIfPaused(token) {
  if (!token) return;
  initPauseToken(token);
  if (!token.paused) return;
  await new Promise(resolve => {
    token._resumeResolvers.push(resolve);
  });
}

function resumeTextToken(token) {
  if (!token) return;
  initPauseToken(token);
  token.paused = false;
  while (token._resumeResolvers.length) {
    token._resumeResolvers.shift()();
  }
}

export function pauseAllCueTexts() {
  if (!window.activeCueTexts) return;
  for (const token of window.activeCueTexts.values()) {
    initPauseToken(token);
    token.paused = true;
  }
}

export function resumeAllCueTexts() {
  if (!window.activeCueTexts) return;
  for (const token of window.activeCueTexts.values()) {
    resumeTextToken(token);
  }
}


/* ------------------------------------------------------------------------
   3) Parameter Parsing
-------------------------------------------------------------------------*/

function parseCueTextParams(ast, cueElement) {
  const params = {};
  for (const p of (ast?.args || [])) {
    params[p.type] = p.value;
  }

  // Core fields
  const order = unquote(params.order || "seq");
  const mode = unquote(params.mode || "line");

  // Loop logic
  const loopRaw = (params.loop ?? (order === "rnd" ? "0" : "1"))
    .toString().trim().toLowerCase();
  const infinite = (loopRaw === "0" || loopRaw === "inf" || loopRaw === "infinite");
  const loopCount = infinite ? 0 : Math.max(1, parseInt(loopRaw, 10) || 1);

  // Timing
  const tdelay = Number(params.tdelay) || 0;
  const dur = Number(params.dur) || 2;
  // fadePercent: portion of durMs used for fade-in (0.4 = 40% of duration)
  const fadePercent = clamp(Number(params.fadePercent ?? 0.4), 0, 1);

  // Slot system
  const yslots = Math.max(1, Number(params.yslots) || 1);  // Always >= 1
  const yoffset = Number(params.yoffset ?? 100);
  const yslotmode = unquote(params.yslotmode || "sequence").toLowerCase();
  
  // Overlap: 0-1, controls how long layers persist beyond their base duration
  // 0 = layer starts fading immediately when next unit appears
  // 1 = layer persists for full additional duration (2x total lifespan)
  const overlap = clamp(Number(params.overlap ?? 0), 0, 1);

  // Prestate handling
  let prestate = "show";
  if (params.prestate != null) {
    if (typeof params.prestate === "object" && params.prestate.type === "func") {
      prestate = params.prestate;
    } else {
      prestate = unquote(String(params.prestate));
    }
  }

  return {
    rawParams: params,
    
    // Content
    content: unquote(params.src || params.content || ""),
    style: unquote(params.style || ""),
    
    // Target placement
    targetId: unquote(params.target || "self"),
    offsetX: Number(params.offsetX || 0),
    offsetY: Number(params.offsetY || 0),
    
    // Sequencing
    order,
    mode,
    infinite,
    loopCount,
    
    // Timing
    tdelay,
    dur,
    fadePercent,
    
    // Slot system
    yslots,
    yoffset,
    yslotmode,
    overlap,
    
    // Prestate
    prestate,
    
    // Identity
    cueUid: String(params.uid || cueElement?.id || `cueText_${unquote(params.target || "center")}`),
    persist: params.persist == 1,
  };
}


/* ------------------------------------------------------------------------
   4) Text Content Loading
-------------------------------------------------------------------------*/

function toUnitsFromText(str, mode) {
  if (!str) return [];
  
  if (mode === "word") {
    return str.split(/\s+/).filter(Boolean).map(tok => {
      const [text, durStr] = tok.split(":");
      return { text, dur: durStr ? Number(durStr) : null };
    });
  }
  
  if (mode === "char") {
    return str.split("").map(ch => ({ text: ch, dur: null }));
  }
  
  // Default: line mode
  return str.split(/[\r\n;]+/).filter(Boolean).map(line => {
    const [text, durStr] = line.split(":");
    return { text: text || line, dur: durStr ? Number(durStr) : null };
  });
}

async function loadCueTextUnits(content, mode) {
  if (/\.txt$/i.test(content)) {
    const baseTextDir =
      typeof window !== "undefined" && window.textDir
        ? window.textDir
        : typeof window !== "undefined" && window.sharedDir
          ? `${window.sharedDir}texts/`
          : "/texts/";
    const filePath = content.startsWith("/") ? content : `${baseTextDir}${content}`;
    
    try {
      const resp = await fetch(filePath);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.text();
      return toUnitsFromText(data, mode);
    } catch {
      return [{ text: `[Missing file: ${content}]`, dur: null }];
    }
  }
  return toUnitsFromText(content, mode);
}


/* ------------------------------------------------------------------------
   5) Slot System
-------------------------------------------------------------------------*/

/**
 * Initialize slot cycling state
 */
function initSlotState(yslots) {
  const centerIndex = Math.ceil(yslots / 2);
  return {
    index: centerIndex,
    dir: 1,
    order: []
  };
}

/**
 * Compute next slot index based on mode
 */
function computeNextSlot(slotState, yslots, yslotmode) {
  let next;
  const { index, dir, order } = slotState;
  
  switch (yslotmode) {
    case "singlestep":
      next = index + dir;
      if (next < 1 || next > yslots) {
        slotState.dir *= -1;
        next = index + slotState.dir;
      }
      break;
      
    case "random":
      next = 1 + Math.floor(Math.random() * yslots);
      break;
      
    case "shuffle":
      if (!order.length) {
        slotState.order = Array.from({ length: yslots }, (_, i) => i + 1);
        shuffleInPlace(slotState.order);
      }
      next = slotState.order.shift();
      break;
      
    case "sequence":
    default:
      next = index + 1;
      if (next > yslots) next = 1;
      break;
  }
  
  slotState.index = next;
  return next;
}

/**
 * Compute anchor box for slot positioning
 */
function computeSlotAnchor(parsed, cueElement) {
  if (parsed.targetId === "self" && cueElement) {
    return cueElement.getBoundingClientRect();
  }
  if (parsed.targetId && parsed.targetId !== "center") {
    const t = document.getElementById(parsed.targetId);
    if (t) return t.getBoundingClientRect();
  }
  return null; // Screen-center mode
}

/**
 * Position a layer in its slot
 */
function applySlotPosition(layer, slotIndex, params, anchorBox) {
  const { offsetX, offsetY, yoffset, yslots } = params;
  const centerIndex = (yslots + 1) / 2;
  const extraY = (slotIndex - centerIndex) * yoffset;

  if (anchorBox) {
    // Object-relative positioning
    layer.style.position = "absolute";
    layer.style.left = `${anchorBox.x + offsetX}px`;
    layer.style.top = `${anchorBox.y + offsetY + extraY}px`;
    layer.style.transform = "translate(0, 0)";
  } else {
    // Screen-center positioning
    layer.style.position = "fixed";
    layer.style.left = `calc(50% + ${offsetX}px)`;
    layer.style.top = `calc(50% + ${offsetY + extraY}px)`;
    layer.style.transform = "translate(-50%, -50%)";
  }
}


/* ------------------------------------------------------------------------
   6) Layer Management with Time-Based Auto-Eviction
   
   Architecture:
   - Each layer has a total lifespan = durMs + (overlap * durMs)
   - After durMs (when next unit starts), layer begins fading out
   - Fade-out duration = overlap * durMs
   - overlap=0: instant fade → 1 layer visible
   - overlap=0.5: 50% extra linger → ~1-2 layers visible  
   - overlap=1: 100% extra linger → up to all slots filled
   
   Timeline for overlap=0.5, durMs=1000:
   ─────────────────────────────────────────────────────
   Layer 1: [███████████|▓▓▓▓▓░]
                        ↑ fade starts at 1000ms
                              ↑ removed at 1500ms
   Layer 2:            [███████████|▓▓▓▓▓░]
   ─────────────────────────────────────────────────────
-------------------------------------------------------------------------*/

/**
 * Create a styled text layer
 */
function createTextLayer(text, uid, baseStyle) {
  const layer = document.createElement("div");
  layer.className = "cue-text-overlay";
  layer.dataset.uid = uid;
  layer.textContent = text;
  
  // Apply base styles first, then ensure transition starts as none
  layer.style.cssText = `
    position: fixed;
    background: transparent;
    color: white;
    z-index: 999999;
    font-size: 4em;
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 70vw;
    text-align: center;
    text-shadow: 0 0 10px rgba(0,0,0,0.7);
    pointer-events: auto;
    cursor: pointer;
    ${baseStyle}
  `;
  
  // Set these AFTER cssText to ensure they're not overridden
  layer.style.opacity = "0";
  layer.style.transition = "none";
  
  return layer;
}

/**
 * Schedule a layer for automatic eviction after its lifespan
 * 
 * @param {HTMLElement} layer - The layer to evict
 * @param {number} durMs - Base duration (time until fade starts)
 * @param {number} fadeOutMs - Fade-out duration
 * @param {Set} layerRegistry - Set to track active layers for cleanup
 */
function scheduleLayerEviction(layer, durMs, fadeOutMs, layerRegistry) {
  // Add to registry
  layerRegistry.add(layer);
  
  // After durMs: start fading out
  const fadeTimeout = setTimeout(() => {
    layer.style.pointerEvents = "none";
    layer.style.transition = `opacity ${fadeOutMs}ms ease`;
    layer.style.opacity = 0;
    
    // After fade completes: remove from DOM
    const removeTimeout = setTimeout(() => {
      layerRegistry.delete(layer);
      try { layer.remove(); } catch {}
    }, fadeOutMs + 50);
    
    // Store timeout for potential cleanup
    layer._removeTimeout = removeTimeout;
  }, durMs);
  
  // Store timeout for potential cleanup
  layer._fadeTimeout = fadeTimeout;
}

/**
 * Place text into a slot with automatic time-based eviction
 */
function placeTextInSlot({
  text,
  slotIndex,
  timing,
  position,
  anchorBox,
  layerRegistry,
  onClickHandler
}) {
  const { durMs, fadeMs, overlap, yslots } = timing;
  const { uid, yoffset, offsetX, offsetY, style } = position;
  
  // Create new layer
  const layer = createTextLayer(text, uid, style);
  layer.addEventListener("click", onClickHandler);
  
  // Position in slot
  applySlotPosition(layer, slotIndex, { offsetX, offsetY, yoffset, yslots }, anchorBox);
  
  // Add to DOM
  document.body.appendChild(layer);
  
  // --------------------------------------------------
  // Single-slot crossfade mode (yslots === 1)
  // --------------------------------------------------
  if (yslots === 1) {
    // For single slot: crossfade with existing layer
    // overlap controls crossfade duration (0 = instant switch, 1 = full fadeMs crossfade)
    const crossfadeMs = Math.max(50, Math.round(overlap * fadeMs));
    
    // Trigger fade-out on any existing layers in registry
    for (const existingLayer of layerRegistry) {
      existingLayer.style.pointerEvents = "none";
      existingLayer.style.setProperty('transition', `opacity ${crossfadeMs}ms ease-out`, 'important');
      existingLayer.style.setProperty('opacity', '0', 'important');
      
      // Clear existing timeouts
      if (existingLayer._fadeTimeout) clearTimeout(existingLayer._fadeTimeout);
      if (existingLayer._removeTimeout) clearTimeout(existingLayer._removeTimeout);
      
      // Schedule removal
      const layerToRemove = existingLayer;
      setTimeout(() => {
        layerRegistry.delete(layerToRemove);
        try { layerToRemove.remove(); } catch {}
      }, crossfadeMs + 50);
    }
    
    // Fade in new layer simultaneously
    console.log(`[cueText] crossfade: ${crossfadeMs}ms for "${text.substring(0, 20)}..."`);
    void layer.offsetHeight;
    layer.style.setProperty('transition', `opacity ${crossfadeMs}ms ease-in`, 'important');
    layer.style.setProperty('opacity', '1', 'important');
    
    // Register new layer
    layerRegistry.add(layer);
    
    // Schedule this layer's eviction (it will be crossfaded out when next layer arrives)
    // For single slot, we don't auto-evict - next placeTextInSlot call handles it
    // But we still need timeout cleanup if sequence ends
    const fadeTimeout = setTimeout(() => {
      // Only fade out if still in registry (not already replaced)
      if (layerRegistry.has(layer)) {
        layer.style.pointerEvents = "none";
        layer.style.setProperty('transition', `opacity ${fadeMs}ms ease-out`, 'important');
        layer.style.setProperty('opacity', '0', 'important');
        
        setTimeout(() => {
          layerRegistry.delete(layer);
          try { layer.remove(); } catch {}
        }, fadeMs + 50);
      }
    }, durMs);
    
    layer._fadeTimeout = fadeTimeout;
    
    return layer;
  }
  
  // --------------------------------------------------
  // Multi-slot mode (yslots > 1)
  // --------------------------------------------------
  
  // Fade in
  console.log(`[cueText] fade-in: ${fadeMs}ms for "${text.substring(0, 20)}..."`);
  void layer.offsetHeight;
  layer.style.setProperty('transition', `opacity ${fadeMs}ms ease-in`, 'important');
  layer.style.setProperty('opacity', '1', 'important');
  
  // Calculate lifespan and fade-out timing
  // 
  // Goal: overlap=1 should allow all yslots to be filled simultaneously
  // 
  // With yslots=3, overlap=1:
  //   - Layer 1 appears at t=0
  //   - Layer 2 appears at t=durMs  
  //   - Layer 3 appears at t=2*durMs
  //   - For all 3 to be visible, Layer 1 must survive until t=2*durMs
  //   - So total lifespan = durMs * yslots = 3*durMs
  //
  // Formula:
  //   lingerMs = overlap * durMs * (yslots - 1)
  //   totalLifespan = durMs + lingerMs
  //
  // overlap=0 → lingerMs=0, lifespan=durMs (only 1 visible)
  // overlap=0.5, yslots=3 → lingerMs=durMs, lifespan=2*durMs (~2 visible)
  // overlap=1, yslots=3 → lingerMs=2*durMs, lifespan=3*durMs (all 3 visible)
  
  const lingerMs = Math.round(overlap * durMs * (yslots - 1));
  const fadeOutMs = Math.max(50, lingerMs);
  
  // Schedule automatic eviction
  // Layer stays at full opacity for durMs, then fades out over fadeOutMs
  scheduleLayerEviction(layer, durMs, fadeOutMs, layerRegistry);
  
  return layer;
}

/**
 * Force-evict all layers in registry (for cleanup)
 */
function evictAllLayers(layerRegistry, fadeMs = 150) {
  for (const layer of layerRegistry) {
    // Clear pending timeouts
    if (layer._fadeTimeout) clearTimeout(layer._fadeTimeout);
    if (layer._removeTimeout) clearTimeout(layer._removeTimeout);
    
    // Immediate fade out
    layer.style.pointerEvents = "none";
    layer.style.transition = `opacity ${fadeMs}ms ease`;
    layer.style.opacity = 0;
    
    setTimeout(() => {
      try { layer.remove(); } catch {}
    }, fadeMs + 50);
  }
  layerRegistry.clear();
}


/* ------------------------------------------------------------------------
   7) Prestate Handling
   
   Supports: show, hide, ghost, fadein(ms), ghostClickable(ms)
-------------------------------------------------------------------------*/

async function handlePrestate(div, prestate, tdelay, token, parsed, onClickTogglePause) {
  const p = prestate;
  let requiresClickToStart = false;
  let ghostClickableMs = 500;
  
  // Parse prestate
  if (p && typeof p === "object" && p.type === "func") {
    if (p.name === "fadein") {
      const ms = Number(p.args?.[0] ?? 1000);
      div.style.opacity = "0";
      setTimeout(() => {
        div.style.transition = `opacity ${ms}ms ease`;
        div.style.opacity = "1";
      }, 20);
    } else if (p.name === "ghostClickable") {
      ghostClickableMs = Number(p.args?.[0] ?? 500);
      requiresClickToStart = true;
    }
  } else if (typeof p === "string") {
    const s = p.toLowerCase().trim();
    
    if (s === "hide") {
      div.style.opacity = "0";
    } else if (s === "ghost") {
      div.style.opacity = "0.3";
    } else if (s.startsWith("fadein(")) {
      const ms = parseInt(s.match(/\((\d+)\)/)?.[1] ?? "500");
      div.style.opacity = "0";
      setTimeout(() => {
        div.style.transition = `opacity ${ms}ms ease`;
        div.style.opacity = "1";
      }, 20);
    } else if (s.startsWith("ghostclickable(")) {
      ghostClickableMs = parseInt(s.match(/\((\d+)\)/)?.[1] ?? "500");
      requiresClickToStart = true;
    }
  }
  
  // Handle ghostClickable flow
  if (requiresClickToStart) {
    // Wait for tdelay before showing ghost
    if (tdelay > 0) {
      await rafWait(tdelay * 1000, token);
      if (token.cancel) return false;
    }
    
    // Fade to ghost state
    div.style.transition = `opacity ${ghostClickableMs}ms ease`;
    void div.offsetHeight;
    div.style.opacity = "0.3";
    div.style.pointerEvents = "auto";
    div.style.cursor = "pointer";
    
    // Wait for click to start
    const started = await new Promise(resolve => {
      const clickToStart = (e) => {
        e.stopPropagation();
        e.preventDefault();
        div.removeEventListener("click", clickToStart);
        
        // Fade to full opacity
        div.style.transition = "opacity 400ms ease";
        void div.offsetHeight;
        div.style.opacity = "1";
        
        // Switch to pause/resume handler
        div.addEventListener("click", onClickTogglePause);
        resolve(true);
      };
      
      const checkCancel = () => {
        if (token.cancel) {
          div.removeEventListener("click", clickToStart);
          resolve(false);
        } else {
          requestAnimationFrame(checkCancel);
        }
      };
      
      div.addEventListener("click", clickToStart);
      checkCancel();
    });
    
    return started;
  }
  
  // Regular tdelay (non-ghostClickable)
  if (tdelay > 0) {
    await rafWait(tdelay * 1000, token);
    if (token.cancel) return false;
  }
  
  return true;
}


/* ------------------------------------------------------------------------
   8) Main Handler
-------------------------------------------------------------------------*/

export async function handleCueTextFromAST(ast, cueElement = null) {
  try {
    console.groupCollapsed("%c[cueText] ENTER handler", "color:#6cf;font-weight:bold");
    
    // -------------------------------------------------
    // Parse parameters
    // -------------------------------------------------
    const parsed = parseCueTextParams(ast, cueElement);
    console.log("[cueText] Parsed params:", parsed);
    
    // -------------------------------------------------
    // Load content units
    // -------------------------------------------------
    const units = await loadCueTextUnits(parsed.content, parsed.mode);
    if (!units.length) {
      console.log("[cueText] No units to display");
      console.groupEnd();
      return;
    }
    
    // -------------------------------------------------
    // Create initial overlay (used for prestate/ghostClickable)
    // -------------------------------------------------
    const initialDiv = createTextLayer(
      units[0]?.text || "",
      parsed.cueUid,
      parsed.style
    );
    document.body.appendChild(initialDiv);
    
    // Position initial div
    const anchorBox = computeSlotAnchor(parsed, cueElement);
    const slotState = initSlotState(parsed.yslots);
    
    applySlotPosition(initialDiv, slotState.index, {
      offsetX: parsed.offsetX,
      offsetY: parsed.offsetY,
      yoffset: parsed.yoffset,
      yslots: parsed.yslots
    }, anchorBox);
    
    // -------------------------------------------------
    // Register token
    // -------------------------------------------------
    if (!window.activeCueTexts) window.activeCueTexts = new Map();
    const token = {
      cancel: false,
      div: initialDiv,
      persist: parsed.persist
    };
    window.activeCueTexts.set(parsed.cueUid, token);
    
    // -------------------------------------------------
    // Click handlers
    // -------------------------------------------------
    const onClickTogglePause = (e) => {
      e?.stopPropagation?.();
      e?.preventDefault?.();
      if (!token) return;
      
      if (!token.paused) {
        token.paused = true;
        console.log("[cueText] Paused:", parsed.cueUid);
      } else {
        resumeTextToken(token);
        console.log("[cueText] Resumed:", parsed.cueUid);
      }
    };
    
    const onClickCancel = () => {
      token.cancel = true;
    };
    
    // -------------------------------------------------
    // Handle prestate
    // -------------------------------------------------
    const isGhostClickable = 
      (parsed.prestate?.type === "func" && parsed.prestate.name === "ghostClickable") ||
      (typeof parsed.prestate === "string" && parsed.prestate.toLowerCase().startsWith("ghostclickable("));
    
    if (!isGhostClickable) {
      initialDiv.addEventListener("click", onClickCancel);
    }
    
    const prestateOk = await handlePrestate(
      initialDiv,
      parsed.prestate,
      parsed.tdelay,
      token,
      parsed,
      onClickTogglePause
    );
    
    if (!prestateOk || token.cancel) {
      try { initialDiv.remove(); } catch {}
      window.activeCueTexts.delete(parsed.cueUid);
      console.groupEnd();
      return;
    }
    
    // Remove initial div (will be replaced by sequence)
    try { initialDiv.remove(); } catch {}
    
    // -------------------------------------------------
    // Layer registry for tracking active layers
    // -------------------------------------------------
    const layerRegistry = new Set();
    
    // -------------------------------------------------
    // Play sequence function
    // -------------------------------------------------
    async function playSequenceOnce() {
      for (const unit of units) {
        if (token.cancel) break;
        
        // Compute timing
        const durMs = (unit.dur ?? parsed.dur) * 1000;
        // Fade-in: minimum 150ms, up to 70% of duration
        const fadeMs = clamp(parsed.fadePercent * durMs, 150, durMs * 0.7);
        
        // Get next slot
        const nextSlot = computeNextSlot(slotState, parsed.yslots, parsed.yslotmode);
        
        // Place text with automatic time-based eviction
        placeTextInSlot({
          text: unit.text,
          slotIndex: nextSlot,
          timing: {
            durMs,
            fadeMs,
            overlap: parsed.overlap,
            yslots: parsed.yslots
          },
          position: {
            uid: parsed.cueUid,
            yslots: parsed.yslots,
            yoffset: parsed.yoffset,
            offsetX: parsed.offsetX,
            offsetY: parsed.offsetY,
            style: parsed.style
          },
          anchorBox,
          layerRegistry,
          onClickHandler: onClickTogglePause
        });
        
        // Wait for duration (respecting pause)
        await waitIfPaused(token);
        await rafWait(durMs, token);
      }
    }
    
    // -------------------------------------------------
    // Main playback loop
    // -------------------------------------------------
    if (parsed.order === "rnd" || parsed.infinite) {
      while (!token.cancel) {
        shuffleInPlace(units);
        await playSequenceOnce();
      }
    } else {
      for (let pass = 0; pass < parsed.loopCount && !token.cancel; pass++) {
        await playSequenceOnce();
      }
    }
    
    // -------------------------------------------------
    // Final cleanup
    // -------------------------------------------------
    console.log("[cueText] Final cleanup for UID:", parsed.cueUid);
    
    evictAllLayers(layerRegistry, 150);
    
    // Defensive: clean up any stray layers
    setTimeout(() => {
      document.querySelectorAll(
        `.cue-text-overlay[data-uid="${CSS.escape(parsed.cueUid)}"]`
      ).forEach(el => {
        el.style.transition = "opacity 100ms ease";
        el.style.opacity = 0;
        setTimeout(() => {
          try { el.remove(); } catch {}
        }, 150);
      });
    }, 200);
    
    window.activeCueTexts.delete(parsed.cueUid);
    console.groupEnd();
    
  } catch (err) {
    console.error("[cueText] FATAL:", err);
    console.groupEnd?.();
  }
}


/* ------------------------------------------------------------------------
   9) Stop All Overlays
-------------------------------------------------------------------------*/

export function stopAllCueTexts() {
  if (!window.activeCueTexts) return;
  
  for (const [uid, token] of window.activeCueTexts.entries()) {
    if (!token.persist) {
      token.cancel = true;
      
      // Clean up all layers with this UID
      document.querySelectorAll(
        `.cue-text-overlay[data-uid="${CSS.escape(uid)}"]`
      ).forEach(el => {
        // Clear any pending timeouts
        if (el._fadeTimeout) clearTimeout(el._fadeTimeout);
        if (el._removeTimeout) clearTimeout(el._removeTimeout);
        
        el.style.transition = "opacity 100ms ease";
        el.style.opacity = 0;
        setTimeout(() => {
          try { el.remove(); } catch {}
        }, 150);
      });
      
      window.activeCueTexts.delete(uid);
    }
  }
}