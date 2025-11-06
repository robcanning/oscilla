

// Rehearsal mark logic ////////////////////////////////////////////////////////

/**
* ✅ Dynamically generates and updates rehearsal mark buttons.
* - Clears existing buttons before creating new ones to prevent duplication.
* - Sorts rehearsal marks by position to maintain correct order in the UI.
* - Ensures buttons correctly trigger `jumpToRehearsalMark()` when clicked.
*/
// Global variables
//  let rehearsalMarks = {};
let sortedMarks = []; // ✅ Now globally available sorted marks
//  let cues = [];

/**
* ✅ Dynamically generates and updates rehearsal mark buttons.
*/
// Global variables

/**
* ✅ Dynamically generates and updates rehearsal mark buttons.
*/
let lastRenderedMarks = "";

export const createRehearsalMarkButtons = () => {
  console.log("[DEBUG] Creating rehearsal mark buttons...");

  const container = document.getElementById("rehearsal-mark-container");
  if (!container) {
    console.error("[ERROR] Rehearsal mark container not found.");
    return;
  }

  const markEntries = Object.entries(rehearsalMarks);
  if (markEntries.length === 0) {
    console.warn("[WARNING] No rehearsal marks found.");
    return;
  }

  // ✅ Convert rehearsalMarks to a string for comparison
  const currentMarks = JSON.stringify(markEntries);
  if (currentMarks === lastRenderedMarks) {
    console.log("[DEBUG] No changes in rehearsal marks. Skipping re-render.");
    return;
  }

  // ✅ Save the current state to prevent unnecessary re-renders
  lastRenderedMarks = currentMarks;

  container.innerHTML = ""; // ✅ Clear existing buttons only when needed

  // ✅ Sort marks by X position **(Global Update)**
  markEntries.sort((a, b) => a[1].x - b[1].x);
  sortedMarks = markEntries.map(([mark]) => mark); // ✅ Store globally

  console.log("[DEBUG] 🎭 Final Sorted Rehearsal Marks:", sortedMarks);

  let rowContainer = null;
  const buttonsPerRow = 4;

  markEntries.forEach(([mark, position], index) => {
    if (index % buttonsPerRow === 0) {
      rowContainer = document.createElement("div");
      rowContainer.classList.add("rehearsal-row");
      container.appendChild(rowContainer);
    }

    const button = document.createElement("button");
    button.textContent = mark;
    button.classList.add("rehearsal-button");
    button.addEventListener("click", () => jumpToRehearsalMark(mark));

    rowContainer.appendChild(button);
  });

  console.log("[DEBUG] ✅ Rehearsal mark buttons created successfully.");
};

/**
* ✅ Opens the rehearsal mark popup.
*/
const openRehearsalPopup = () => {
  console.log("[DEBUG] Opening rehearsal mark popup...");

  const popup = document.getElementById("rehearsal-popup");

  if (!popup) {
    console.error("[ERROR] Rehearsal popup not found.");
    return;
  }

  if (sortedMarks.length === 0) {
    console.warn("[DEBUG] No rehearsal marks found. Popup will not be shown.");
    return;
  }

  popup.classList.remove("hidden");
  popup.style.display = "flex";

  console.log("[DEBUG] ✅ Rehearsal mark popup opened.");
};

/**
* Close popup function.
*/
const closeRehearsalPopup = () => {
  document.getElementById("rehearsal-popup").classList.add("hidden");
};

//  Make it globally accessible
window.closeRehearsalPopup = closeRehearsalPopup;

//  Allow opening with "R" key
document.addEventListener("keydown", (event) => {
  if (event.key.toUpperCase() === "R") {
    openRehearsalPopup();
  }
});
window.jumpToRehearsalMark = function (mark) {
  const entry = rehearsalMarks[mark];
  if (!entry) {
    console.error(`[jumpToRehearsalMark] Mark "${mark}" not found.`);
    return;
  }

  //  Temporarily disable cue triggers
  window.suppressCueTriggers = true;

  //  Stop playback *always* during jump
  window.isPlaying = false;
  window.animationPaused = true;

  //  Teleport playhead without scrolling through cues
  window.playheadX = entry.x;
  scrollToPlayheadVisual?.();
  window.lastAnimationFrameTime = null;

  //  Reset cue-edge tracking
  window._prevCueLefts = new Map();
  window._cueInsideState = new Map();
  window.triggeredCues = new Set();

  //  Sync across clients
  if (window.socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "jump", playheadX: entry.x }));
  }

  //  Re-enable cues only after DOM settles
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.suppressCueTriggers = false;

      // ✅ Explicit final resume logic only
      if (window._resumeAfterJump === true) {
        window.animationPaused = false;
        window.isPlaying = true;
        window.startPlayback?.();
      } else {
        window.animationPaused = true;
        window.isPlaying = false;
      }

      window._resumeAfterJump = null;
    });
  });
};




