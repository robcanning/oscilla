// oscillaHitLabels.js
// ============================================================
// Hit-circles for animation groups (rotate, scale, o2p, etc).
// • Always clickable HTML overlays
// • Anchored to path-start OR object midpoint
// • Updates every frame using CTM / bbox
// • Mirrors SVG opacity (ghost / fade / hidden)
// • Supports fixed-size dots AND size-following rings
// • LARGE invisible hit area + small visible marker
// ============================================================

window._oscillaHitLabels = window._oscillaHitLabels || [];
window.oscillaShowHitLabels = true;


export function shouldCreateHitLabel(cfg) {
    // ghostClickable(...) explicitly requires interaction
    if (cfg._ghostClickable) return true;

    // future-proof: other interactive prestates can go here
    if (cfg.prestate === "ghost") return false; // visible but not clickable

    return false;
}


// ------------------------------------------------------------
// SVG local → screen coords using CTM
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
// Flatten shape → path start
// ------------------------------------------------------------
function flattenShapeStart(shape) {
    if (!shape) return null;
    const tag = shape.tagName.toLowerCase();

    if (tag === "circle") {
        const cx = +shape.getAttribute("cx") || 0;
        const cy = +shape.getAttribute("cy") || 0;
        const r = +shape.getAttribute("r") || 0;
        return { x: cx + r, y: cy };
    }

    if (tag === "ellipse") {
        const cx = +shape.getAttribute("cx") || 0;
        const cy = +shape.getAttribute("cy") || 0;
        const rx = +shape.getAttribute("rx") || 0;
        return { x: cx + rx, y: cy };
    }

    if (tag === "rect") {
        return {
            x: +shape.getAttribute("x") || 0,
            y: +shape.getAttribute("y") || 0
        };
    }

    if (tag === "line") {
        return {
            x: +shape.getAttribute("x1") || 0,
            y: +shape.getAttribute("y1") || 0
        };
    }

    if (tag === "polyline" || tag === "polygon") {
        const pts = shape.getAttribute("points");
        if (!pts) return null;
        const p = pts.trim().split(/[\s,]+/);
        return { x: +p[0], y: +p[1] };
    }

    if (tag === "path") {
        try {
            const p = shape.getPointAtLength(0);
            return { x: p.x, y: p.y };
        } catch {
            return null;
        }
    }

    return null;
}

// ------------------------------------------------------------
// Choose largest child shape in group
// ------------------------------------------------------------
function chooseLargestShape(groupEl) {
    if (groupEl.tagName.toLowerCase() !== "g") return groupEl;

    let best = null;
    let bestArea = -1;

    groupEl.querySelectorAll(
        "circle, ellipse, rect, line, polyline, polygon, path"
    ).forEach(s => {
        const b = s.getBBox();
        const area = b.width * b.height;
        if (area > bestArea) {
            bestArea = area;
            best = s;
        }
    });

    return best || groupEl;
}

// ------------------------------------------------------------
// Anchors
// ------------------------------------------------------------
function computePathStartScreen(groupEl) {
    const shape = chooseLargestShape(groupEl);
    const p = flattenShapeStart(shape);
    if (!p) return null;
    return localToScreen(shape, p.x, p.y);
}

function computeBBoxCenterScreen(groupEl) {
    const box = groupEl.getBoundingClientRect();
    return {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2
    };
}

function computePathAnchorScreen(groupEl, t = 0) {
    const shape = chooseLargestShape(groupEl);
    if (!shape) return null;

    const tag = shape.tagName.toLowerCase();

    if (tag === "path") {
        try {
            const len = shape.getTotalLength();
            const p = shape.getPointAtLength(len * t);
            return localToScreen(shape, p.x, p.y);
        } catch {
            return null;
        }
    }

    const box = shape.getBBox();
    const w = box.width;
    const h = box.height;
    const perimeter = 2 * (w + h);
    const d = (t * perimeter) % perimeter;

    let x, y;
    if (d <= w) {
        x = box.x + d;
        y = box.y;
    } else if (d <= w + h) {
        x = box.x + w;
        y = box.y + (d - w);
    } else if (d <= 2 * w + h) {
        x = box.x + (w - (d - w - h));
        y = box.y + h;
    } else {
        x = box.x;
        y = box.y + (h - (d - 2 * w - h));
    }

    return localToScreen(shape, x, y);
}

