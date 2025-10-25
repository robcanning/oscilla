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
  // 1️⃣ Core parameters
  // ───────────────────────────────────────────────
  let content = params.src || params.content || "";
  content = content.replace(/^["'`](.*)["'`]$/, "$1");

  let style = params.style || "";
  style = style.replace(/^["'`](.*)["'`]$/, "$1");

  const targetId = params.target || null;
  const offsetX = Number(params.offsetX || 0);
  const offsetY = Number(params.offsetY || 0);
  const order = (params.order || "seq").replace(/^["'`](.*)["'`]$/, "$1");
  const mode = (params.mode || "line").replace(/^["'`](.*)["'`]$/, "$1");

  // ───────────────────────────────────────────────
  // 2️⃣ Timing ranges
  // ───────────────────────────────────────────────
  function parseRange(val, fallback) {
    if (!val) return [fallback, fallback];
    const cleaned = val.replace(/^["'`](.*)["'`]$/, "$1");
    const parts = cleaned.split(/[-,]/).map(Number).filter(v => !isNaN(v));
    return parts.length === 2 ? [parts[0], parts[1]] : [parts[0] ?? fallback, parts[0] ?? fallback];
  }

  const [durMin, durMax]   = parseRange(params.dur,   2);
  const [gapMin, gapMax]   = parseRange(params.gap,   0);
  const [holdMin, holdMax] = parseRange(params.hold,  0);

  // ───────────────────────────────────────────────
  // 3️⃣ Adaptive fade system (absolute or % of dur)
  // ───────────────────────────────────────────────
  let fadeParam = params.fade ? params.fade.replace(/^["'`](.*)["'`]$/, "$1") : null;
  let fadePercent = 0.25; // default 25%
  let fadeTimeBase = null;
  if (fadeParam) {
    if (fadeParam.endsWith("%")) {
      fadePercent = Number(fadeParam.replace("%", "")) / 100;
    } else {
      fadeTimeBase = Number(fadeParam); // absolute in ms
    }
  }

  // ───────────────────────────────────────────────
  // 4️⃣ Load and split text content
  // ───────────────────────────────────────────────
  let units = [content];
  if (content.match(/\.txt$/)) {
    const filePath = `${window.textDir}${content}`;
    try {
      const resp = await fetch(filePath);
      const data = await resp.text();
      if (mode === "word") {
        units = data.split(/\s+/).filter(Boolean);
      } else if (mode === "char") {
        units = data.split("");
      } else {
        units = data.split(/[\r\n;]+/).filter(Boolean);
      }
    } catch (err) {
      console.warn(`[cueText] ⚠️ Failed to load ${filePath}`, err);
      units = [`[Missing file: ${content}]`];
    }
  } else {
    if (mode === "word") {
      units = content.split(/\s+/).filter(Boolean);
    } else if (mode === "char") {
      units = content.split("");
    } else {
      units = content.split(/[\r\n;]+/).filter(Boolean);
    }
  }

  // ───────────────────────────────────────────────
  // 5️⃣ Create overlay
  // ───────────────────────────────────────────────
  const div = document.createElement("div");
  div.classList.add("cue-text-overlay");
div.style.cssText = `
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 1.2em;
  max-width: 70vw;
  text-align: center;
  opacity: 0;
  transition: opacity 0.3s ease;
`;
div.style.cssText += style;  // ✅ apply custom overrides last

  document.body.appendChild(div);

  // Position near cue or target if available
  let placed = false;
  if (targetId) {
    const target = document.getElementById(targetId);
    if (target) {
      const box = target.getBoundingClientRect();
      div.style.position = "absolute";
      div.style.left = `${box.x + offsetX}px`;
      div.style.top = `${box.y + offsetY}px`;
      div.style.transform = "translate(0,0)";
      placed = true;
    }
  }
  if (!placed && cueElement) {
    const box = cueElement.getBoundingClientRect();
    div.style.position = "absolute";
    div.style.left = `${box.x + offsetX}px`;
    div.style.top = `${box.y + offsetY}px`;
    div.style.transform = "translate(0,0)";
  }

  // ───────────────────────────────────────────────
  // 6️⃣ Helper: cross-fade per line
  // ───────────────────────────────────────────────
  const crossFadeLine = async (newText, duration, pause) => {
    const fadeMs = fadeTimeBase ?? (fadePercent * duration * 1000);
    const fadeApplied = Math.max(50, Math.min(fadeMs, duration * 1000 * 0.8));

    // fade out
    div.style.transition = `opacity ${fadeApplied}ms ease`;
    div.style.opacity = 0;
    await new Promise(r => setTimeout(r, fadeApplied));

    // blank gap
    if (pause > 0) await new Promise(r => setTimeout(r, pause * 1000));

    // fade in new text
    div.textContent = newText;
    div.style.opacity = 1;
    await new Promise(r => setTimeout(r, duration * 1000));
  };

  // ───────────────────────────────────────────────
  // 7️⃣ Playback loop
  // ───────────────────────────────────────────────
  (async () => {
    const loopForever = order === "rnd";
    if (loopForever) {
      console.log(`[cueText] 🎲 Starting continuous random ${mode}-sequence`);
      while (true) {
        // shuffle
        for (let i = units.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [units[i], units[j]] = [units[j], units[i]];
        }

        for (const unit of units) {
          const dur = durMin + Math.random() * (durMax - durMin);
          const gap = gapMin + Math.random() * (gapMax - gapMin);
          await crossFadeLine(unit.trim(), dur, gap);
        }
      }
    } else {
      // sequential one-pass
      for (const unit of units) {
        const dur = durMin + Math.random() * (durMax - durMin);
        const gap = gapMin + Math.random() * (gapMax - gapMin);
        await crossFadeLine(unit.trim(), dur, gap);
      }

      // final hold
      const finalHold = holdMin + Math.random() * (holdMax - holdMin);
      if (finalHold > 0) {
        await new Promise(r => setTimeout(r, finalHold * 1000));
        div.style.transition = `opacity 400ms ease`;
        div.style.opacity = 0;
        setTimeout(() => div.remove(), 400);
      } else {
        div.addEventListener("click", () => {
          div.style.transition = `opacity 400ms ease`;
          div.style.opacity = 0;
          setTimeout(() => div.remove(), 400);
        });
      }
    }
  })();
}





function fadeAndRemove(el) {
    el.style.opacity = 0;
    setTimeout(() => el.remove(), 600);
}
