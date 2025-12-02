// oscillaPage.js
// Clean, AST-only, modern page overlay system for OscillaScore.
// -------------------------------------------------------------
// Exports:
//   - handlePageCue(ast, cueElement)
//   - handleAfterAction(ast)    (minimal / rarely used)
//
// Page navigation now uses ONLY the new CueDSL:
//     page(pageId)
//     page(Pseq([...],1))
//     page(Prand([...],3))
//     page(Pchoose([...]))
//
// Legacy forms (cuePage(...), cue:page(...)) still work but are
// routed into this handler by the dispatcher.
//
// Scrolling score is PAUSED on entry to page mode.
// Returning to scroll is done via nav(mode(scroll)).
//
// -------------------------------------------------------------

import { propagate } from "./oscillaPropagate.js";
import { animationAssign } from "./oscillaAnimation.js";
import { initializeObserver } from "./oscillaObserver.js";
// import { registerReuseBlocks, autoInjectUseBlocks } from "./reuse.js";
import { buildCueButtonsIn } from "./oscillaButton.js";
import { handleCueTrigger } from "./cues.js";


// =============================================================
// Minimal state
// =============================================================
window.pageState = window.pageState || {
    mode: "scroll",      // "scroll" | "page"
    current: null
};


// =============================================================
// Expand a pattern AST → array of { page, dur }
// =============================================================
function expandPattern(astNode) {
    if (!astNode) return [];

    // ----- Literal -----
    if (astNode.type === "Literal") {
        if (typeof astNode.value === "string") {
            return [{ page: astNode.value, dur: null }];
        }
        if (astNode.value && typeof astNode.value === "object") {
            return [{
                page: astNode.value.page,
                dur: astNode.value.dur ?? null
            }];
        }
        return [];
    }

    // ----- pageName:dur inside list -----
    if (astNode.type === "PageWithDur") {
        return [{
            page: astNode.page,
            dur: Number(astNode.dur) || null
        }];
    }

    // ----- Identifier -----
    if (astNode.type === "Identifier") {
        const name = astNode.image || astNode.value;
        if (!name) return [];
        return [{ page: name, dur: null }];
    }

    // ----- Pseq -----
    if (astNode.type === "Pseq") {
        const repeats = astNode.repeats === "inf"
            ? Infinity
            : Number(astNode.repeats) || 1;

        const list = astNode.list.flatMap(expandPattern);

        const out = [];
        for (let r = 0; r < repeats; r++) {
            out.push(...list);
            if (repeats === Infinity) break;  // prevent runaway
        }
        return out;
    }

    // ----- Pshuf -----
    if (astNode.type === "Pshuf") {
        const repeats = astNode.repeats === "inf"
            ? 1
            : Number(astNode.repeats) || 1;

        const base = astNode.list.flatMap(expandPattern);
        const shuffled = [...base].sort(() => Math.random() - 0.5);

        const out = [];
        for (let r = 0; r < repeats; r++) out.push(...shuffled);
        return out;
    }

    // ----- Pxrand -----
    if (astNode.type === "Pxrand") {
        const repeats = astNode.repeats === "inf"
            ? 1
            : Number(astNode.repeats) || 1;

        const base = astNode.list.flatMap(expandPattern);

        const out = [];
        for (let r = 0; r < repeats; r++) {
            const shuffled = [...base].sort(() => Math.random() - 0.5);
            out.push(...shuffled);
        }
        return out;
    }

    // ----- Prand -----
    if (astNode.type === "Prand") {
        const repeats = astNode.repeats === "inf"
            ? 1
            : Number(astNode.repeats) || 1;

        const base = astNode.list.flatMap(expandPattern);

        const out = [];
        for (let r = 0; r < repeats; r++) {
            out.push(base[Math.floor(Math.random() * base.length)]);
        }
        return out;
    }

    // ----- Pchoose -----
    if (astNode.type === "Pchoose") {
        const base = astNode.list.flatMap(expandPattern);
        const idx = Math.floor(Math.random() * base.length);
        return [base[idx]];
    }

    return [];
}