window.jumpToRehearsalMark = jumpToRehearsalMark;


let currentIndex = 0; // Track the current rehearsal mark index

document.addEventListener('keydown', (event) => {
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return; // Only handle up/down keys

  if (sortedMarks.length === 0) {
    console.warn("[WARNING] No rehearsal marks available for navigation.");
    return;
  }

  // console.log(`\n[DEBUG] Key Pressed: ${event.key}`);
  // console.log(`[DEBUG] Current Index Before Move: ${currentIndex} (${sortedMarks[currentIndex]})`);
  // console.log(`[DEBUG] Currentwindow.playheadX: ${window.playheadX}`);

  // 🔹 Move Up or Down in the Index Directly
  if (event.key === "ArrowUp" && currentIndex < sortedMarks.length - 1) {
    currentIndex++;
  } else if (event.key === "ArrowDown" && currentIndex > 0) {
    currentIndex--;
  } else {
    console.log("[DEBUG] Already at the first or last rehearsal mark.");
    return;
  }

  let nextMark = sortedMarks[currentIndex];

  console.log(`[DEBUG] Jumping to: ${nextMark} (Index: ${currentIndex})`);
  // console.log(`[DEBUG] Next Mark X Position: ${rehearsalMarks[nextMark].x}`);

  // 🔹 Ensurewindow.playheadX Updates Properly
  window.playheadX = rehearsalMarks[nextMark].x + 1; // Small offset to prevent snapping back
  jumpToRehearsalMark(nextMark);

  console.log(`[DEBUG] Updatedwindow.playheadX: ${window.playheadX}`);
});





/**
* ✅ Fast-forward & Rewind Buttons (Now using the fixed index approach)
*/

document.getElementById('fast-forward-button').addEventListener('click', () => {
  if (sortedMarks.length === 0) {
    console.warn("[WARNING] No rehearsal marks available for navigation.");
    return;
  }

  console.log(`\n[DEBUG] Fast Forward Clicked`);
  console.log(`[DEBUG] Current Index Before Move: ${currentIndex} (${sortedMarks[currentIndex]})`);

  // Move up in the index directly
  if (currentIndex < sortedMarks.length - 1) {
    currentIndex++;
  } else {
    console.log("[DEBUG] Already at the last rehearsal mark.");
    return;
  }

  let nextMark = sortedMarks[currentIndex];

  console.log(`[DEBUG] Jumping to: ${nextMark} (Index: ${currentIndex})`);
  console.log(`[DEBUG] Next Mark X Position: ${rehearsalMarks[nextMark].x}`);

  // Updatewindow.playheadX properly to prevent snapping issues
  window.playheadX = rehearsalMarks[nextMark].x + 1; // Small offset to prevent looping
  jumpToRehearsalMark(nextMark);

  console.log(`[DEBUG] Updatedwindow.playheadX: ${window.playheadX}`);
});

document.getElementById('fast-rewind-button').addEventListener('click', () => {
  if (sortedMarks.length === 0) {
    console.warn("[WARNING] No rehearsal marks available for navigation.");
    return;
  }

  console.log(`\n[DEBUG] Fast Rewind Clicked`);
  console.log(`[DEBUG] Current Index Before Move: ${currentIndex} (${sortedMarks[currentIndex]})`);

  // Move down in the index directly
  if (currentIndex > 0) {
    currentIndex--;
  } else {
    console.log("[DEBUG] Already at the first rehearsal mark.");
    return;
  }

  let nextMark = sortedMarks[currentIndex];

  console.log(`[DEBUG] Jumping to: ${nextMark} (Index: ${currentIndex})`);
  console.log(`[DEBUG] Next Mark X Position: ${rehearsalMarks[nextMark].x}`);

  // Updatewindow.playheadX properly
  window.playheadX = rehearsalMarks[nextMark].x + 1;
  jumpToRehearsalMark(nextMark);

  console.log(`[DEBUG] Updatedwindow.playheadX: ${window.playheadX}`);
});

//////// END OF REHEARSAL MARK LOGIC ///////////////////////////////////////////

