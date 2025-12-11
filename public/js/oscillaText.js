// ========================================================================
// oscillaText.js  — refactored, structured, behaviour-preserving
// ========================================================================

/* ------------------------------------------------------------------------
   1) Helpers used throughout
-------------------------------------------------------------------------*/
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function unquote(v) {
  if (typeof v !== "string") return v;
  return v.replace(/^[`'"]+|[`'"]+$/g, "");
}

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

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}


/* ------------------------------------------------------------------------
   2) Parse parameters from AST
-------------------------------------------------------------------------*/
function parseCueTextParams(ast, cueElement) {
  const params = {};
  for (const p of (ast?.args || [])) {
    params[p.type] = p.value;
  }

  // -----------------------------
  // Extract simple fields
  // -----------------------------
  const order = unquote(params.order || "seq");
  const mode  = unquote(params.mode  || "line");

  // Loop logic (unchanged)
  const loopRaw0 = (params.loop ?? (order === "rnd" ? "0" : "1"))
    .toString()
    .trim()
    .toLowerCase();

  const infinite  = (loopRaw0 === "0" || loopRaw0 === "inf" || loopRaw0 === "infinite");
  const loopCount = infinite ? 0 : Math.max(1, parseInt(loopRaw0, 10) || 1);

  // -----------------------------
  // NEW: tdelay / prestate
  // -----------------------------
  let tdelay = 0;
  if (params.tdelay != null) {
    tdelay = Number(params.tdelay) || 0;
  }

  // Example: prestate:"fadein(1200)" → we store the whole string "fadein(1200)"
  let prestate = "show";
  if (params.prestate != null) {
    prestate = unquote(String(params.prestate));
  }

  // -----------------------------
  // Compose return structure
  // -----------------------------
  return {
    rawParams: params,

    // content
    content:   unquote(params.src || params.content || ""),
    style:     unquote(params.style || ""),

    // target placement
    targetId:  unquote(params.target || "self"),
    offsetX:   Number(params.offsetX || 0),
    offsetY:   Number(params.offsetY || 0),

    // sequencing
    order,
    mode,
    infinite,
    loopCount,

    // NEW unified cue-start behaviour
    tdelay,
    prestate,

    // uid fallback
    cueUid: String(params.uid || cueElement?.id || `cueText_${unquote(params.target || "center")}`),
  };
}


/* ------------------------------------------------------------------------
   3) Convert text → units (line/word/char)
-------------------------------------------------------------------------*/
function toUnitsFromText(str, mode) {
  if (!str) return [];
  if (mode === "word") {
    return str.split(/\s+/).filter(Boolean).map((tok) => ({
      text: tok.split(":")[0], dur: null, gap: null
    }));
  }
  if (mode === "char") {
    return str.split("").map((ch) => ({ text: ch, dur: null, gap: null }));
  }
  return str.split(/[\r\n;]+/).filter(Boolean).map((line) => ({
    text: line, dur: null, gap: null
  }));
}


/* ------------------------------------------------------------------------
   4) Fetch if .txt → return units array
-------------------------------------------------------------------------*/
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
      return [{ text: `[Missing file: ${content}]`, dur: null, gap: null }];
    }
  }
  return toUnitsFromText(content, mode);
}


/* ------------------------------------------------------------------------
   5) Slot logic helpers
-------------------------------------------------------------------------*/
function initSlotState(yslots) {
  if (yslots <= 0) return { active: false };
  const centerIndex = Math.round((yslots + 1) / 2);
  return { active: true, index: centerIndex, dir: 1, order: [] };
}

function computeNextSlot(slotState, yslots, yslotmode) {
  if (!slotState.active) return null;
  let next, { index, dir, order } = slotState;
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
  return next;
}

function applySlotPosition(layer, slot, { offsetX, offsetY, yoffset, yslots }) {
  if (!slot || !yslots) return;
  const centerIndex = (yslots + 1) / 2;
  const extraY = (slot - centerIndex) * yoffset;
  layer.style.position = "fixed";
  layer.style.left = `calc(50% + ${offsetX}px)`;
  layer.style.top  = `calc(50% + ${offsetY + extraY}px)`;
  layer.style.transform = "translate(-50%, -50%)";
}


