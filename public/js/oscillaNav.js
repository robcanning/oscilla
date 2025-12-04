import { pausePlayback } from "./transport.js";

export function handleNavCue(ast) {
    const dbg = (...a) => console.log("[cueNav]", ...a);

    // Normalize
    let action = ast.action ?? null;
    let target = ast.target ?? null;

    if (!action && ast.key) {
        if (ast.key === "mode") {
            action = ast.value || "scroll";
            target = ast.target ?? null;
        } else if (ast.key === "page") {
            action = ast.value || null;
            target = ast.target ?? null;
        }
    }

    dbg("→", { action, target, uid: ast.uid ?? null });

    if (!action) return;

    // ------------------------------------------------------------
    // FIXED SCROLL-MODE HANDLING
    // ------------------------------------------------------------

    // Case 1 — scroll (auto-resume)
    if (action === "scroll") {

        // Only leave page-mode if we are actually in page-mode
        if (window.currentMode === "page") {
            window.returnToScrollingScore?.();
        }

        window._resumeAfterJump = true;

        if (target) {
            window.jumpToRehearsalMark?.(target);
        }
        return;
    }

    // Case 2 — scrollPaused (stay paused)
    if (action === "scrollPaused") {

        // Only leave page-mode if actually in page-mode
        if (window.currentMode === "page") {
            window.returnToScrollingScore?.();
        }

        pausePlayback();

        if (target) {
            window.jumpToRehearsalMark?.(target);
        }
        return;
    }

    // ------------------------------------------------------------
    // DIRECT PAGE / REHEARSAL JUMP
    // ------------------------------------------------------------
    if (typeof window.handleCueTrigger === "function") {
        window._resumeAfterJump = true;
        window.handleCueTrigger(`page(${action})`);
        return;
    }

    // fallback
    window._resumeAfterJump = true;
    window.jumpToRehearsalMark?.(action);
}