// window.rehearsalMarks = rehearsalMarks;








// Set this to true for debugging
const debugMode = true;

/**
* Extracts rehearsal marks and cue positions from the score SVG.
* Converts their positions to absolute coordinates for accurate playback control.
* Calls `preloadSpeedCues()` to ensure speed cues are available from the start.
* Logs detailed debug information for troubleshooting position and scaling issues.
*/

// Global variables to store the extracted positions
let rehearsalMarks = {};
let cues = [];
let speedCueMap = []; // ✅ Ensures speed cues are tracked globally

export const extractScoreElements = (svgElement) => {
  if (!svgElement) {
    console.error("[ERROR] extractScoreElements called without a valid SVG element.");
    return;
  }

  console.log("[DEBUG] 🔍 Extracting rehearsal marks and cues from SVG.");

  let newRehearsalMarks = {}; // ✅ Store new extracted marks to prevent unnecessary resets
  let newCues = [];

  // ✅ Select all relevant elements
  const elements = svgElement.querySelectorAll(
    "[id^='rehearsal_'], [id^='cue'], [id^='anchor-'], [id^='label-']"
  );
  if (elements.length === 0) {
    console.warn("[WARNING] No rehearsal marks or cues found in SVG.");
    return;
  }

  elements.forEach((element) => {
    const bbox = element.getBBox();
    const matrix = element.getCTM();
    let absoluteX = bbox.x;
    if (matrix) {
      absoluteX += matrix.e;
    }

    if (element.id.startsWith("rehearsal_")) {
      const id = element.id.replace("rehearsal_", "");
      newRehearsalMarks[id] = { x: absoluteX };
      // console.log(`[DEBUG] 🎯 Rehearsal Mark Stored: ${id}, Position: (${absoluteX})`);
    } else if (element.id.startsWith("cue") || element.id.startsWith("s_") || element.id.startsWith("anchor-")) {
      // console.log(`[DEBUG] Processing cue: ${element.id}`);
      newCues.push({ id: element.id, x: absoluteX, width: bbox.width });
      // console.log(`[DEBUG] 🎯 Cue Stored: ${element.id}, X: ${absoluteX}, Width: ${bbox.width}`);
    }
  });

  // ✅ Update global variables only if new marks are found
  if (Object.keys(newRehearsalMarks).length > 0) {
    rehearsalMarks = newRehearsalMarks;
    // console.log("[DEBUG] ✅ Rehearsal marks updated.");
    // ✅ Store sorted rehearsal marks globally for all handlers to use

    if (Object.keys(newRehearsalMarks).length > 0) {
      rehearsalMarks = Object.fromEntries(
        Object.entries(newRehearsalMarks).sort((a, b) => a[1].x - b[1].x)
      );

      // console.log("[DEBUG] ✅ Global `rehearsalMarks` sorted:", rehearsalMarks);
    }

    window.sortedMarks = Object.entries(rehearsalMarks)
      .sort((a, b) => a[1].x - b[1].x)
      .map(([mark]) => mark);

    // console.log("[DEBUG] 🎭 Final sorted rehearsal marks:", sortedMarks);

  }

  if (newCues.length > 0) {
    cues = newCues;
    console.log("[DEBUG] ✅ Cues updated.");
  }

  // ✅ Only set `speedCueMap` if it's empty (first-time loading)
  if (speedCueMap.length === 0) {
    console.log("[DEBUG] Loading speed cues for the first time.");

    elements.forEach((element) => {
      if (element.id.startsWith("cueSpeed_")) {
        const bbox = element.getBBox();
        const matrix = element.getCTM();
        let absoluteX = bbox.x;
        if (matrix) {
          absoluteX += matrix.e;
        }

        const match = element.id.match(/cueSpeed_([\d.]+)/);
        if (match) {
          const speedValue = parseFloat(match[1]);
          speedCueMap.push({ position: absoluteX, multiplier: speedValue });
          // console.log(`[DEBUG] Stored speed cue -> Position: ${absoluteX}, Speed: ${speedValue}`);
        }
      }
    });

    // ✅ Ensure `speedCueMap` is always sorted for correct lookups
    speedCueMap.sort((a, b) => a.position - b.position);
    console.log("[DEBUG] Final sorted speed cues:", speedCueMap);
  }





  // ✅ Defer button creation until the SVG layout is fully ready
  if (Object.keys(rehearsalMarks).length > 0) {
    console.log("[extractScoreElements] ⏳ Deferring rehearsal mark button creation until next paint frame...");
    requestAnimationFrame(() => {

      createRehearsalMarkButtons();
      console.log("[extractScoreElements] ✅ Rehearsal mark buttons created after layout stabilization.");
    });
  }
  // extractScoreElements(svgElement);


  const newCueIds = new Set(newCues.map(c => c.id));

  for (const existingCue of window.cues) {
    newCueIds.delete(existingCue.id); // Keep only truly new cues
  }

  const filteredNewCues = newCues.filter(c => newCueIds.has(c.id) && c.element);
  if (filteredNewCues.length < newCues.length) {
    console.warn(`[extractScoreElements] ⚠️ Skipped ${newCues.length - filteredNewCues.length} newCues without element`);
  }

  window.cues.push(...filteredNewCues);


};

