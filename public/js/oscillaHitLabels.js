// oscillaHitLabels.js
// ============================================================
// Hit-circles for animation groups (rotate, scale, o2p, etc).
// Each animation gets a floating HTML circle that:
//   • is always clickable
//   • stays glued to geometric anchor (path start or midpoint)
//   • updates every frame using CTM transforms
//   • mirrors SVG element opacity (ghost, fadein, hidden)
// ============================================================

window._oscillaHitLabels = window._oscillaHitLabels || [];
window.oscillaShowHitLabels = true;

// ------------------------------------------------------------
// 0. Convert (localX, localY) in element coords → screen coords
// ------------------------------------------------------------
function localToScreen(el, x, y) {
    const svg = el.ownerSVGElement;
    if (!svg) return { x, y };

    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;

    const m = el.getScreenCTM();
    if (!m) return { x, y };

    const res = pt.matrixTransform(m);
    return { x: res.x, y: res.y };
}

// ------------------------------------------------------------
// 1. Flatten a shape into its "path-start" coordinate
// ------------------------------------------------------------
function flattenShapeStart(shape) {
    if (!shape) return null;
    const tag = shape.tagName.toLowerCase();

    if (tag === "circle") {
        const cx = parseFloat(shape.getAttribute("cx")) || 0;
        const cy = parseFloat(shape.getAttribute("cy")) || 0;
        const r = parseFloat(shape.getAttribute("r")) || 0;
        return { x: cx + r, y: cy };
    }

    if (tag === "ellipse") {
        const cx = parseFloat(shape.getAttribute("cx")) || 0;
        const cy = parseFloat(shape.getAttribute("cy")) || 0;
        const rx = parseFloat(shape.getAttribute("rx")) || 0;
        return { x: cx + rx, y: cy };
    }

    if (tag === "rect") {
        const x = parseFloat(shape.getAttribute("x")) || 0;
        const y = parseFloat(shape.getAttribute("y")) || 0;
        return { x, y };
    }

    if (tag === "line") {
        return {
            x: parseFloat(shape.getAttribute("x1")) || 0,
            y: parseFloat(shape.getAttribute("y1")) || 0
        };
    }

    if (tag === "polyline" || tag === "polygon") {
        const pts = shape.getAttribute("points");
        if (!pts) return null;
        const parts = pts.trim().split(/[\s,]+/);
        if (parts.length < 2) return null;
        return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
    }

    if (tag === "path") {
        try {
            const p = shape.getPointAtLength(0);
            return { x: p.x, y: p.y };
        } catch { return null; }
    }

    return null;
}

// ------------------------------------------------------------
// 2. New: TRUE PATH MIDPOINT (for scale hit-circles)
// ------------------------------------------------------------
function flattenShapeMidpoint(shape) {
    if (!shape) return null;
    const tag = shape.tagName.toLowerCase();

    // Path → sample via totalLength/2
    if (tag === "path") {
        try {
            const len = shape.getTotalLength();
            const p = shape.getPointAtLength(len / 2);
            return { x: p.x, y: p.y };
        } catch { return null; }
    }

    // Approximate midpoint for simple shapes
    const box = shape.getBBox();
    return {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2
    };
}

// ------------------------------------------------------------
// 3. Choose largest shape in group (rotate/scale/o2p anchor base)
// ------------------------------------------------------------
function chooseLargestShape(groupEl) {
    if (groupEl.tagName.toLowerCase() !== "g") return groupEl;

    let best = null;
    let bestArea = -1;

    const shapes = groupEl.querySelectorAll(
        "circle, ellipse, rect, line, polyline, polygon, path"
    );

    shapes.forEach(shape => {
        const b = shape.getBBox();
        const area = b.width * b.height;
        if (area > bestArea) {
            bestArea = area;
            best = shape;
        }
    });

    return best || groupEl;
}





// ------------------------------------------------------------
// 4A. Path-start for rotate + o2p
// ------------------------------------------------------------
function computePathStartScreenPosition(groupEl) {
    const shape = chooseLargestShape(groupEl);
    if (!shape) return null;

    const p = flattenShapeStart(shape);
    if (!p) return null;

    return localToScreen(shape, p.x, p.y);
}