/* ------------------------------------------------------------------------
   6) Cross and Non-cross transitions
-------------------------------------------------------------------------*/
async function transitionCross({oldLayer, newText, params, slotState, layers, token}) {
  const { fadeMs, durMs, yslots } = params;

  oldLayer.style.pointerEvents = "none";

  // compute new slot
  let newSlot = null;
  if (slotState.active) {
    newSlot = computeNextSlot(slotState, yslots, params.yslotmode);
  }

  const newLayer = oldLayer.cloneNode(true);
  newLayer.textContent = newText;
  newLayer.style.transition = "none";
  newLayer.style.opacity = 0;
  newLayer.dataset.uid = params.uid;
newLayer.className = "cue-text-overlay";
slotState.index = newSlot ?? slotState.index;
return { layer: newLayer, canceled: false };


  newLayer.style.pointerEvents = "auto";
  newLayer.addEventListener("click", layers.onClickCancel);

  if (slotState.active && newSlot != null) {
    applySlotPosition(newLayer, newSlot, params);
  } else {
    layers.positionBase(newLayer);
  }

  oldLayer.style.zIndex = 100000;
  newLayer.style.zIndex = 100001;
  document.body.appendChild(newLayer);

  // crossfade
  newLayer.offsetHeight;
  newLayer.style.transition = `opacity ${fadeMs}ms ease`;
  newLayer.style.opacity = 1;

  oldLayer.offsetHeight;
  oldLayer.style.transition = `opacity ${fadeMs}ms ease`;
  oldLayer.style.opacity = 0;

  await rafWait(fadeMs + durMs, token);
  if (token.cancel) {
    try { newLayer.remove(); } catch {}
    try { oldLayer.remove(); } catch {}
    return { canceled: true };
  }

  try { oldLayer.remove(); } catch {};

  // promote
  slotState.index = newSlot ?? slotState.index;
  return { layer: newLayer, canceled: false };
}


async function transitionNonCross({layer, newText, params, slotState, layers, token}) {
  const { fadeMs, durMs } = params;

  // fade out current
  layer.style.transition = `opacity ${fadeMs}ms ease`;
  layer.offsetHeight;
  layer.style.opacity = 0;
  await rafWait(fadeMs, token);
  if (token.cancel) return { canceled: true };

  // blank gap
  if (params.gapForUnit > 0) {
    await rafWait(params.gapForUnit * 1000, token);
    if (token.cancel) return { canceled: true };
  }

  // introduce new text
  layer.textContent = newText;
  layer.style.transition = "none";
  layer.style.opacity = 0;

  if (slotState.active) {
    const next = computeNextSlot(slotState, params.yslots, params.yslotmode);
    if (next != null) slotState.index = next;
    applySlotPosition(layer, slotState.index, params);
  } else {
    layers.positionBase(layer);
  }

  layer.offsetHeight;
  layer.style.transition = `opacity ${fadeMs}ms ease`;
  layer.style.opacity = 1;
  await rafWait(fadeMs, token);
  if (token.cancel) return { canceled: true };

  await rafWait(durMs, token);
  if (token.cancel) return { canceled: true };

  // fade out before next
  layer.style.transition = `opacity ${fadeMs}ms ease`;
  layer.offsetHeight;
  layer.style.opacity = 0;
  await rafWait(fadeMs, token);

  return { layer, canceled: false };
}