//////  end of extract score elements  //////////////////////////////////////

export async function preloadSvgGroups() {
  window.groupRegistry = window.groupRegistry || {};

  const svgFiles = window.allSvgFiles || []; // ← populated by your page manifest or directory scan

  for (const file of svgFiles) {
    try {
      const response = await fetch(file);
      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const groups = doc.querySelectorAll('g[id^="group-"], g[id^="menu-"], g[id^="ui-"]');

      groups.forEach(g => {
        const id = g.id.replace(/^group-|^menu-|^ui-/, "");
        window.groupRegistry[id] = g.cloneNode(true);
        console.log(`[groupRegistry] Preloaded group "${id}" from ${file}`);
      });
    } catch (err) {
      console.warn(`[groupRegistry] ⚠️ Failed to preload ${file}: ${err}`);
    }
  }

  console.log(`[groupRegistry] ✅ Preloaded ${Object.keys(window.groupRegistry).length} reusable groups`);
}




/**
 * propagate(svgRoot)
 * ------------------------------------------------------------
 * Generalised group-level operator for Oscilla microsyntax with
 * per-element parameter substitution.
 *
 * Usage (in SVG):
 *   <g id="propagate(s(rnd(10x0.2-1.8x))_mode(loop)_seqdur($1)_ease(step)_uid(123), rnd(0.4,3.0))">
 *     <circle ... />
 *     <circle ... />
 *   </g>
 *
 * Behaviour:
 *   - Detects <g> elements whose IDs start with "propagate(".
 *   - Extracts the first argument as a microsyntax template
 *     (e.g., any Oscilla animation or cue definition).
 *   - Treats subsequent comma-separated arguments as expressions
 *     (supports rnd(min,max), numeric literals, etc.).
 *   - For each child inside the group:
 *       • Evaluates all argument expressions individually so each
 *         child receives unique random values.
 *       • Substitutes placeholders ($1, $2, …) in the template
 *         with those evaluated results.
 *       • Appends a unique _uid(base_index) suffix to the ID.
 *   - Assigns the expanded ID string to each child element,
 *     leaving the parent group untouched.
 */
export function propagate(svgRoot) {
  const groups = svgRoot.querySelectorAll('[id^="propagate("]');
  if (!groups.length) return;

  console.info(`[propagate] Found ${groups.length} groups to process`);

  groups.forEach((group, groupIndex) => {
    const id = group.id;

    // Extract the full contents inside propagate(...)
    const match = id.match(/^propagate\((.*)\)$/);
    if (!match) return;

    const inner = match[1];
    const parts = [];
    let depth = 0, current = '';

    // Split on commas that are not inside parentheses
    for (const ch of inner) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());

    const template = parts[0];
    const argExprs = parts.slice(1);
    const uidMatch = template.match(/_uid\((.*?)\)/);
    const baseUID = uidMatch ? uidMatch[1] : `${groupIndex}`;

    const children = Array.from(group.children);
    if (!children.length) {
      console.warn(`[propagate] ⚠️ No children found in group ${id}`);
      return;
    }

    children.forEach((child, i) => {
      // Evaluate argument expressions separately for each child
      const argValues = argExprs.map(expr => evaluateExpr(expr));

      // Substitute $1, $2, ... in template with evaluated results
      let expanded = template;
      argValues.forEach((val, idx) => {
        expanded = expanded.replace(new RegExp(`\\$${idx + 1}`, 'g'), val);
      });

      // Replace or append _uid(...)
      const uniqueUID = `${baseUID}_${i}`;
      expanded = expanded.replace(/_uid\([^)]*\)/, `_uid(${uniqueUID})`);
      if (!expanded.includes('_uid(')) expanded += `_uid(${uniqueUID})`;

      child.id = expanded;
    });
  });
}