// ------------------------------------------------------------
// 4B. Path-midpoint for scale
// ------------------------------------------------------------
function computePathMidScreenPosition(groupEl) {
    const shape = chooseLargestShape(groupEl);
    if (!shape) return null;

    const p = flattenShapeMidpoint(shape);
    if (!p) return null;

    return localToScreen(shape, p.x, p.y);
}

// ------------------------------------------------------------
// 5. CREATE HIT CIRCLE
// ------------------------------------------------------------
export function createHitLabel(groupEl, kind, uid, opts = {}) {
    const anchorMode = opts.anchorMode || "pathStart"; // "pathStart" | "midpoint"
    const color = opts.color || "red";

    const div = document.createElement("div");
    div.dataset.uid = uid;

    Object.assign(div.style, {
        position: "fixed",
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: color,
        zIndex: 2147483647,
        pointerEvents: "auto",
        left: "0px",
        top: "0px"
    });

    // First-frame opacity sync
    div.style.opacity = getComputedStyle(groupEl).opacity;

    div.addEventListener("click", e => {
        e.stopPropagation();
        groupEl.dispatchEvent(new Event("click", { bubbles: true }));
    });

    document.body.appendChild(div);

    const record = { groupEl, div, uid, anchorMode };
    window._oscillaHitLabels.push(record);

    updateHitCircle(record);
}


// ------------------------------------------------------------
// TRUE GEOMETRIC MIDPOINT (screen space)
// ------------------------------------------------------------
function computeObjectMidpointScreen(groupEl) {
    const box = groupEl.getBoundingClientRect();
    return {
        x: box.left + box.width / 2,
        y: box.top  + box.height / 2
    };
}


// ------------------------------------------------------------
// 6. UPDATE POSITION + OPACITY for one hit circle
// ------------------------------------------------------------
export function updateHitCircle(rec) {
    const { groupEl, div, anchorMode } = rec;
    if (!groupEl || !div) return;

    // 🔥 SYNC OPACITY WITH SVG ELEMENT
    try {
        const svgOpacity = parseFloat(getComputedStyle(groupEl).opacity/2);
        div.style.opacity = isNaN(svgOpacity) ? "1" : String(svgOpacity);
    } catch {
        div.style.opacity = "1";
    }

    // Compute anchor
    let pos = null;
   if (anchorMode === "followSizeMidPoint") {
    const box = groupEl.getBoundingClientRect();

    const radius = Math.max(box.width, box.height) / 2;
    const padding = 12; // extra ring padding
    const size = radius * 2 + padding;

    div.style.width  = `${size}px`;
    div.style.height = `${size}px`;

    // Convert midpoint to screen coords
    pos = {
        x: box.left + box.width / 2,
        y: box.top  + box.height / 2,
    };

    // STYLE: ring instead of filled circle
    div.style.background = "transparent";
    div.style.border = `1px solid ${rec.color || "purple"}`;
    div.style.borderRadius = "50%";

    // center the ring on object
    div.style.left = `${pos.x - size/2}px`;
    div.style.top  = `${pos.y - size/2}px`;
    return; // prevent fallback behaviour
}

else {
        pos = computePathStartScreenPosition(groupEl);
    }

    if (!pos) return;

    div.style.left = `${pos.x - 7}px`;
    div.style.top = `${pos.y - 7}px`;
}

// ------------------------------------------------------------
// 7. UPDATE ALL
// ------------------------------------------------------------
export function repositionAllHitLabels() {
    for (const rec of window._oscillaHitLabels) {
        updateHitCircle(rec);
    }
}

// ------------------------------------------------------------
// 8. GLOBAL SHOW/HIDE
// ------------------------------------------------------------
export function toggleHitLabels() {
    window.oscillaShowHitLabels = !window.oscillaShowHitLabels;
    const show = window.oscillaShowHitLabels;

    window._oscillaHitLabels.forEach(rec => {
        rec.div.style.opacity = show ? rec.div.style.opacity : "0";
        rec.div.style.pointerEvents = show ? "auto" : "none";
    });
}
