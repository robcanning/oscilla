
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

  const extractScoreElements = (svgElement) => {
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

    // ✅ Call button creation only if rehearsal marks exist
    if (Object.keys(rehearsalMarks).length > 0) {
      createRehearsalMarkButtons();
    }

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

  async function preloadSvgGroups() {
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
function propagate(svgRoot) {
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
function evaluateExpr(expr) {
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