// =============================================================
// Internal page renderer — FULL modern pipeline
// =============================================================
async function showPageOverlay(pageId, durSeconds = null) {
    console.group(`[Page] ▶ showPageOverlay("${pageId}")`);

    // ---------------------------------------------------------
    // Pause scrolling score (ALWAYS when showing a page)
    // ---------------------------------------------------------
    if (window.isPlaying) {
        console.log("[Page] ⏸ Pausing scrolling score.");
        window.pausePlayback?.();
        window.isPlaying = false;
    }

    // Track local page mode
    window.pageState.mode = "page";
    window.pageState.current = pageId;

    // ---------------------------------------------------------
    // DOM containers
    // ---------------------------------------------------------
    const container = document.getElementById("singlePage-container");
    const content = document.getElementById("singlePage-content");
    const countdown = document.getElementById("singlePage-countdown");

    if (!container || !content || !countdown) {
        console.error("[Page] ❌ Missing page overlay DOM elements.");
        console.groupEnd();
        return;
    }

    container.classList.remove("hidden");
    container.style.display = "flex";
    container.style.opacity = "1";
    content.innerHTML = "";
    countdown.innerHTML = "";

    // ---------------------------------------------------------
    // Load SVG file
    // ---------------------------------------------------------
    if (!window.pagesDir) {
        console.error("[Page] ❌ Missing pagesDir — project not loaded.");
        console.groupEnd();
        return;
    }

    const path = `${window.pagesDir}${pageId}.svg`;
    console.log("[Page] Loading:", path);

    let text;
    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
    } catch (err) {
        console.error(`[Page] ❌ Failed to load page "${pageId}"`, err);
        console.groupEnd();
        return;
    }

    // Inject into DOM
    content.innerHTML = text;
    const svg = content.querySelector("svg");
    if (!svg) {
        console.error("[Page] ❌ SVG not found in loaded file.");
        console.groupEnd();
        return;
    }

    svg.id = "pageSVG";
    svg.classList.add("oscilla-page");

    // ---------------------------------------------------------
    // ⭐ FULL MODERN INITIALIZER — SAME AS MAIN SVG
    // ---------------------------------------------------------
    // Important: pass flag to avoid resetting global score state
    console.log("[Page] 🔧 initializeSVG() pipeline (delayed)");

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (typeof window.initializeSVG === "function") {
                // EXACT SAME INIT PATH AS SCROLL MODE
                window.initializeSVG(svg);
            } else {
                console.error("[Page] ❌ initializeSVG() not found.");
            }
        });
    });

    // ---------------------------------------------------------
    // Cue Buttons inside page overlay
    // ---------------------------------------------------------
    window._activePageButtons?.forEach(btn => btn.remove?.());
    window._activePageButtons = buildCueButtonsIn(svg, content);
    console.log(`[Page] Built ${window._activePageButtons.length} cueButtons.`);

    // ---------------------------------------------------------
    // Countdown
    // ---------------------------------------------------------
    if (durSeconds && durSeconds > 0) {
        countdown.style.display = "block";
        countdown.textContent = durSeconds;

        await new Promise(resolve => {
            let t = durSeconds;
            const timer = setInterval(() => {
                t--;
                countdown.textContent = t;
                if (t <= 0) {
                    clearInterval(timer);
                    resolve();
                }
            }, 1000);
        });
    } else {
        countdown.style.display = "none";
    }

    console.groupEnd();
    return; // Return control to pattern sequence
}



// =============================================================
// MAIN HANDLER — ENTRY POINT FOR DISPATCHER
// =============================================================
export async function handlePageCue(ast, cueElement) {
    console.group("[cuePage] 🚀 handlePageCue (AST mode)");
    console.log("AST:", ast);

    // 1) Expand pattern
    const pages = expandPattern(ast.pattern).filter(x => x?.page);
    if (!pages.length) {
        console.warn("[cuePage] ⚠ No valid pages in pattern.");
        console.groupEnd();
        return;
    }

    // 2) Run each page sequentially
    for (const item of pages) {
        const pageId = item.page;
        const dur = item.dur ?? null;

        console.log(`[cuePage] ▶ Page "${pageId}" dur=${dur ?? "∞"}`);

        await showPageOverlay(pageId, dur);
    }

    console.log("[cuePage] ✔ Pattern finished");

    //  run after-action if present
if (ast.onCompletion) {
        console.log("[cuePage] ▶ Running after-action");
        handleAfterAction(ast);
    }


    console.groupEnd();
}


// =============================================================
// Minimal after-action handler (kept for future expansion)
// =============================================================
export function handleAfterAction(ast) {
    console.warn("[Page] 🔎 handleAfterAction CALLED:", ast);

    if (!ast?.onCompletion) {
        console.warn("[Page] ❌ No onCompletion found");
        return;
    }

    const control = ast.onCompletion.control;
    const arg = ast.onCompletion.arg;
    const target = ast.onCompletion.target;

    console.log(`[Page] after-action → ${control}(${arg}${target ? "@" + target : ""})`);

    handleCueTrigger(`nav(${arg}${target ? `@${target}` : ""})`);
}
