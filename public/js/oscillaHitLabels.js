// oscillaHitLabels.js
// ============================================================
// Hit-circles for animation objects (rotate/scale/o2p/etc)
// Each animation group gets a red circle drawn at the geometric
// *path start point* exactly like o2p does.
// Stays glued even while rotation/scale transforms run.
// ============================================================

window._oscillaHitLabels = window._oscillaHitLabels || [];
window.oscillaShowHitLabels = true;

// ============================================================
// 0. Helper: get full CTM → screen coordinates
// ============================================================
function localToScreen(el, x, y) {
    const svg = el.ownerSVGElement;
    if (!svg) return { x, y };

    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const screen = pt.matrixTransform(el.getScreenCTM());
    return { x: screen.x, y: screen.y };
}

// ============================================================
// 1. Helper: flatten SVG shapes into path-like logic
// (lightweight duplicate of o2p logic — per Option B)
// ============================================================
function flattenShapeToStartPoint(el) {
    const tag = el.tagName.toLowerCase();

    // ---- CIRCLE ----
    if (tag === "circle") {
        const cx = parseFloat(el.getAttribute("cx")) || 0;
        const cy = parseFloat(el.getAttribute("cy")) || 0;
        const r  = parseFloat(el.getAttribute("r")) || 0;
        // o2p convention: start point is (cx + r, cy)
        return { x: cx + r, y: cy };
    }

    // ---- ELLIPSE ----
    if (tag === "ellipse") {
        const cx = parseFloat(el.getAttribute("cx")) || 0;
        const cy = parseFloat(el.getAttribute("cy")) || 0;
        const rx = parseFloat(el.getAttribute("rx")) || 0;
        // o2p convention for ellipses: rightmost point
        return { x: cx + rx, y: cy };
    }

    // ---- RECT ----
    if (tag === "rect") {
        const x = parseFloat(el.getAttribute("x")) || 0;
        const y = parseFloat(el.getAttribute("y")) || 0;
        return { x, y };
    }

    // ---- LINE ----
    if (tag === "line") {
        const x1 = parseFloat(el.getAttribute("x1")) || 0;
        const y1 = parseFloat(el.getAttribute("y1")) || 0;
        return { x: x1, y: y1 };
    }

    // ---- POLYLINE / POLYGON ----
    if (tag === "polyline" || tag === "polygon") {
        const pts = el.getAttribute("points");
        if (!pts) return null;

        const first = pts.trim().split(/[\s,]+/);
        if (first.length < 2) return null;

        return { x: parseFloat(first[0]), y: parseFloat(first[1]) };
    }

    // ---- PATH ----
    if (tag === "path") {
        try {
            const len = el.getTotalLength();
            const p = el.getPointAtLength(0);
            return { x: p.x, y: p.y };
        } catch {
            return null;
        }
    }

    // Unsupported shape
    return null;
}

// ============================================================
// 2. Helper: if group, choose largest child shape
// ============================================================
function chooseBestChildShape(groupEl) {
    if (groupEl.tagName.toLowerCase() !== "g")
        return groupEl;

    let best = null;
    let bestArea = -1;

    const shapes = groupEl.querySelectorAll("circle, ellipse, rect, line, polyline, polygon, path");

    shapes.forEach(shape => {
        const box = shape.getBBox();
        const area = box.width * box.height;
        if (area > bestArea) {
            bestArea = area;
            best = shape;
        }
    });

    // Fallback: groupEl itself
    return best || groupEl;
}

// ============================================================
// 3. Compute anchor (path start) for any animation element
// ============================================================
function computeAnchorScreenPosition(el) {
    const svg = el.ownerSVGElement;
    if (!svg) return null;

    const shape = chooseBestChildShape(el);
    if (!shape) return null;

    const p = flattenShapeToStartPoint(shape);
    if (!p) return null;

    // Step 1: start point in local shape coords
    const pt = svg.createSVGPoint();
    pt.x = p.x;
    pt.y = p.y;

    // Step 2: transform through shape CTM (to global SVG coords)
    const global = pt.matrixTransform(shape.getCTM());

    // Step 3: transform through SVG → screen CTM
    const screen = svg.createSVGPoint();
    screen.x = global.x;
    screen.y = global.y;

    const scr = screen.matrixTransform(svg.getScreenCTM());

    return { x: scr.x, y: scr.y };
}




// ============================================================
// 4. Create hit-circle
// ============================================================
export function createHitLabel(groupEl, kind, uid) {
    console.group("[HitCircle] createHitLabel");
    console.log("groupEl:", groupEl, "kind:", kind, "uid:", uid);

    if (!groupEl) {
        console.warn("[HitCircle] ❌ No groupEl.");
        console.groupEnd();
        return;
    }

    // Create fixed-position red circle
    const div = document.createElement("div");
    div.dataset.uid = uid;
    div.style.position = "fixed";
    div.style.width = "16px";
    div.style.height = "16px";
    div.style.borderRadius = "50%";
    div.style.background = "red";
    div.style.zIndex = "2147483647";
    div.style.pointerEvents = "auto";

    div.style.left = "0px";
    div.style.top = "0px";

    document.body.appendChild(div);

    // clicking the hit-circle forwards click to the animation group
    div.addEventListener("click", (e) => {
        e.stopPropagation();
        console.log(`[HitCircle] CLICK on ${kind}:${uid}`);
        groupEl.dispatchEvent(new Event("click", { bubbles: true }));
    });

    const record = { groupEl, div, uid };
    window._oscillaHitLabels.push(record);

    // Initial placement
    updateHitCircle(record);

    console.groupEnd();
}

// ============================================================
// 5. Update 1 hit-circle
// ============================================================
export function updateHitCircle(record) {
    const { groupEl, div } = record;
    if (!groupEl || !div) return;

    const pos = computeAnchorScreenPosition(groupEl);
    if (!pos) return;

    div.style.left = `${pos.x - 8}px`;  // center the 16px circle
    div.style.top  = `${pos.y - 8}px`;
}

// ============================================================
// 6. Update ALL hit-circles — call once per animation frame
// ============================================================
export function repositionAllHitLabels() {
    for (const rec of window._oscillaHitLabels) {
        updateHitCircle(rec);
    }
}

// ============================================================
// 7. Simple show/hide toggle
// ============================================================
export function toggleHitLabels() {
    window.oscillaShowHitLabels = !window.oscillaShowHitLabels;
    const show = window.oscillaShowHitLabels;

    window._oscillaHitLabels.forEach(rec => {
        rec.div.style.opacity = show ? "1" : "0";
        rec.div.style.pointerEvents = show ? "auto" : "none";
    });
}