// parse for cuePropagate / propagate()
window.propagate = propagate;





/**
 * evaluateExpr(expr)
 * ------------------------------------------------------------
 * Evaluates argument expressions for propagate().
 * Supports:
 *   • rnd(a,b)        → random float/int depending on input type
 *   • rnd([a,b,c])    → random pick from list (numbers or strings)
 *   • rnd(x)          → random float 0–x
 *   • numeric literal → returned as number
 *   • text literal    → returned as string
 */
export function evaluateExpr(expr) {
  expr = expr.trim();

  const rndMatch = expr.match(/^rnd\((.*)\)$/);
  if (rndMatch) {
    const inner = rndMatch[1].trim();

    // --- Case 1: rnd([a,b,c]) → pick from list ---
    const listMatch = inner.match(/^\[(.*)\]$/);
    if (listMatch) {
      const parts = listMatch[1]
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);
      return parts[Math.floor(Math.random() * parts.length)];
    }

    // --- Case 2: rnd(a,b) → numeric range ---
    const range = inner.split(',').map(v => v.trim());
    if (range.length === 2) {
      const a = parseFloat(range[0]);
      const b = parseFloat(range[1]);
      const isInt = Number.isInteger(a) && Number.isInteger(b);
      const val = a + Math.random() * (b - a);
      return isInt ? Math.floor(val) : parseFloat(val.toFixed(3));
    }

    // --- Case 3: rnd(x) → 0–x float ---
    if (range.length === 1 && !isNaN(parseFloat(range[0]))) {
      const b = parseFloat(range[0]);
      const val = Math.random() * b;
      return parseFloat(val.toFixed(3));
    }

    console.warn(`[evaluateExpr] ⚠️ Unrecognised rnd() pattern: ${expr}`);
    return expr;
  }

  // --- Plain numeric literal ---
  const num = parseFloat(expr);
  if (!isNaN(num)) return num;

  // --- Fallback string literal ---
  return expr;
}




/**
 * preloadSpeedCues()
 * 
 * Scans the score for all cueSpeed elements and populates window.speedCueMap.
 * Cues must use ID format like `speed_1.2`, `speed_0.75`, etc.
 * Used to enable accurate speed restoration during seek or jump.
 */
export function preloadSpeedCues() {
  window.speedCueMap = [];

  const elements = document.querySelectorAll('[id^="cueSpeed("]');
  elements.forEach(el => {
    const match = el.id.match(/cueSpeed\((\d+(\.\d+)?)\)/);
    if (match) {
      const speed = parseFloat(match[1]);
      const bbox = el.getBBox();
      const pos = bbox.x + bbox.width / 2;
      if (!isNaN(speed)) {
        window.speedCueMap.push({ position: pos, multiplier: speed });
      }
    }
  });

  window.speedCueMap.sort((a, b) => a.position - b.position);
  console.log("[DEBUG] Preloaded speed cues:", window.speedCueMap);
}

window.preloadSpeedCues = preloadSpeedCues;



