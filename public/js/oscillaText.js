// oscillaText.js
// -----------------------------------------------
// cue:text(...) — AST-based text overlay handler
// with slot-aware crossfade and gap logic
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

    const unquote = (v) => {
      if (typeof v !== "string") return v;
      // Strip any leading/trailing quotes/backticks, including nested ones
      return v.replace(/^[`'"]+|[`'"]+$/g, "");
    };

    // Core params with safe defaults
    let content = unquote(params.src || params.content || "");
    let style = unquote(params.style || "");
    const targetId = unquote(params.target || "self");
    const offsetX = Number(params.offsetX || 0);
    const offsetY = Number(params.offsetY || 0);
    const order = unquote(params.order || "seq");   // "seq" | "rnd"
    const mode = unquote(params.mode || "line");    // "line" | "word" | "char"
    const loopRaw0 = (params.loop ?? (order === "rnd" ? "0" : "1"))
      .toString()
      .trim()
      .toLowerCase();

    // NEW: vertical slot system
    const yslots = Number(params.yslots || 0); // 0 → disabled
    const yoffset = params.yoffset != null ? Number(params.yoffset) : 100;
    const yslotmode = unquote(params.yslotmode || "sequence").toLowerCase();

    // Ranges (dur/gap/hold)
    function parseRange(val, fallback) {
      if (val == null || val === "") return [fallback, fallback];
      const cleaned = unquote(String(val));
      const parts = cleaned
        .split(/[-,]/)
        .map(Number)
        .filter((v) => !Number.isNaN(v));
      if (!parts.length) return [fallback, fallback];
      if (parts.length === 1) return [parts[0], parts[0]];
      return [parts[0], parts[1]];
    }
    const [durMin, durMax] = parseRange(params.dur, 2);
    const [gapMin, gapMax] = parseRange(params.gap, 0);
    const [holdMin, holdMax] = parseRange(params.hold, 0);

    // ---------------------------------------------------------
    // crossfade (absolute ms or % of dur)
    // Quoted percentages work: crossfade:"20%"
    // ms works: crossfade:250
    // ---------------------------------------------------------
    let fadeParam =
      params.crossfade != null ? unquote(String(params.crossfade)) : null;
    let fadePercent = 0.25; // default 25% if percent-based
    let fadeTimeBase = null; // absolute ms value

    if (fadeParam != null) {
      // percent form e.g. "20%"
      if (typeof fadeParam === "string" && fadeParam.endsWith("%")) {
        const pct = Number(fadeParam.replace("%", ""));
        if (!Number.isNaN(pct)) {
          fadePercent = Math.max(0, Math.min(1, pct / 100));
        }
      } else {
        // ms: e.g. 200 or "200"
        const ms = Number(fadeParam);
        if (!Number.isNaN(ms)) fadeTimeBase = Math.max(0, ms);
      }
    }

    // Loop control
    const infinite =
      loopRaw0 === "0" ||
      loopRaw0 === "inf" ||
      loopRaw0 === "infinite";
    const loopCount = infinite
      ? 0
      : Math.max(1, parseInt(loopRaw0, 10) || 1);

    // Stable uid (explicit → cueElement.id → target → center)
    const uid = String(
      params.uid || cueElement?.id || `cueText_${targetId || "center"}`
    );

    console.log("[cueText] params:", {
      content,
      style,
      targetId,
      offsetX,
      offsetY,
      order,
      mode,
      durMin,
      durMax,
      gapMin,
      gapMax,
      holdMin,
      holdMax,
      fadeParam,
      fadePercent,
      fadeTimeBase,
      loopRaw0,
      infinite,
      loopCount,
      uid,
      yslots,
      yoffset,
      yslotmode,
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
      new Promise((r) =>
        requestAnimationFrame(() => (token.cancel ? r() : r()))
      );

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    // ───────────────────────────────────────────────
    // Build units [{ text, dur|null, gap|null }]
    // ───────────────────────────────────────────────
    const toUnits = (str) => {
      if (!str) return [];
      if (mode === "word") {
        return str
          .split(/\s+/)
          .filter(Boolean)
          .map((tok) => {
            const parts = tok.split(":").map((p) => p.trim());
            const text = parts[0];
            const dur =
              parts[1] && !Number.isNaN(parseFloat(parts[1]))
                ? parseFloat(parts[1])
                : null;
            const gap =
              parts[2] && !Number.isNaN(parseFloat(parts[2]))
                ? parseFloat(parts[2])
                : null;
            return { text, dur, gap };
          });
      } else if (mode === "char") {
        return str.split("").map((ch) => ({
          text: ch,
          dur: null,
          gap: null,
        }));
      } else {
        // "line" mode: newline or ';' separated
        return str
          .split(/[\r\n;]+/)
          .filter(Boolean)
          .map((line) => ({ text: line, dur: null, gap: null }));
      }
    };

    let units = [];
    let filePath = null;

    if (/\.txt$/i.test(content)) {
      const baseTextDir =
        typeof window !== "undefined" && window.textDir
          ? window.textDir
          : typeof window !== "undefined" && window.sharedDir
          ? `${window.sharedDir}texts/`
          : "/texts/";
      filePath = content.startsWith("/")
        ? content
        : `${baseTextDir}${content}`;

      console.log("[cueText] loading file:", {
        filePath,
        baseTextDir,
        content,
      });

      try {
        const resp = await fetch(filePath);
        console.log(
          "[cueText] fetch status:",
          resp.status,
          resp.statusText
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.text();
        units = toUnits(data);
      } catch (err) {
        console.warn(
          `[cueText] ⚠️ Failed to load ${filePath}`,
          err
        );
        units = [
          {
            text: `[Missing file: ${content}]`,
            dur: null,
            gap: null,
          },
        ];
      }
    } else {
      // Inline content
      units = toUnits(content);
    }

    console.log("[cueText] units built:", {
      count: units.length,
      sample: units.slice(0, 5),
    });

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
      try {
        prev.div?.remove();
      } catch {}
      window.activeCueTexts.delete(uid);
      console.log(
        "[cueText] canceled previous overlay with uid:",
        uid
      );
    }

    // Remove stray DOM overlays with same uid
    document
      .querySelectorAll(
        `.cue-text-overlay[data-uid="${CSS.escape(uid)}"]`
      )
      .forEach((el) => {
        console.log("[cueText] removing stray overlay:", el);
        el.remove();
      });

    // ───────────────────────────────────────────────
    // Create initial layer (base div)
    // ───────────────────────────────────────────────
    const baseStyle = `
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
      ${style}
    `;

    const div = document.createElement("div");
    div.className = "cue-text-overlay";
    div.dataset.uid = uid;
    div.style.cssText = baseStyle;
    document.body.appendChild(div);

    console.log(
      "[cueText] base overlay appended. style:",
      div.style.cssText
    );

    const persistFlag =
      params.persist == 1 || params.persist === "1";
    const token = { cancel: false, div, persist: persistFlag };
    window.activeCueTexts.set(uid, token);

    // Click-to-cancel
    const onClickCancel = () => {
      token.cancel = true;
      console.log("[cueText] user clicked overlay → cancel requested");
    };
    div.addEventListener("click", onClickCancel);

    // ───────────────────────────────────────────────
    // SLOT SYSTEM STATE (yslots / yoffset / yslotmode)
    // ───────────────────────────────────────────────
    let slotIndex = null;
    let slotDir = +1;
    let slotOrder = [];

    const shuffleArray = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    };

    const initSlotIndexIfNeeded = () => {
      if (yslots <= 0) return;
      if (slotIndex == null) {
        // start at center-ish
        const centerIndex = Math.round((yslots + 1) / 2);
        slotIndex = centerIndex;
        slotDir = +1;
        slotOrder = [];
      }
    };

    const computeNextSlotIndex = () => {
      if (yslots <= 0) return null;
      initSlotIndexIfNeeded();

      let next;
      switch (yslotmode) {
        case "singlestep": {
          next = slotIndex + slotDir;
          if (next < 1 || next > yslots) {
            slotDir *= -1;
            next = slotIndex + slotDir;
          }
          break;
        }
        case "random": {
          next = 1 + Math.floor(Math.random() * yslots);
          break;
        }
        case "shuffle": {
          if (!slotOrder.length) {
            slotOrder = Array.from(
              { length: yslots },
              (_, i) => i + 1
            );
            shuffleArray(slotOrder);
          }
          next = slotOrder.shift();
          break;
        }
        case "sequence":
        default: {
          next = slotIndex + 1;
          if (next > yslots) next = 1;
          break;
        }
      }
      return next;
    };

    const applySlotPosition = (layer, slot) => {
      if (yslots <= 0) return;
      const centerIndex = (yslots + 1) / 2;
      const offsetSlots = slot - centerIndex;
      const extraY = offsetSlots * yoffset;

      layer.style.position = "fixed";
      layer.style.left = `calc(50% + ${offsetX}px)`;
      layer.style.top = `calc(50% + ${offsetY + extraY}px)`;
      layer.style.transform = "translate(-50%, -50%)";
    };

    // ───────────────────────────────────────────────
    // Legacy base positioning when NO slots
    // ───────────────────────────────────────────────
    const positionLayerBase = (layer) => {
      if (yslots > 0) {
        // slots override vertical positioning
        return;
      }

      let placed = false;
      if (targetId === "self" && cueElement) {
        const box = cueElement.getBoundingClientRect();
        layer.style.position = "absolute";
        layer.style.left = `${box.x + offsetX}px`;
        layer.style.top = `${box.y + offsetY}px`;
        layer.style.transform = "translate(0, 0)";
        placed = true;
      } else if (targetId !== "center" && targetId !== "self") {
        const target = document.getElementById(targetId);
        if (target) {
          const box = target.getBoundingClientRect();
          layer.style.position = "absolute";
          layer.style.left = `${box.x + offsetX}px`;
          layer.style.top = `${box.y + offsetY}px`;
          layer.style.transform = "translate(0, 0)";
          placed = true;
        }
      }

      if (!placed) {
        layer.style.position = "fixed";
        layer.style.left = `calc(50% + ${offsetX}px)`;
        layer.style.top = `calc(50% + ${offsetY}px)`;
        layer.style.transform = "translate(-50%, -50%)";
      }
    };

    // Initial base positioning of the first layer
    if (yslots > 0) {
      initSlotIndexIfNeeded();
      applySlotPosition(div, slotIndex);
      console.log("[cueText] initial slot position:", {
        yslots,
        yoffset,
        yslotmode,
        slotIndex,
      });
    } else {
      positionLayerBase(div);
      console.log("[cueText] initial base position (no slots)");
    }

    // ───────────────────────────────────────────────
    // FADE & LAYER LOGIC
    // ───────────────────────────────────────────────
    let currentLayer = null;
    let hasCurrentText = false; // track "first line" vs subsequent

    const fadeAndRemoveAll = () => {
      console.log("[cueText] fadeAndRemoveAll()");
      div.removeEventListener("click", onClickCancel);

      const removeLayer = (layer) => {
        if (!layer) return;
        layer.style.transition = "opacity 250ms ease";
        void layer.offsetHeight;
        layer.style.opacity = 0;
        setTimeout(() => {
          try {
            layer.remove();
          } catch {}
        }, 280);
      };

      removeLayer(currentLayer || div);

      window.activeCueTexts.delete(uid);
      console.log("[cueText] overlays removed, uid cleared:", uid);
      console.groupEnd();
    };

    // cross vs non-cross transition to new text
    const transitionTo = async (newText, duration, gapForUnit) => {
      if (token.cancel) return;

      const cross = params.cross == 1;
      const minDur = 0.05;
      const durSec = Math.max(minDur, Number(duration) || minDur);
      const durMs = durSec * 1000;

      let fadeMs =
        fadeTimeBase != null
          ? fadeTimeBase
          : fadePercent * durMs;

      if (!cross) {
        fadeMs = clamp(fadeMs, 20, durMs * 0.5);
      }

      console.log("[cueText] transitionTo()", {
        newText,
        durMs,
        fadeMs,
        gapForUnit,
        cross,
        hasCurrentText,
        slotIndex,
      });

      // FIRST LINE (no current text yet)
      if (!hasCurrentText || !currentLayer) {
        currentLayer = div;
        currentLayer.textContent = newText;
        currentLayer.style.transition = "none";
        currentLayer.style.opacity = 0;
        // already positioned earlier (slot or base)
        currentLayer.offsetHeight;
        currentLayer.style.transition = `opacity ${fadeMs}ms ease`;
        currentLayer.style.opacity = 1;
        await rafWait(fadeMs + durMs, token);
        if (token.cancel) return;
        hasCurrentText = true;
        return;
      }

      // ─────────────────────────────────────────────
      // CROSS MODE — dual layer: old in its slot, new in next slot
      // ─────────────────────────────────────────────
      if (cross) {
        // old layer (ghost) stays at its current position/slot
        const oldLayer = currentLayer;
        oldLayer.style.pointerEvents = "none";

        // compute next slot (if slots enabled)
        let newSlot = null;
        if (yslots > 0) {
          const next = computeNextSlotIndex();
          if (next != null) {
            newSlot = next;
          } else {
            // fallback: keep same slot
            newSlot = slotIndex ?? 1;
          }
        }

        // create new layer for new text
        const newLayer = oldLayer.cloneNode(true);
        newLayer.textContent = newText;
        newLayer.style.transition = "none";
        newLayer.style.opacity = 0;
        newLayer.dataset.uid = uid;
        newLayer.style.pointerEvents = "auto";
        newLayer.addEventListener("click", onClickCancel);

        // position new layer
        if (yslots > 0 && newSlot != null) {
          applySlotPosition(newLayer, newSlot);
        } else {
          positionLayerBase(newLayer);
        }

        // ensure old layer is on top of stacking order below new
        oldLayer.style.zIndex = 100000;
        newLayer.style.zIndex = 100001;

        document.body.appendChild(newLayer);

        // start crossfade
        newLayer.offsetHeight;
        newLayer.style.transition = `opacity ${fadeMs}ms ease`;
        newLayer.style.opacity = 1;

        oldLayer.offsetHeight;
        oldLayer.style.transition = `opacity ${fadeMs}ms ease`;
        oldLayer.style.opacity = 0;

        // hold for visibility of new line
        await rafWait(fadeMs + durMs, token);
        if (token.cancel) {
          try {
            newLayer.remove();
          } catch {}
          try {
            oldLayer.remove();
          } catch {}
          return;
        }

        // cleanup old layer and promote new layer
        try {
          oldLayer.remove();
        } catch {}
        currentLayer = newLayer;
        hasCurrentText = true;

        // update slotIndex after successful transition
        if (yslots > 0 && newSlot != null) {
          slotIndex = newSlot;
        }

        return;
      }

      // ─────────────────────────────────────────────
      // NON-CROSS MODE — fade-out → gap → fade-in
      // ─────────────────────────────────────────────

      // 1. Fade OUT current layer
      currentLayer.style.transition = `opacity ${fadeMs}ms ease`;
      currentLayer.offsetHeight;
      currentLayer.style.opacity = 0;
      await rafWait(fadeMs, token);
      if (token.cancel) return;

      // 2. Gap as blank screen (if any)
      if (gapForUnit > 0) {
        console.log(
          "[cueText] gap (non-cross) ms:",
          gapForUnit * 1000
        );
        await rafWait(gapForUnit * 1000, token);
        if (token.cancel) return;
      }

      // 3. Prepare new text in same or new slot
      currentLayer.textContent = newText;
      currentLayer.style.transition = "none";
      currentLayer.style.opacity = 0;

      if (yslots > 0) {
        const next = computeNextSlotIndex();
        if (next != null) {
          slotIndex = next;
        } else if (slotIndex == null) {
          initSlotIndexIfNeeded();
        }
        if (slotIndex != null) {
          applySlotPosition(currentLayer, slotIndex);
        }
      } else {
        positionLayerBase(currentLayer);
      }

      currentLayer.offsetHeight;
      currentLayer.style.transition = `opacity ${fadeMs}ms ease`;
      currentLayer.style.opacity = 1;
      await rafWait(fadeMs, token);
      if (token.cancel) return;

      // 4. Hold visible for duration
      await rafWait(durMs, token);
      if (token.cancel) return;

      // 5. Fade OUT at the end (blank before next unit)
      currentLayer.style.transition = `opacity ${fadeMs}ms ease`;
      currentLayer.offsetHeight;
      currentLayer.style.opacity = 0;
      await rafWait(fadeMs, token);
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
      console.log(
        "[cueText] playSequenceOnce start; units:",
        units.length
      );
      const isCrossMode = params.cross == 1;

      for (const unit of units) {
        if (token.cancel) {
          console.log("[cueText] canceled during loop");
          return;
        }
        const dur =
          unit.dur ??
          (durMin +
            Math.random() * (durMax - durMin));
        const gap =
          unit.gap ??
          (gapMin +
            Math.random() * (gapMax - gapMin));

        console.log("[cueText] unit:", {
          text: unit.text,
          dur,
          gap,
          isCrossMode,
        });

        await transitionTo(
          String(unit.text || "").trim(),
          dur,
          isCrossMode ? 0 : gap
        );
        if (token.cancel) return;
      }
      console.log("[cueText] playSequenceOnce end");
    };

    // ───────────────────────────────────────────────
    // Playback (cancel-aware)
    // ───────────────────────────────────────────────
    (async () => {
      try {
        if (order === "rnd" || infinite) {
          console.log(
            "[cueText] playback mode:",
            order,
            "infinite:",
            infinite
          );
          while (!token.cancel) {
            shuffleInPlace(units);
            await playSequenceOnce();
          }
          fadeAndRemoveAll();
          return;
        }

        console.log(
          "[cueText] finite sequential playback; loopCount:",
          loopCount
        );
        let pass = 0;
        while (!token.cancel && pass < loopCount) {
          console.log(
            `[cueText] pass ${pass + 1}/${loopCount}`
          );
          await playSequenceOnce();
          pass++;
        }
        if (token.cancel) {
          fadeAndRemoveAll();
          return;
        }

        const finalHold =
          holdMin +
          Math.random() * (holdMax - holdMin);
        console.log(
          "[cueText] finalHold(s):",
          finalHold
        );
        if (finalHold > 0)
          await rafWait(finalHold * 1000, token);
        fadeAndRemoveAll();
      } catch (playErr) {
        console.error(
          "[cueText] playback error:",
          playErr
        );
        try {
          fadeAndRemoveAll();
        } catch {}
      }
    })();
  } catch (err) {
    console.error("[cueText] FATAL in handler:", err);
    console.groupEnd?.();
  }
}

export function stopAllCueTexts() {
  if (!window.activeCueTexts) return;

  for (const [uid, token] of window.activeCueTexts.entries()) {
    const hasPersist = token.persist === true;

    if (!hasPersist) {
      token.cancel = true;
      try {
        token.div?.remove();
      } catch {}
      window.activeCueTexts.delete(uid);
    }
  }
}
