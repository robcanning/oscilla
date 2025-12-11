// ============================================================
// Shared visibility/prestart handler for all animations
// scale() • rotate() • o2p() • (future: video/audio icons)
// ============================================================

// ============================================================
// Shared Prestate Handlers with Debug Logging
// ============================================================

// ===================================================================
// Apply element visibility BEFORE animation begins (hide/ghost/fadein)
// ===================================================================
export function applyPrestateBeforeStart(el, cfg) {
    const p = cfg.prestate;

    // ---- Function form: fadein(N) ----
    if (p && typeof p === "object" && p.type === "func") {
        if (p.name === "fadein") {
            const ms = Number(p.args?.[0] ?? 300);

            console.log("[prestateBefore] apply fadein", { uid: cfg.uid, ms });

            // Hide instantly (no transition yet)
            el.style.opacity = "0";
            el.style.transition = "opacity 0ms";

            // Store fadein duration for later use
            cfg._fadeinMs = ms;
            return;
        }
    }

    // ---- Literal modes: "hide", "ghost", "show" ----
    if (p === "hide") {
        el.style.opacity = "0";
        el.style.transition = "";
    } 
    else if (p === "ghost") {
        el.style.opacity = "0.3";
        el.style.transition = "";
    } 
    else {
        // default
        el.style.opacity = "1";
        el.style.transition = "";
    }
}

export function applyPrestateOnStart(el, cfg) {
    const p = cfg.prestate;

    console.log("[prestateStart]", { uid: cfg.uid, prestate: p, element: el.id });

    // ----------------------------------------------------
    // FUNCTION FORM: fadein(XXX)
    // ----------------------------------------------------
    if (p && typeof p === "object" && p.type === "func") {
        if (p.name === "fadein") {
            const ms = Number(p.args?.[0] || 300);

            console.log("[prestateStart] fadein()", { uid: cfg.uid, ms });

            // Make sure element begins fully hidden
            el.style.opacity = "0";

            // Apply transition AFTER the hide has taken effect
            requestAnimationFrame(() => {
                el.style.transition = `opacity ${ms}ms ease`;
                el.style.opacity = "1";
            });

            return;
        }

        // Future custom prestates can go here
        console.warn("[prestateStart] Unknown func prestate:", p);
        return;
    }

    // ----------------------------------------------------
    // STRING PRESTATES
    // ----------------------------------------------------
    if (typeof p === "string") {

        if (p === "hide") {
            el.style.transition = "opacity 200ms ease";
            el.style.opacity = "1";
            return;
        }

        if (p === "ghost") {
            el.style.transition = "opacity 200ms ease";
            el.style.opacity = "1";
            return;
        }

        // 'show' or unknown strings
        el.style.opacity = "1";
        return;
    }

    // ----------------------------------------------------
    // FALLBACK
    // ----------------------------------------------------
    console.warn("[prestateStart] Unsupported prestate value:", p);
}