// /**
//  * Preload all reusable SVG groups (group-, menu-, ui-) from every page SVG
//  * in the active project's pagesDir.
//  */
async function preloadAllSvgGroups() {
  window.groupRegistry = {};
  const baseDir = window.pagesDir || "scores/pages/";
  const files = [];

  try {
    // 1️⃣ Request the directory listing
    const res = await fetch(baseDir);
    if (!res.ok) throw new Error(`Cannot list directory: ${baseDir}`);

    const html = await res.text();

    // 2️⃣ Extract all .svg links — supports relative or full hrefs
    const regex = /href=["']([^"']+\.svg)["']/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      let href = match[1].trim();

      // Normalize: if href already contains the full baseDir path, don't prepend it again
      if (href.startsWith(baseDir) || href.startsWith("/" + baseDir)) {
        files.push(href);
      } else if (href.startsWith("shared/") || href.startsWith("/shared/")) {
        files.push(href); // for shared/help pages
      } else if (!href.startsWith("http") && !href.startsWith("/")) {
        files.push(`${baseDir}${href}`);
      } else {
        files.push(href); // fallback for any other case
      }
    }

    console.log(`[groupRegistry] 📂 Found ${files.length} SVG pages in ${baseDir}`);
  } catch (err) {
    console.warn(`[groupRegistry] ⚠️ Directory listing failed for ${baseDir}:`, err);
  }


  // 3️⃣ Fallback — if no listing, assume at least one page
  if (files.length === 0) {
    files.push(`${baseDir}page0.svg`);
    console.warn(`[groupRegistry] ⚠️ Fallback to ${files[0]}`);
  }

  // 4️⃣ Fetch and parse each discovered SVG
  for (const file of files) {
    try {
      const res = await fetch(file);
      if (!res.ok) continue;

      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");

      const groups = doc.querySelectorAll('g[id^="group-"], g[id^="menu-"], g[id^="ui-"]');
      groups.forEach(g => {
        const id = g.id.replace(/^group-|^menu-|^ui-/, "").trim();
        const src = file.split("/").slice(-1)[0]; // short filename
        if (window.groupRegistry[id]) {
          console.warn(`[groupRegistry] ⚠️ Duplicate ID "${id}" (was in ${window.groupRegistry[id]._source}, now in ${src})`);
        }
        const clone = g.cloneNode(true);
        clone._source = src; // track origin for debugging
        window.groupRegistry[id] = clone;
        console.log(`[groupRegistry] ✅ Registered "${id}" from ${src}`);
      });

    } catch (err) {
      console.warn(`[groupRegistry] ⚠️ Skipped ${file}:`, err);
    }
  }

  console.log(`[groupRegistry] ✅ Total reusable groups: ${Object.keys(window.groupRegistry).length}`);
}

window.preloadAllSvgGroups = preloadAllSvgGroups;

//////////////////////////////////////////////////
//////////////////////////////////////////////////


// 🧩 Detect and inject cueGroup(...) elements present in scroll view
export async function autoInjectGroupsInScroll(svgElement) {
  if (!window.groupRegistry) {
    console.warn("[cueGroup] ⚠️ groupRegistry not ready yet");
    return;
  }

  const found = [...svgElement.querySelectorAll('[id^="cueGroup("]')];
  if (found.length === 0) {
    console.log("[cueGroup] ℹ️ No cueGroup() references found in scroll SVG");
    return;
  }

  console.log(`[cueGroup] 📋 Found ${found.length} cueGroup() elements in main score`);
  found.forEach(el => {
    const m = el.id.match(/cueGroup\(([^)]+)\)/);
    const groupName = m?.[1]?.trim();
    if (!groupName) return;

    if (window.groupRegistry[groupName]) {
      console.log(`[cueGroup] 🚀 Injecting group "${groupName}" in scroll mode`);
      handleGroupCue(`cueGroup(${groupName})`, { choice: groupName });
    } else {
      console.warn(`[cueGroup] ⚠️ Group "${groupName}" not found in registry`);
    }
  });
}

window.autoInjectGroupsInScroll = autoInjectGroupsInScroll;




export async function setupScore(svgElement) {

  if (!svgElement) {
    console.error("[scoreSetup] ❌ setupScore called without valid SVG element");
    return;
  }

  console.group("[scoreSetup] 🚀 Setting up score");


  await new Promise(r => requestAnimationFrame(r)); // 🕐 ensure final paint
  const startTime = performance.now();
  extractScoreElements(svgElement);
  const endTime = performance.now();
  console.log(`[scoreSetup] ⏳ extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
  console.log("[scoreSetup] ✅ Extracted Score Elements. Now Checking Sync...");

  // These global helpers can remain as-is
  if (typeof window.tryApplyPendingRepeatState === "function") {
    console.log("[scoreSetup] 🔄 Applying pending repeat state if available...");
    window.tryApplyPendingRepeatState();
  }

  if (window.pendingRepeatStateMap) {
    console.log("[scoreSetup] 🔁 Applying stored repeat state map after cues loaded.");
    window.handleRestoredRepeatState?.(window.pendingRepeatStateMap, window.cues);
    window.pendingRepeatStateMap = null;
  }

  preloadSpeedCues();



  // 🟢 Preload all reusable group definitions from pages/
  // preloadSvgGroups();
  await preloadAllSvgGroups();
  console.log("[setupScore] ✅ All group definitions preloaded.");



  if (typeof window.autoInjectGroupsInScroll === "function") {
    console.log("[cueGroup] 🧩 Running autoInjectGroupsInScroll() after group registry ready");
    const svgElement = document.querySelector("#scoreContainer svg");
    if (svgElement) window.autoInjectGroupsInScroll(svgElement);
  }









  console.groupEnd();
}

window.setupScore = setupScore;



