// oscillaPropagate.js
// ------------------------------------------------------------
// Group-level macro expansion for Oscilla’s new DSL.
//
// Allows:
//   <g id="propagate(
//        scale(values:[1,2], seqdur:${1}, ease:0, uid:foo),
//        rnd([20,30,40])
//      )">
//      <circle ... />
//      <circle ... />
//   </g>
//
// Behaviour:
//   - TEMPLATE = first argument
//   - expr1, expr2, ... = subsequent arguments (rnd(), numbers, etc.)
//   - For EACH CHILD:
//        * substitute ${1}, ${2}, …
//          (each occurrence re-evaluates its expression → fresh rnd)
//        * apply unique uid:
//              if uid:foo  → uid:foo_0, uid:foo_1, …
// –              if no uid:  → append ", uid:prop_G_I"
//   - assign expanded ID to each child element
//
// This runs *before* the main Cue/Animation DSL parser.
// ------------------------------------------------------------

// ------------------------------------------------------------
// Simple expression evaluator for rnd(), numbers, lists.
// Replace with your central evaluator if desired.
// ------------------------------------------------------------
function evaluateExpr(rawExpr) {
  const expr = String(rawExpr).trim();

  // rnd([a,b,c]) → choose from list
  let m = expr.match(/^rnd\s*\(\s*\[(.+)\]\s*\)\s*$/);
  if (m) {
    const items = m[1].split(",").map(s => s.trim());
    const choice = items[Math.floor(Math.random() * items.length)];
    const num = Number(choice);
    return Number.isNaN(num) ? choice : num;
  }

  // rnd(min,max)
  m = expr.match(/^rnd\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)\s*$/);
  if (m) {
    const min = parseFloat(m[1]);
    const max = parseFloat(m[2]);
    return min + Math.random() * (max - min);
  }

  // plain number
  if (/^[+-]?\d*\.?\d+$/.test(expr)) {
    return parseFloat(expr);
  }

  // fallback: string literal
  return expr;
}

// ------------------------------------------------------------
// Split top-level args inside propagate(...)
// Handles nested () and [] so commas inside them are safe.
// ------------------------------------------------------------
function splitTopLevelArgs(inner) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const ch of inner) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

// ------------------------------------------------------------
// Substitute ${1}, ${2}, ... with per-occurrence evaluation
// ------------------------------------------------------------
function applyPlaceholders(template, argExprs) {
  let expanded = template;

  argExprs.forEach((expr, idx) => {
    const n = idx + 1;
    const re = new RegExp(`\\$\\{${n}\\}`, "g");

    expanded = expanded.replace(re, () => {
      const val = evaluateExpr(expr);
      return String(val);
    });
  });

  return expanded;
}

// ------------------------------------------------------------
// UID logic (new DSL only)
// ------------------------------------------------------------
// If uid:foo exists → becomes uid:foo_0, foo_1, ...
// If no uid → append ", uid:prop_g_i"
function applyUniqueUid(expanded, groupIndex, childIndex) {
  const uidRe = /uid\s*:\s*([A-Za-z0-9_\-]+)/;

  // Case 1: uid:VALUE exists → rename
  if (uidRe.test(expanded)) {
    return expanded.replace(uidRe, (_, val) => {
      return `uid:${val}_${childIndex}`;
    });
  }

  // Case 2: no uid present → append canonical uid
  const autoUid = `uid:prop_${groupIndex}_${childIndex}`;

  // If template already has parameters (contains "(" ), append with comma
  if (expanded.includes("(") && !expanded.endsWith("(")) {
    return `${expanded}, ${autoUid}`;
  }

  // Fallback: just append cleanly
  return `${expanded}, ${autoUid}`;
}

// ------------------------------------------------------------
// Main function
// ------------------------------------------------------------
export function propagate(svgRoot) {
  if (!svgRoot) return;

  const groups = svgRoot.querySelectorAll('[id^="propagate("]');
  if (!groups.length) return;

  console.info(`[propagate] Found ${groups.length} groups`);

  groups.forEach((group, groupIndex) => {
    const id = group.id;
    const match = id.match(/^propagate\((.*)\)$/s);
    if (!match) return;

    const inner = match[1];
    const parts = splitTopLevelArgs(inner);
    if (!parts.length) return;

    const template = parts[0];
    const argExprs = parts.slice(1);
    const children = Array.from(group.children);

    if (!children.length) {
      console.warn(`[propagate] ⚠️ No children inside group ${id}`);
      return;
    }

    children.forEach((child, i) => {
      // 1) placeholder expansion (fresh rnd each occurrence)
      let expanded = applyPlaceholders(template, argExprs);

      // 2) uid injection / uniquifying
      expanded = applyUniqueUid(expanded, groupIndex, i);

      // 3) assign final ID
      child.id = expanded;

      console.debug(
        `[propagate] #${i} → id="${child.id}"`
      );
    });
  });
}

// Expose globally so existing calls from app.js / cues.js continue to work
if (typeof window !== "undefined") {
  window.propagate = propagate;
}