// ------------------------------------------------------------
// CREATE HIT LABEL
// ------------------------------------------------------------
export function createHitLabel(groupEl, kind, uid, opts = {}) {
    if (!groupEl) return;

    const record = {
        groupEl,
        uid,
        kind,
        anchorMode: opts.anchorMode || "pathStart",
        color: opts.color || "red",
        sizeMode: opts.sizeMode || "fixed",
        oscMode: false,  // true when double-clicked for OSC
        div: null,  // visible dot
        hit: null   // invisible hit area
    };

    // -----------------------------
    // INVISIBLE LARGE HIT AREA
    // -----------------------------
    const hit = document.createElement("div");
    hit.dataset.uid = uid;

    Object.assign(hit.style, {
        position: "fixed",
        left: "0px",
        top: "0px",
        width: "140px",
        height: "140px",
        marginLeft: "-70px",
        marginTop: "-70px",
        background: "transparent",
        pointerEvents: "auto",
        zIndex: 2147483646
    });

    hit.classList.add("oscilla-hit");
    hit.dataset.oscillaHit = "1";

    // Track click timing for single vs double click detection
    let lastClickTime = 0;
    let clickTimeout = null;
    const DOUBLE_CLICK_THRESHOLD = 300; // ms

    hit.addEventListener("click", e => {
        e.stopPropagation();
        
        const now = Date.now();
        const timeSinceLastClick = now - lastClickTime;
        lastClickTime = now;

        // Clear any pending single-click dispatch
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
        }

        if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
            // DOUBLE CLICK → TOGGLE OSC mode (don't affect play state)
            record.oscMode = !record.oscMode;
            console.log("[hitLabel] DOUBLE-CLICK → toggle OSC mode", uid, record.oscMode);
            
            // Update visual color
            updateHitCircleColor(record);
            
            // ✅ FIX: Include UID in event so only matching animation responds
            groupEl.dispatchEvent(
                new CustomEvent("oscilla-osc-toggle", {
                    bubbles: true,
                    detail: { 
                        kind, 
                        uid,      
                        oscEnabled: record.oscMode 
                    }
                })
            );

        } else {
            // Wait to see if it's a double click
            clickTimeout = setTimeout(() => {
                // SINGLE CLICK → play/pause/resume (OSC state unchanged)
                console.log("[hitLabel] SINGLE-CLICK → play/pause", uid);
                
                groupEl.dispatchEvent(
                    new CustomEvent("oscilla-hit", {
                        bubbles: true,
                        detail: { kind, uid }  // ← Also include UID for consistency
                    })
                );

            }, DOUBLE_CLICK_THRESHOLD);
        }
    });

    // -----------------------------
    // VISIBLE DOT (unchanged)
    // -----------------------------
    const div = document.createElement("div");
    div.dataset.uid = uid;

    Object.assign(div.style, {
        position: "fixed",
        left: "0px",
        top: "0px",
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: record.sizeMode === "fixed" ? record.color : "transparent",
        border: record.sizeMode === "follow"
            ? `0.75px solid ${record.color}`
            : "none",
        zIndex: 2147483647,
        pointerEvents: "none",
        boxSizing: "border-box"
    });

    document.body.appendChild(hit);
    document.body.appendChild(div);

    record.div = div;
    record.hit = hit;

    window._oscillaHitLabels.push(record);
    updateHitCircle(record);
}

// ------------------------------------------------------------
// UPDATE ONE HIT CIRCLE
// ------------------------------------------------------------
export function updateHitCircle(rec) {
    const { groupEl, div, hit, anchorMode, sizeMode, color, oscMode } = rec;
    if (!groupEl || !div || !hit) return;

    // Opacity sync
    try {
        const svgOpacity = parseFloat(getComputedStyle(groupEl).opacity);
        div.style.opacity = isNaN(svgOpacity) ? "1" : String(svgOpacity);
    } catch {
        div.style.opacity = "1";
    }

    // Anchor
    let pos = null;
    switch (anchorMode) {
        case "object":
            pos = computeBBoxCenterScreen(groupEl);
            break;
        case "pathMidPoint":
            pos = computePathAnchorScreen(groupEl, 0.5);
            break;
        case "center":
            pos = computeBBoxCenterScreen(groupEl);
            break;
        case "pathStart":
        default:
            pos = computePathAnchorScreen(groupEl, 0);
    }

    if (!pos) return;
    
    // --------------------------------------------------
    // Size modes - respecting oscMode for double ring
    // --------------------------------------------------
    const RING_SIZE = 40;
    const RING_BORDER = 0.75;
    const OSC_COLOR = "#ffaa00";  // gold/orange for OSC enabled

    if (sizeMode === "follow") {
        const box = groupEl.getBoundingClientRect();
        const r = Math.max(box.width, box.height) / 2 + 6;
        const size = r * 2;

        div.style.width = `${size}px`;
        div.style.height = `${size}px`;
        div.style.background = "transparent";

        if (oscMode) {
            div.style.border = `2px solid ${color}`;
            div.style.boxShadow = `0 0 0 4px ${OSC_COLOR}, 0 0 12px ${OSC_COLOR}`;
        } else {
            div.style.border = `${RING_BORDER}px solid ${color}`;
            div.style.boxShadow = "none";
        }

        div.style.left = `${pos.x - size / 2}px`;
        div.style.top = `${pos.y - size / 2}px`;
    }
    else if (
        sizeMode === "ring40" ||
        sizeMode === "scale40" ||
        sizeMode === "rotate40"
    ) {
        const size = RING_SIZE;

        let ringColor = color;
        if (sizeMode === "scale40") ringColor = "#33ccff";
        if (sizeMode === "rotate40") ringColor = "#ff9933";

        div.style.width = `${size}px`;
        div.style.height = `${size}px`;
        div.style.background = "transparent";

        if (oscMode) {
            div.style.border = `2px solid ${ringColor}`;
            div.style.boxShadow = `0 0 0 4px ${OSC_COLOR}, 0 0 12px ${OSC_COLOR}`;
        } else {
            div.style.border = `${RING_BORDER}px solid ${ringColor}`;
            div.style.boxShadow = "none";
        }

        div.style.left = `${pos.x - size / 2}px`;
        div.style.top = `${pos.y - size / 2}px`;
    }
    else {
        div.style.width = "14px";
        div.style.height = "14px";
        div.style.border = "none";

        if (oscMode) {
            div.style.background = color;
            div.style.boxShadow = `0 0 0 3px ${OSC_COLOR}, 0 0 10px ${OSC_COLOR}`;
        } else {
            div.style.background = color;
            div.style.boxShadow = "none";
        }

        div.style.left = `${pos.x - 7}px`;
        div.style.top = `${pos.y - 7}px`;
    }

    hit.style.left = `${pos.x}px`;
    hit.style.top = `${pos.y}px`;
}

