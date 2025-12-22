// ------------------------------------------------------------
// oscillaPropagate.js
// ------------------------------------------------------------
// Group-level macro expansion for Oscilla DSL.
//
// Supports:
//   propagate(
//     osc(freq:${1}, trig:edge),
//     scale(values:[1,1.2,1], dur:${2}),
//     rnd(300,800),
//     rnd(2,6)
//   )
//
// Behaviour:
//   • Multiple cue templates per child
//   • rnd(...) and numbers are compile-time expressions ONLY
//   • Exactly ONE uid per child, shared across cues
//   • Space-separated cue IDs (parser-safe)
//   • Nested propagate(...) supported (multi-pass)
// ------------------------------------------------------------


// ------------------------------------------------------------
// Expression evaluator (compile-time only)
// ------------------------------------------------------------
function evaluateExpr(rawExpr) {
  const expr = String(rawExpr).trim();

  // rnd([a,b,c])
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

  // fallback literal
  return expr;
}


// ------------------------------------------------------------
// Split top-level args (comma-safe with nesting)
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
// Placeholder expansion: ${1}, ${2}, ...
// Each occurrence re-evaluates rnd(...)
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
// Cue template detection
// ------------------------------------------------------------
// IMPORTANT:
//   • osc(...), scale(...), rotate(...), o2p(...), propagate(...)
//     → templates
//   • rnd(...) → expression ONLY (never emitted)
// ------------------------------------------------------------
function isCueTemplate(str) {
  return (
    /^[a-zA-Z_][a-zA-Z0-9_-]*\s*\(/.test(str) &&
    !str.startsWith("rnd(")
  );
}


// ------------------------------------------------------------
// Main propagate macro
// ------------------------------------------------------------
export function propagate(svgRoot) {
  if (!svgRoot) return;

  let expandedSomething;

  // 🔁 Multi-pass expansion to support nested propagate(...)
  do {
    expandedSomething = false;

    const groups = svgRoot.querySelectorAll('[id^="propagate("]');
    if (!groups.length) return;

    console.info(`[propagate] Found ${groups.length} groups`);

    groups.forEach((group, groupIndex) => {
      const id = group.id;
      const match = id.match(/^propagate\((.*)\)$/s);
      if (!match) return;

      expandedSomething = true;

      const inner = match[1];
      const parts = splitTopLevelArgs(inner);
      if (!parts.length) return;

      // Separate cue templates from argument expressions
      const templates = parts.filter(isCueTemplate);
      const argExprs  = parts.filter(p => !isCueTemplate(p));

      const children = Array.from(group.children);
      if (!children.length) {
        console.warn(`[propagate] ⚠️ No children inside group ${id}`);
        return;
      }

      children.forEach((child, i) => {
        // 1) Expand placeholders for each cue
        const expandedCues = templates.map(tpl =>
          applyPlaceholders(tpl, argExprs)
        );

        // 2) One UID per child (shared across cues)
        const uid = `prop_${groupIndex}_${i}`;

        // 3) Inject uid into each cue
        const withUid = expandedCues.map(cue => {
          if (/uid\s*:/.test(cue)) {
            return cue.replace(
              /uid\s*:\s*([A-Za-z0-9_-]+)/,
              (_, base) => `uid:${base}_${i}`
            );
          }
          return cue.replace(/\)$/, `, uid:${uid})`);
        });

        // 4) Assign final space-separated ID
        child.id = withUid.join(" ");

        console.debug(
          `[propagate] #${i} → id="${child.id}"`
        );
      });

      // Clean up macro ID after expansion
      group.removeAttribute("id");
    });

  } while (expandedSomething);
}


// ------------------------------------------------------------
// Global exposure (legacy compatibility)
// ------------------------------------------------------------
if (typeof window !== "undefined") {
  window.propagate = propagate;
}
