// text.js
// -----------------------------------------------
// cue:text(...) — AST-based text overlay handler
// Instrumented for deep debugging
// -----------------------------------------------
export async function handleCueTextFromAST(ast, cueElement = null) {
  try {
    console.groupCollapsed("%c[cueText] ENTER handler", "color:#6cf;font-weight:bold");
    console.log("[cueText] raw ast:", ast);
    console.log("[cueText] cueElement:", cueElement);

    // ───────────────────────────────────────────────
    // Extract params (as plain object)
    // ───────────────────────────────────────────────
    const params = {};
    for (const p of (ast?.args || [])) params[p.type] = p.value;

    const unquote = (v) => (typeof v === "string" ? v.replace(/^["'`](.*)["'`]$/, "$1") : v);

    // Core params with safe defaults
    let content  = unquote(params.src || params.content || "");
    let style    = unquote(params.style || "");
    const targetId = unquote(params.target || "self");
    const offsetX  = Number(params.offsetX || 0);
    const offsetY  = Number(params.offsetY || 0);
    const order    = unquote(params.order || "seq");   // "seq" | "rnd"
    const mode     = unquote(params.mode  || "line");  // "line" | "word" | "char"
    const loopRaw0 = (params.loop ?? (order === "rnd" ? "0" : "1")).toString().trim().toLowerCase();

    // Ranges (dur/gap/hold)
    function parseRange(val, fallback) {
      if (val == null || val === "") return [fallback, fallback];
      const cleaned = unquote(String(val));
      const parts = cleaned.split(/[-,]/).map(Number).filter((v) => !Number.isNaN(v));
      if (!parts.length) return [fallback, fallback];
      if (parts.length === 1) return [parts[0], parts[0]];
      return [parts[0], parts[1]];
    }
    const [durMin,  durMax ] = parseRange(params.dur,  2);
    const [gapMin,  gapMax ] = parseRange(params.gap,  0);
    const [holdMin, holdMax] = parseRange(params.hold, 0);

    // Fade (absolute ms or % of dur)
    let fadeParam = params.fade ? unquote(String(params.fade)) : null;
    let fadePercent = 0.25;
    let fadeTimeBase = null;
    if (fadeParam) {
      if (fadeParam.endsWith("%")) fadePercent = Math.max(0, Math.min(1, Number(fadeParam.replace("%","")) / 100));
      else fadeTimeBase = Math.max(0, Number(fadeParam) || 0);
    }

    // Loop control
    const infinite = loopRaw0 === "0" || loopRaw0 === "inf" || loopRaw0 === "infinite";
    const loopCount = infinite ? 0 : Math.max(1, parseInt(loopRaw0, 10) || 1);

    // Stable uid (explicit → cueElement.id → target → center)
    const uid = String(params.uid || cueElement?.id || `cueText_${targetId || "center"}`);

    console.log("[cueText] params:", {
      content, style, targetId, offsetX, offsetY, order, mode,
      durMin, durMax, gapMin, gapMax, holdMin, holdMax,
      fadeParam, fadePercent, fadeTimeBase, loopRaw0, infinite, loopCount, uid
    });

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
    // Build units [{ text, dur|null, gap|null }]
    // ───────────────────────────────────────────────
    const toUnits = (str) => {
      if (!str) return [];
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
        // "line" mode: newline or ';' separated
        return str.split(/[\r\n;]+/).filter(Boolean).map((line) => ({ text: line, dur: null, gap: null }));
      }
    };

    let units = [];
    let filePath = null;

    if (/\.txt$/i.test(content)) {
      const baseTextDir =
        (typeof window !== "undefined" && window.textDir) ? window.textDir :
        (typeof window !== "undefined" && window.sharedDir) ? `${window.sharedDir}texts/` :
        "/texts/";
      filePath = content.startsWith("/") ? content : `${baseTextDir}${content}`;

      console.log("[cueText] loading file:", { filePath, baseTextDir, content });

      try {
        const resp = await fetch(filePath);
        console.log("[cueText] fetch status:", resp.status, resp.statusText);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.text();
        units = toUnits(data);
      } catch (err) {
        console.warn(`[cueText] ⚠️ Failed to load ${filePath}`, err);
        units = [{ text: `[Missing file: ${content}]`, dur: null, gap: null }];
      }
    } else {
      // Inline content
      units = toUnits(content);
    }

    console.log("[cueText] units built:", { count: units.length, sample: units.slice(0, 5) });

    if (!units.length) {
      console.warn("[cueText] No units to display. Aborting.");
      console.groupEnd();
      return;
    }

    // ───────────────────────────────────────────────
    // Global registry & anti-stacking on retrigger
    // ───────────────────────────────────────────────
    if (!window.activeCueTexts) window.activeCueTexts = new Map();

    // Cancel any prior overlay with same uid
    if (window.activeCueTexts.has(uid)) {
      const prev = window.activeCueTexts.get(uid);
      prev.cancel = true;
      try { prev.div?.remove(); } catch {}
      window.activeCueTexts.delete(uid);
      console.log("[cueText] canceled previous overlay with uid:", uid);
    }

    // Remove stray DOM overlays with same uid
    document.querySelectorAll(`.cue-text-overlay[data-uid="${CSS.escape(uid)}"]`).forEach((el) => {
      console.log("[cueText] removing stray overlay:", el);
      el.remove();
    });

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
      z-index:999999;
      font-size: 4em;
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
    console.log("[cueText] overlay appended to body. initial style:", div.style.cssText);

    // Cancel token & registry
    const token = { cancel: false, div };
    window.activeCueTexts.set(uid, token);

    const onClickCancel = () => { token.cancel = true; console.log("[cueText] user clicked overlay → cancel requested"); };
    div.addEventListener("click", onClickCancel);

    // ───────────────────────────────────────────────
    // Positioning: center | self | elementId
    // ───────────────────────────────────────────────
    let placed = false;
    if (targetId === "self" && cueElement) {
      const box = cueElement.getBoundingClientRect();
      div.style.position = "absolute";
      div.style.left = `${box.x + offsetX}px`;
      div.style.top  = `${box.y + offsetY}px`;
      div.style.transform = "translate(0,0)";
      placed = true;
      console.log("[cueText] positioned at self:", { box, offsetX, offsetY });
    } else if (targetId !== "center" && targetId !== "self") {
      const target = document.getElementById(targetId);
      if (target) {
        const box = target.getBoundingClientRect();
        div.style.position = "absolute";
        div.style.left = `${box.x + offsetX}px`;
        div.style.top  = `${box.y + offsetY}px`;
        div.style.transform = "translate(0,0)";
        placed = true;
        console.log("[cueText] positioned at element:", { targetId, box, offsetX, offsetY });
      } else {
        console.warn("[cueText] targetId not found in DOM, falling back to center:", targetId);
      }
    }
    if (!placed) {
      div.style.position = "fixed";
      div.style.left = `calc(50% + ${offsetX}px)`;
      div.style.top  = `calc(50% + ${offsetY}px)`;
      div.style.transform = "translate(-50%, -50%)";
      console.log("[cueText] positioned at center:", { offsetX, offsetY });
    }

    // ───────────────────────────────────────────────
    // Cross-fade one unit (cancel-aware)
    // ───────────────────────────────────────────────
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    const crossFadeUnit = async (newText, duration) => {
      if (token.cancel) return;
      const minDur = 0.05; // 50ms guard
      const durSec = Math.max(minDur, Number(duration) || minDur);

      const fadeMsRaw = fadeTimeBase ?? (fadePercent * durSec * 1000);
      const fadeApplied = clamp(fadeMsRaw, 50, durSec * 1000 * 0.8);

      console.log("[cueText] crossFadeUnit →", { newText, durSec, fadeApplied, fadePercent, fadeTimeBase });

      // fade out current
      div.style.transition = `opacity ${fadeApplied}ms ease`;
      void div.offsetHeight; // reflow
      div.style.opacity = 0;
      await rafWait(fadeApplied, token);
      if (token.cancel) return;

      // set new text and fade in
      div.textContent = newText;
      await nextFrame(token);
      div.style.transition = `opacity ${fadeApplied}ms ease`;
      void div.offsetHeight;
      div.style.opacity = 1;

      // display duration (content visible)
      await rafWait(durSec * 1000, token);
      if (token.cancel) return;

      // fade out after display (prepare next)
      div.style.transition = `opacity ${fadeApplied}ms ease`;
      void div.offsetHeight;
      div.style.opacity = 0;
      await rafWait(fadeApplied, token);
    };

    const fadeAndRemove = () => {
      console.log("[cueText] fadeAndRemove()");
      div.removeEventListener("click", onClickCancel);
      div.style.transition = "opacity 250ms ease";
      void div.offsetHeight;
      div.style.opacity = 0;
      setTimeout(() => {
        try { div.remove(); } catch {}
        window.activeCueTexts.delete(uid);
        console.log("[cueText] overlay removed, uid cleared:", uid);
        console.groupEnd();
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
      console.log("[cueText] playSequenceOnce start; units:", units.length);
      for (const unit of units) {
        if (token.cancel) { console.log("[cueText] canceled during loop"); return; }
        const dur = unit.dur ?? (durMin + Math.random() * (durMax - durMin));
        const gap = unit.gap ?? (gapMin + Math.random() * (gapMax - gapMin));
        console.log("[cueText] unit:", { text: unit.text, dur, gap });
        await crossFadeUnit(String(unit.text || "").trim(), dur);
        if (token.cancel) return;
        if (gap > 0) { console.log("[cueText] gap wait(ms):", gap * 1000); await rafWait(gap * 1000, token); }
      }
      console.log("[cueText] playSequenceOnce end");
    };

    // ───────────────────────────────────────────────
    // Playback (cancel-aware)
    // ───────────────────────────────────────────────
    (async () => {
      try {
        if (order === "rnd" || infinite) {
          console.log("[cueText] playback mode:", order, "infinite:", infinite);
          while (!token.cancel) {
            shuffleInPlace(units);
            await playSequenceOnce();
          }
          fadeAndRemove();
          return;
        }

        console.log("[cueText] finite sequential playback; loopCount:", loopCount);
        let pass = 0;
        while (!token.cancel && pass < loopCount) {
          console.log(`[cueText] pass ${pass+1}/${loopCount}`);
          await playSequenceOnce();
          pass++;
        }
        if (token.cancel) { fadeAndRemove(); return; }

        const finalHold = holdMin + Math.random() * (holdMax - holdMin);
        console.log("[cueText] finalHold(s):", finalHold);
        if (finalHold > 0) await rafWait(finalHold * 1000, token);
        fadeAndRemove();
      } catch (playErr) {
        console.error("[cueText] playback error:", playErr);
        try { fadeAndRemove(); } catch {}
      }
    })();

  } catch (err) {
    console.error("[cueText] FATAL in handler:", err);
    console.groupEnd?.();
  }
}
