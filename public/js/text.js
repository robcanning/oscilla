/*!
 * text.js — cue:text(...) handler (AST foundation)
 * -----------------------------------------------
 * This minimal version sets up the handler so that `cue:text(...)`
 * works with the new Chevrotain parser (AST-based).
 * 
 * Later, we’ll extend this with:
 *  - external file loading (texts/*.txt)
 *  - randomized/sequential reveal
 *  - per-line duration pairs
 *  - SuperCollider-style pattern evaluation
 */
// text.js
// ------------------------------------------------------------
// cue:text(...) — display inline or file-based text overlays
// ------------------------------------------------------------
// ------------------------------------------------------------
// cue:text(...) — continuous text cue with randomseq looping
// ------------------------------------------------------------
// ------------------------------------------------------------
// cue:text(...) — unified handler supporting line/word/char modes
// with displayrange, pauserange, holdrange, and randomseq looping
// ------------------------------------------------------------
export async function handleCueTextFromAST(ast, cueElement = null) {
  const params = {};
  for (const p of ast.args || []) params[p.type] = p.value;

  // ───────────────────────────────────────────────
  // Helpers (cancel-aware)
  // ───────────────────────────────────────────────
  const rafWait = (ms, token) =>
    new Promise((resolve) => {
      if (token.cancel) return resolve();
      const end = performance.now() + ms;
      function loop(t) {
        if (token.cancel) return resolve();
        if (t >= end) return resolve();
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });

  const nextFrame = (token) =>
    new Promise((r) => requestAnimationFrame(() => (token.cancel ? r() : r())));

  // ───────────────────────────────────────────────
  // Core params
  // ───────────────────────────────────────────────
  let content = (params.src || params.content || "").replace(/^["'`](.*)["'`]$/, "$1");
  let style   = (params.style || "").replace(/^["'`](.*)["'`]$/, "$1");

  const targetId = params.target || "center";
  const offsetX  = Number(params.offsetX || 0);
  const offsetY  = Number(params.offsetY || 0);
  const order    = (params.order || "seq").replace(/^["'`](.*)["'`]$/, "$1");
  const mode     = (params.mode  || "line").replace(/^["'`](.*)["'`]$/, "$1");

  // Stable default uid: explicit → cueElement.id → target → center
  const uid = (params.uid || cueElement?.id || `cueText_${targetId || "center"}`).toString();

  // ───────────────────────────────────────────────
  // Global registry & anti-stacking on retrigger
  // ───────────────────────────────────────────────
  if (!window.activeCueTexts) window.activeCueTexts = new Map();

  // If an overlay with same uid exists, cancel & remove it first
  if (window.activeCueTexts.has(uid)) {
    const prev = window.activeCueTexts.get(uid);
    prev.cancel = true;
    try { prev.div?.remove(); } catch {}
    window.activeCueTexts.delete(uid);
  }

  // Nuke any stray DOM overlays with same uid (paranoia cleanup)
  document.querySelectorAll(`.cue-text-overlay[data-uid="${CSS.escape(uid)}"]`)
    .forEach((el) => el.remove());

  // ───────────────────────────────────────────────
  // Ranges
  // ───────────────────────────────────────────────
  function parseRange(val, fallback) {
    if (!val) return [fallback, fallback];
    const cleaned = String(val).replace(/^["'`](.*)["'`]$/, "$1");
    const parts = cleaned.split(/[-,]/).map(Number).filter((v) => !isNaN(v));
    return parts.length === 2 ? [parts[0], parts[1]] : [parts[0] ?? fallback, parts[0] ?? fallback];
  }
  const [durMin,  durMax ] = parseRange(params.dur,  2);
  const [gapMin,  gapMax ] = parseRange(params.gap,  0);
  const [holdMin, holdMax] = parseRange(params.hold, 0);

  // ───────────────────────────────────────────────
  // Fade (absolute ms or % of dur)
  // ───────────────────────────────────────────────
  let fadeParam = params.fade ? String(params.fade).replace(/^["'`](.*)["'`]$/, "$1") : null;
  let fadePercent = 0.25;
  let fadeTimeBase = null;
  if (fadeParam) {
    if (fadeParam.endsWith("%")) fadePercent = Number(fadeParam.replace("%", "")) / 100;
    else fadeTimeBase = Number(fadeParam);
  }

  // ───────────────────────────────────────────────
  // Loop control
  //   loop: 0 | inf → infinite
  //   otherwise → finite count
  // Defaults: seq → 1, rnd → infinite
  // ───────────────────────────────────────────────
  const loopRaw = (params.loop ?? (order === "rnd" ? "0" : "1")).toString().trim().toLowerCase();
  const infinite = loopRaw === "0" || loopRaw === "inf" || loopRaw === "infinite";
  const loopCount = infinite ? 0 : Math.max(1, parseInt(loopRaw, 10) || 1);

  // ───────────────────────────────────────────────
  // Build units [{text, dur|null, gap|null}]
  // ───────────────────────────────────────────────
  const toUnits = (str) => {
    if (mode === "word") {
      return str.split(/\s+/).filter(Boolean).map((tok) => {
        const parts = tok.split(":").map((p) => p.trim());
        const text = parts[0];
        const dur  = parts[1] && !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1]) : null;
        const gap  = parts[2] && !isNaN(parseFloat(parts[2])) ? parseFloat(parts[2]) : null;
        return { text, dur, gap };
      });
    } else if (mode === "char") {
      return str.split("").map((ch) => ({ text: ch, dur: null, gap: null }));
    } else {
      return str.split(/[\r\n;]+/).filter(Boolean).map((line) => ({ text: line, dur: null, gap: null }));
    }
  };

  let units = [];
  if (/\.txt$/i.test(content)) {
    const filePath = `${window.textDir}${content}`;
    try {
      const resp = await fetch(filePath);
      const data = await resp.text();
      units = toUnits(data);
    } catch (err) {
      console.warn(`[cueText] ⚠️ Failed to load ${filePath}`, err);
      units = [{ text: `[Missing file: ${content}]`, dur: null, gap: null }];
    }
  } else {
    units = toUnits(content);
  }

  // ───────────────────────────────────────────────
  // Overlay
  // ───────────────────────────────────────────────
  const div = document.createElement("div");
  div.className = "cue-text-overlay";
  div.dataset.uid = uid;
  div.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: transparent;
    color: white;
    font-size: 2em;
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 70vw;
    text-align: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    text-shadow: 0 0 10px rgba(0,0,0,0.7);
    pointer-events: auto; /* allow click to cancel */
    ${style}
  `;
  document.body.appendChild(div);

  // Create a cancel token object and register
  const token = { cancel: false, div };
  window.activeCueTexts.set(uid, token);

  // Click to cancel for BOTH finite and infinite
  const onClickCancel = () => { token.cancel = true; };
  div.addEventListener("click", onClickCancel);

  // Positioning: center | self | elementId
  let placed = false;
  if (targetId === "self" && cueElement) {
    const box = cueElement.getBoundingClientRect();
    div.style.position = "absolute";
    div.style.left = `${box.x + offsetX}px`;
    div.style.top  = `${box.y + offsetY}px`;
    div.style.transform = "translate(0,0)";
    placed = true;
  } else if (targetId !== "center" && targetId !== "self") {
    const target = document.getElementById(targetId);
    if (target) {
      const box = target.getBoundingClientRect();
      div.style.position = "absolute";
      div.style.left = `${box.x + offsetX}px`;
      div.style.top  = `${box.y + offsetY}px`;
      div.style.transform = "translate(0,0)";
      placed = true;
    }
  }
  if (!placed) {
    div.style.position = "fixed";
    div.style.left = `calc(50% + ${offsetX}px)`;
    div.style.top  = `calc(50% + ${offsetY}px)`;
    div.style.transform = "translate(-50%, -50%)";
  }

  // ───────────────────────────────────────────────
  // Cross-fade one unit (cancel-aware)
  // ───────────────────────────────────────────────
  const crossFadeUnit = async (newText, duration) => {
    if (token.cancel) return;

    const fadeMs = fadeTimeBase ?? (fadePercent * duration * 1000);
    const fadeApplied = Math.max(50, Math.min(fadeMs, duration * 1000 * 0.8));

    // fade out current
    div.style.transition = `opacity ${fadeApplied}ms ease`;
    void div.offsetHeight;
    div.style.opacity = 0;
    await rafWait(fadeApplied, token);
    if (token.cancel) return;

    // set new text and fade in
    div.textContent = newText;
    await nextFrame(token);
    div.style.transition = `opacity ${fadeApplied}ms ease`;
    void div.offsetHeight;
    div.style.opacity = 1;
    await rafWait(duration * 1000, token);
    if (token.cancel) return;

    // fade out after display
    div.style.transition = `opacity ${fadeApplied}ms ease`;
    void div.offsetHeight;
    div.style.opacity = 0;
    await rafWait(fadeApplied, token);
  };

  const fadeAndRemove = () => {
    if (token.cancel) { /* already heading out */ }
    div.removeEventListener("click", onClickCancel);
    div.style.transition = "opacity 250ms ease";
    void div.offsetHeight;
    div.style.opacity = 0;
    setTimeout(() => {
      try { div.remove(); } catch {}
      window.activeCueTexts.delete(uid);
    }, 280);
  };

  // ───────────────────────────────────────────────
  // Sequence helpers
  // ───────────────────────────────────────────────
  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  const playSequenceOnce = async () => {
    for (const unit of units) {
      if (token.cancel) return;
      const dur = unit.dur ?? (durMin + Math.random() * (durMax - durMin));
      const gap = unit.gap ?? (gapMin + Math.random() * (gapMax - gapMin));
      await crossFadeUnit(unit.text.trim(), dur);
      if (token.cancel) return;
      if (gap > 0) await rafWait(gap * 1000, token);
    }
  };

  // ───────────────────────────────────────────────
  // Playback (cancel-aware)
  // ───────────────────────────────────────────────
  (async () => {
    if (order === "rnd" || infinite) {
      while (!token.cancel) {
        shuffleInPlace(units);
        await playSequenceOnce();
      }
      fadeAndRemove();
      return;
    }

    // finite sequential
    let pass = 0;
    while (!token.cancel && pass < loopCount) {
      await playSequenceOnce();
      pass++;
    }
    if (token.cancel) return fadeAndRemove();

    const finalHold = holdMin + Math.random() * (holdMax - holdMin);
    if (finalHold > 0) await rafWait(finalHold * 1000, token);
    fadeAndRemove();
  })();
}






function fadeAndRemove(el) {
    el.style.opacity = 0;
    setTimeout(() => el.remove(), 600);
}
