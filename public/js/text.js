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
  // Core parameters
  // ───────────────────────────────────────────────
  let content = params.content || "";
  content = content.replace(/^"(.*)"$/, "$1");
  let style = params.style || "";
  style = style.replace(/^["'`](.*)["'`]$/, "$1");

  const targetId = params.target || null;
  const offsetX = Number(params.offsetX || 0);
  const offsetY = Number(params.offsetY || 0);
  const randomSeq = Number(params.randomseq || 0) === 1;
  const fadeTime = 800;
  const mode = (params.mode || "line").replace(/^["'`](.*)["'`]$/, "$1");

  // ───────────────────────────────────────────────
  // Timing ranges
  // ───────────────────────────────────────────────
  const display = Number(params.display || 2);
  let dispMin = display, dispMax = display;
  if (params.displayrange) {
    const [min, max] = params.displayrange.replace(/^["'`](.*)["'`]$/, "$1").split(/[-,]/).map(Number);
    if (!isNaN(min) && !isNaN(max)) [dispMin, dispMax] = [min, max];
  }

  let pauseMin = 0, pauseMax = 0;
  if (params.pauserange) {
    const [min, max] = params.pauserange.replace(/^["'`](.*)["'`]$/, "$1").split(/[-,]/).map(Number);
    if (!isNaN(min) && !isNaN(max)) [pauseMin, pauseMax] = [min, max];
  }

  const hold = Number(params.hold || 0);
  let holdMin = hold, holdMax = hold;
  if (params.holdrange) {
    const [min, max] = params.holdrange.replace(/^["'`](.*)["'`]$/, "$1").split(/[-,]/).map(Number);
    if (!isNaN(min) && !isNaN(max)) [holdMin, holdMax] = [min, max];
  }

  // ───────────────────────────────────────────────
  // Load and split content
  // ───────────────────────────────────────────────
  let units = [content];
  if (content.startsWith("file:")) {
    const fileName = content.replace("file:", "").trim();
    const filePath = `${window.textDir}${fileName}`;
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
      units = [`[Missing file: ${fileName}]`];
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
  // Create overlay
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
    transition: opacity ${fadeTime}ms ease;
    ${style}
  `;
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
  // Helper: cross-fade
  // ───────────────────────────────────────────────
 const crossFadeLine = async (newText, duration, pause) => {
  // Fade out current text
  div.style.transition = `opacity ${fadeTime}ms ease`;
  div.style.opacity = 0;
  await new Promise(r => setTimeout(r, fadeTime));

  // Optional blank period before showing new text
  if (pause > 0) await new Promise(r => setTimeout(r, pause * 1000));

  // Fade in new text
  div.textContent = newText;
  div.style.opacity = 1;
  await new Promise(r => setTimeout(r, duration * 1000));
};

  // ───────────────────────────────────────────────
  // Playback loop
  // ───────────────────────────────────────────────
  (async () => {
    if (randomSeq) {
      console.log(`[cueText] 🎲 Starting continuous random ${mode}-sequence`);
      const pool = [...units];
      while (true) {
        // shuffle
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }

for (const unit of pool) {
  let duration = dispMin + Math.random() * (dispMax - dispMin);
  let pause = pauseMin + Math.random() * (pauseMax - pauseMin);
  await crossFadeLine(unit.trim(), duration, pause);
}

      }
    } else {
      // one-pass
      for (const unit of units) {
        let duration = dispMin + Math.random() * (dispMax - dispMin);
        let pause = pauseMin + Math.random() * (pauseMax - pauseMin);
        await crossFadeLine(unit.trim(), duration);
        await new Promise(r => setTimeout(r, pause * 1000));
      }
      // final hold
      let finalHold = holdMin + Math.random() * (holdMax - holdMin);
      if (finalHold > 0) {
        await new Promise(r => setTimeout(r, finalHold * 1000));
        div.style.transition = `opacity ${fadeTime}ms ease`;
        div.style.opacity = 0;
        setTimeout(() => div.remove(), fadeTime);
      } else {
        div.addEventListener("click", () => {
          div.style.transition = `opacity ${fadeTime}ms ease`;
          div.style.opacity = 0;
          setTimeout(() => div.remove(), fadeTime);
        });
      }
    }
  })();
}




function fadeAndRemove(el) {
    el.style.opacity = 0;
    setTimeout(() => el.remove(), 600);
}
