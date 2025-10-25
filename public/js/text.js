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

  // ── Helpers
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

  // ── Core params
  let content = (params.src || params.content || "").replace(/^["'`](.*)["'`]$/, "$1");
  let style   = (params.style || "").replace(/^["'`](.*)["'`]$/, "$1");
  const targetId = params.target || "center";
  const offsetX  = Number(params.offsetX || 0);
  const offsetY  = Number(params.offsetY || 0);
  const order    = (params.order || "seq").replace(/^["'`](.*)["'`]$/, "$1");
  const mode     = (params.mode  || "line").replace(/^["'`](.*)["'`]$/, "$1");
  const uid     = params.uid || Math.floor(Math.random() * 100000);

  // ── Ranges
  function parseRange(val, fallback) {
    if (!val) return [fallback, fallback];
    const cleaned = String(val).replace(/^["'`](.*)["'`]$/, "$1");
    const parts = cleaned.split(/[-,]/).map(Number).filter(v => !isNaN(v));
    return parts.length === 2
      ? [parts[0], parts[1]]
      : [parts[0] ?? fallback, parts[0] ?? fallback];
  }
  const [durMin,  durMax ] = parseRange(params.dur,  2);
  const [gapMin,  gapMax ] = parseRange(params.gap,  0);
  const [holdMin, holdMax] = parseRange(params.hold, 0);

  // ── Fade (absolute ms or % of dur)
  let fadeParam = params.fade ? String(params.fade).replace(/^["'`](.*)["'`]$/, "$1") : null;
  let fadePercent = 0.25; // default 25%
  let fadeTimeBase = null;
  if (fadeParam) {
    if (fadeParam.endsWith("%")) fadePercent = Number(fadeParam.replace("%", "")) / 100;
    else fadeTimeBase = Number(fadeParam);
  }

  // ── Loop control
  const loopParam = (params.loop || "0").toString().trim().toLowerCase();
  let loopCount = 0, infinite = false;
  if (loopParam === "inf" || loopParam === "infinite" || loopParam === "0") infinite = true;
  else loopCount = parseInt(loopParam, 10) || 0;

  // ── Build units [{text, dur|null, gap|null}]
  let units = [];
  const toUnits = (str) => {
    if (mode === "word") {
      return str.split(/\s+/).filter(Boolean).map(tok => {
        const parts = tok.split(":").map(p => p.trim());
        const text = parts[0];
        const dur  = parts[1] && !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1]) : null;
        const gap  = parts[2] && !isNaN(parseFloat(parts[2])) ? parseFloat(parts[2]) : null;
        return { text, dur, gap };
      });
    } else if (mode === "char") {
      return str.split("").map(ch => ({ text: ch, dur: null, gap: null }));
    } else {
      return str.split(/[\r\n;]+/).filter(Boolean).map(line => ({ text: line, dur: null, gap: null }));
    }
  };

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

  // ── Overlay
  const div = document.createElement("div");
  div.id = `cue-text-${uid}`;
  div.classList.add("cue-text-overlay");
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
    pointer-events: none;
    ${style}
  `;
  document.body.appendChild(div);

  // ── Position logic: target:self / target:center / explicit
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

  // ── Cross-fade ONE unit
  const crossFadeUnit = async (newText, duration) => {
    const fadeMs = fadeTimeBase ?? (fadePercent * duration * 1000);
    const fadeApplied = Math.max(50, Math.min(fadeMs, duration * 1000 * 0.8));

    div.style.transition = `opacity ${fadeApplied}ms ease`;
    void div.offsetHeight;
    div.style.opacity = 0;
    await wait(fadeApplied);

    div.textContent = newText;
    await nextFrame();
    div.style.transition = `opacity ${fadeApplied}ms ease`;
    void div.offsetHeight;
    div.style.opacity = 1;
    await wait(duration * 1000);

    div.style.transition = `opacity ${fadeApplied}ms ease`;
    void div.offsetHeight;
    div.style.opacity = 0;
    await wait(fadeApplied);
  };

  const fadeAndRemove = () => {
    div.style.transition = "opacity 400ms ease";
    void div.offsetHeight;
    div.style.opacity = 0;
    setTimeout(() => div.remove(), 420);
  };

  // ── Sequence players
  const playSequenceOnce = async () => {
    for (const unit of units) {
      const dur = (unit.dur ?? (durMin + Math.random() * (durMax - durMin)));
      const gap = (unit.gap ?? (gapMin + Math.random() * (gapMax - gapMin)));
      await crossFadeUnit(unit.text.trim(), dur);
      if (gap > 0) await wait(gap * 1000);
    }
  };

  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  // ── Playback
  (async () => {
    let currentLoop = 0;
    if (order === "rnd" || infinite) {
      while (true) {
        shuffleInPlace(units);
        await playSequenceOnce();
      }
    } else {
      do {
        await playSequenceOnce();
        currentLoop++;
      } while (loopCount > 0 && currentLoop < loopCount);

      const finalHold = holdMin + Math.random() * (holdMax - holdMin);
      if (finalHold > 0) {
        await wait(finalHold * 1000);
        fadeAndRemove();
      } else {
        div.addEventListener("click", fadeAndRemove);
        await wait(300);
        fadeAndRemove();
      }
    }
  })();
}





function fadeAndRemove(el) {
    el.style.opacity = 0;
    setTimeout(() => el.remove(), 600);
}
