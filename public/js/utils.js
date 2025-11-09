// ============================================================
// reuseAlign.js
//
// Helper utilities for placing cloned <g> blocks at the position
// of placeholder objects in arbitrary nested SVG coordinate systems.
//
// This uses a robust screen-space alignment method:
//
// 1. Insert clone temporarily so getScreenCTM() & getBBox() are valid.
// 2. Strip transforms from clone → now in its own local geometry.
// 3. Measure clone and placeholder bboxes in *screen coordinates*.
// 4. Compute screen-space delta that aligns their visual anchors.
// 5. Convert this delta back into the parent group's coordinate system.
// 6. Apply a simple translate(...) to the clone.
// 7. Remove placeholder.
//
// This avoids all CTM composition pitfalls when templates were authored
// in global space and placeholders are located in deep nested groups.
//
// ============================================================


// Generate unique instance IDs
export function uniqueReuseId(base) {
  return `${base}__${Math.random().toString(36).slice(2, 8)}`;
}


// Remove all transform attributes from a group and its descendants
export function stripAllTransforms(root) {
  root.removeAttribute('transform');
  root.querySelectorAll('[transform]').forEach(n => n.removeAttribute('transform'));
}


// Compute screen-space bbox (important: getScreenCTM maps local coords → screen)
export function bboxInScreen(el) {
  const bb = el.getBBox();
  const m = el.getScreenCTM();
  if (!m) return { x: 0, y: 0, width: 0, height: 0 };

  const x0 = bb.x, y0 = bb.y;
  const x1 = bb.x + bb.width, y1 = bb.y + bb.height;

  const p00 = { x: m.a*x0 + m.c*y0 + m.e, y: m.b*x0 + m.d*y0 + m.f };
  const p11 = { x: m.a*x1 + m.c*y1 + m.e, y: m.b*x1 + m.d*y1 + m.f };

  return { x: p00.x, y: p00.y, width: p11.x - p00.x, height: p11.y - p00.y };
}


// Convert a screen-space translation vector → parent local coords
export function screenDeltaToParent(dx, dy, parent) {
  const Ms = parent.getScreenCTM();
  if (!Ms) return { dx: 0, dy: 0 };

  const Inv = Ms.inverse();
  const p0 = { x: Inv.e, y: Inv.f };
  const p1 = {
    x: Inv.a*dx + Inv.c*dy + Inv.e,
    y: Inv.b*dx + Inv.d*dy + Inv.f
  };
  return { dx: p1.x - p0.x, dy: p1.y - p0.y };
}


// Align clone to placeholder using top-left anchor (current system behavior)
export function alignCloneAtPlaceholder_TopLeft(clone, placeholder) {
  const parent = placeholder.parentNode;
  const bbPh = bboxInScreen(placeholder);
  const bbCl = bboxInScreen(clone);

  const dxScreen = bbPh.x - bbCl.x;
  const dyScreen = bbPh.y - bbCl.y;

  const { dx, dy } = screenDeltaToParent(dxScreen, dyScreen, parent);
  clone.setAttribute('transform', `matrix(1 0 0 1 ${dx} ${dy})`);
}


// ============================================================
// OPTIONAL ALTERNATE ALIGNMENT MODES (not active by default):
//
// 1) Center-aligned GUI blocks (if visually composed around center):
//
//   const dxScreen = (bbPh.x + bbPh.width/2) - (bbCl.x + bbCl.width/2);
//   const dyScreen = (bbPh.y + bbPh.height/2) - (bbCl.y + bbCl.height/2);
//
//   // Then convert dxScreen/dyScreen the same way.
//
// 2) Baseline or handle-based alignment could also be implemented,
//    depending on how GUI elements are authored.
//
// ============================================================


// ============================================================
// FUTURE IMPROVEMENT OPTIONS (NOT ENABLED):
//
// Option A) Normalize template coordinates at load time:
// ---------
// Convert <g id="reuse-X"> so it has:
//   - No transform
//   - Children repositioned into a consistent local origin
// This makes reuse blocks behave like “components”.
// Cost: one-time geometry rewrite.
//
// Option B) Cache flattened & origin-normalized copies:
// ---------
// If reuse blocks are used many times, we avoid repeated stripping/alignment.
//
// Option C) Inkscape extension to create canonical reuse blocks:
// ---------
// “Zero transform” utility that ensures the group’s origin corresponds to
// its visual top-left, making placement predictable.
//
// ============================================================