// ------------------------------------------------------------
// UPDATE ALL
// ------------------------------------------------------------
export function repositionAllHitLabels() {
    for (const rec of window._oscillaHitLabels) {
        updateHitCircle(rec);
    }
}

// ------------------------------------------------------------
// UPDATE HIT CIRCLE COLOR (for OSC mode toggle)
// ------------------------------------------------------------
export function updateHitCircleColor(rec) {
    const { div, color, sizeMode, oscMode } = rec;
    if (!div) return;

    const OSC_COLOR = "#ffaa00";

    if (sizeMode === "follow") {
        if (oscMode) {
            div.style.border = `2px solid ${color}`;
            div.style.boxShadow = `0 0 0 4px ${OSC_COLOR}, 0 0 12px ${OSC_COLOR}`;
        } else {
            div.style.border = `0.75px solid ${color}`;
            div.style.boxShadow = "none";
        }
    }
    else if (
        sizeMode === "ring40" ||
        sizeMode === "scale40" ||
        sizeMode === "rotate40"
    ) {
        if (oscMode) {
            div.style.border = `2px solid ${color}`;
            div.style.boxShadow = `0 0 0 4px ${OSC_COLOR}, 0 0 12px ${OSC_COLOR}`;
        } else {
            let ringColor = color;
            if (sizeMode === "scale40") ringColor = "#33ccff";
            if (sizeMode === "rotate40") ringColor = "#ff9933";
            div.style.border = `0.75px solid ${ringColor}`;
            div.style.boxShadow = "none";
        }
    }
    else {
        if (oscMode) {
            div.style.background = color;
            div.style.boxShadow = `0 0 0 3px ${OSC_COLOR}, 0 0 10px ${OSC_COLOR}`;
        } else {
            div.style.background = color;
            div.style.boxShadow = "none";
        }
    }

    console.log("[hitLabel] color updated", { uid: rec.uid, oscMode, color });
}

// ------------------------------------------------------------
// SET OSC MODE FOR A HIT LABEL BY UID
// ------------------------------------------------------------
export function setHitLabelOscMode(uid, oscEnabled) {
    const rec = window._oscillaHitLabels.find(r => r.uid === uid);
    if (!rec) {
        console.warn("[hitLabel] setHitLabelOscMode: uid not found", uid);
        return;
    }
    rec.oscMode = oscEnabled;
    updateHitCircleColor(rec);
}

// ------------------------------------------------------------
// SHOW / HIDE
// ------------------------------------------------------------
export function toggleHitLabels() {
    window.oscillaShowHitLabels = !window.oscillaShowHitLabels;
    const show = window.oscillaShowHitLabels;

    window._oscillaHitLabels.forEach(rec => {
        rec.hit.style.pointerEvents = show ? "auto" : "none";
        rec.div.style.opacity = show ? rec.div.style.opacity : "0";
    });
}

// ------------------------------------------------------------
// DESTROY ALL HIT LABELS
// ------------------------------------------------------------
export function destroyAllHitLabels(reason = "") {
    console.log("[hitLabel] 🧹 DESTROY ALL", reason);

    document
        .querySelectorAll("[data-oscilla-hit], .oscilla-hit")
        .forEach(el => {
            console.log("[hitLabel] removing DOM node", el);
            el.remove();
        });

    if (window._oscillaHitLabels) {
        for (const rec of window._oscillaHitLabels) {
            rec.div?.remove();
            rec.hit?.remove();
        }
        window._oscillaHitLabels.length = 0;
    }
}