/* ------------------------------------------------------------------------
   7) Main handler (entry point)
-------------------------------------------------------------------------*/
export async function handleCueTextFromAST(ast, cueElement = null) {
  try {
    console.groupCollapsed("%c[cueText] ENTER handler", "color:#6cf;font-weight:bold");

    // -------------------------------------------------
    // 1) Params and units
    // -------------------------------------------------
    const parsed = parseCueTextParams(ast, cueElement);
    const units = await loadCueTextUnits(parsed.content, parsed.mode);
    if (!units.length) return;

    // -------------------------------------------------
    // 2) Make initial overlay div
    // -------------------------------------------------
    const div = document.createElement("div");
    div.className = "cue-text-overlay";
    div.dataset.uid = parsed.cueUid;
    div.style.cssText = `
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: transparent;
      color: white;
      z-index: 999999;
      font-size: 4em;
      padding: 8px 12px;
      border-radius: 8px;
      max-width: 70vw;
      text-align: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      text-shadow: 0 0 10px rgba(0,0,0,0.7);
      pointer-events: auto;
      ${parsed.style}
    `;
    document.body.appendChild(div);

    // registry + cancel token
    if (!window.activeCueTexts) window.activeCueTexts = new Map();
    const token = { cancel: false, div, persist: parsed.rawParams.persist == 1 };
    window.activeCueTexts.set(parsed.cueUid, token);

    // Click-to-cancel
    const onClickCancel = () => {
      token.cancel = true;
    };
    div.addEventListener("click", onClickCancel);

    // -------------------------------------------------
    // 3) Slot state + base positioning
    // -------------------------------------------------
    const yslots   = Number(parsed.rawParams.yslots || 0);
    const yoffset  = parsed.rawParams.yoffset != null ? Number(parsed.rawParams.yoffset) : 100;
    const yslotmode = unquote(parsed.rawParams.yslotmode || "sequence").toLowerCase();
    const slotState = initSlotState(yslots);

    function positionBase(layer) {
      if (yslots > 0) return;
      let placed = false;
      if (parsed.targetId === "self" && cueElement) {
        const box = cueElement.getBoundingClientRect();
        layer.style.position = "absolute";
        layer.style.left = `${box.x + parsed.offsetX}px`;
        layer.style.top  = `${box.y + parsed.offsetY}px`;
        layer.style.transform = "translate(0, 0)";
        placed = true;
      } else if (parsed.targetId !== "center" && parsed.targetId !== "self") {
        const target = document.getElementById(parsed.targetId);
        if (target) {
          const box = target.getBoundingClientRect();
          layer.style.position = "absolute";
          layer.style.left = `${box.x + parsed.offsetX}px`;
          layer.style.top  = `${box.y + parsed.offsetY}px`;
          layer.style.transform = "translate(0, 0)";
          placed = true;
        }
      }
      if (!placed) {
        layer.style.position = "fixed";
        layer.style.left = `calc(50% + ${parsed.offsetX}px)`;
        layer.style.top  = `calc(50% + ${parsed.offsetY}px)`;
        layer.style.transform = "translate(-50%, -50%)";
      }
    }

     if (slotState.active) {
      applySlotPosition(div, slotState.index, {
        offsetX: parsed.offsetX, offsetY: parsed.offsetY,
        yoffset, yslots
      });
    } else {
      positionBase(div);
    }


    // -------------------------------------------------
    // NEW: prestate handling for text()
    // -------------------------------------------------
    if (parsed.prestate) {
      const s = parsed.prestate.toLowerCase().trim();

      if (s === "hide") {
        div.style.opacity = 0;
      }
      else if (s.startsWith("fadein(")) {
        const ms = parseInt(s.match(/\((\d+)\)/)?.[1] ?? "500");
        div.style.opacity = 0;
        setTimeout(() => {
          div.style.transition = `opacity ${ms}ms ease`;
          div.style.opacity = 1;
        }, 20);
      }
    }

    // -------------------------------------------------
    // NEW: tdelay handling for text()
    // -------------------------------------------------
    if (parsed.tdelay && parsed.tdelay > 0) {
      console.log(
        `[cueText] ⏳ tdelay=${parsed.tdelay}s before showing text uid=${parsed.cueUid}`
      );

      await rafWait(parsed.tdelay * 1000, token);

      if (token.cancel) {
        console.log("[cueText] canceled during tdelay, aborting.");
        try {
          div.removeEventListener("click", onClickCancel);
        } catch {}
        try {
          div.remove();
        } catch {}
        window.activeCueTexts.delete(parsed.cueUid);
        console.groupEnd();
        return;
      }
    }

    // -------------------------------------------------
    // 4) Transition logic
    // -------------------------------------------------
    async function playSequenceOnce() {

      let currentLayer = null;
      let hasCurrent = false;

      for (const unit of units) {
        if (token.cancel) return;
        const durSec =
          unit.dur ??
          (2 + Math.random() * (2 - 2));    // simplified (same behaviour)
        const gapSec =
          unit.gap ??
          (0 + Math.random() * (0 - 0));    // simplified (same behaviour)

        const durMs  = durSec * 1000;
        const fadeMs = clamp(parsed.fadeTimeBase != null
          ? parsed.fadeTimeBase
          : (parsed.fadePercent || 0.25) * durMs,
          20, durMs * 0.5);

        const params = {
          uid: parsed.cueUid,
          fadeMs, durMs, gapForUnit: gapSec,
          yslots, yoffset,
          yslotmode, offsetX: parsed.offsetX, offsetY: parsed.offsetY
        };

        if (!hasCurrent || !currentLayer) {
          // first line
          currentLayer = div;
          currentLayer.textContent = unit.text;
          currentLayer.style.transition = "none";
          currentLayer.style.opacity = 0;
          currentLayer.offsetHeight;
          currentLayer.style.transition = `opacity ${fadeMs}ms ease`;
          currentLayer.style.opacity = 1;
          await rafWait(fadeMs + durMs, token);
          if (token.cancel) return;
          hasCurrent = true;
          continue;
        }

        // CROSS?
        if (parsed.rawParams.cross == 1) {
          const result = await transitionCross({
            oldLayer: currentLayer,
            newText: unit.text,
            params: {...params},
            slotState,
            layers: { onClickCancel, positionBase },
            token
          });
          if (result.canceled) return;
          currentLayer = result.layer;
          continue;
        }

        // NON-CROSS
        const nonCrossRes = await transitionNonCross({
          layer: currentLayer,
          newText: unit.text,
          params: {...params},
          slotState,
          layers: { onClickCancel, positionBase },
          token
        });
        if (nonCrossRes.canceled) return;
        currentLayer = nonCrossRes.layer;
      }
    }

    // -------------------------------------------------
    // 5) Playback loop
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




// DEBUG: see what overlays are still in DOM before cleanup:
const leftovers = [...document.querySelectorAll(`.cue-text-overlay[data-uid="${CSS.escape(parsed.cueUid)}"]`)]
  .map(el => ({
    text: el.textContent.trim(),
    opacity: el.style.opacity,
    display: el.style.display,
    removed: el._oscillaRemoved
  }));

console.log("[cueText] PRE-CLEANUP left layers:", leftovers.length, leftovers);



// -------------------------------------------------
// 6) Cleanup — remove ALL layers with this UID
// -------------------------------------------------
console.log("[cueText] FINAL CLEANUP for UID:", parsed.cueUid);

document.querySelectorAll(
  `.cue-text-overlay[data-uid="${CSS.escape(parsed.cueUid)}"]`
).forEach(el => {
  el._oscillaRemoved = true; // track state so we can see
  el.style.transition = "opacity 150ms ease";
  el.style.opacity = 0;

  setTimeout(() => {
    try {
      el.remove();
    } catch {}
  }, 180);

setTimeout(() => {
  const stillThere = document.querySelectorAll(`.cue-text-overlay[data-uid="${CSS.escape(parsed.cueUid)}"]`);
  console.log("[cueText] POST-CLEANUP still in DOM?", stillThere.length, stillThere);
}, 300);

});



window.activeCueTexts.delete(parsed.cueUid);
console.groupEnd();


  } catch (err) {
    console.error("[cueText] FATAL:", err);
    console.groupEnd?.();
  }
}


/* ------------------------------------------------------------------------
   8) Stop all overlays
-------------------------------------------------------------------------*/
export function stopAllCueTexts() {
  if (!window.activeCueTexts) return;
  for (const [uid, token] of window.activeCueTexts.entries()) {
    if (!token.persist) {
      token.cancel = true;
      try { token.div?.remove(); } catch {}
      window.activeCueTexts.delete(uid);
    }
  }
}
