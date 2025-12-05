


/**
 * cuePause — Pause Cue Handling Logic (ES Module Compatible)
 *
 * Implements pause-related cue behavior, allowing playback to be halted for a
 * fixed duration, with visual feedback and synchronized auto-resume across clients.
 *
 * === Cue Format Overview ===
 * cuePause_dur(N)[_next(cueId)]
 *
 * Parameters:
 *   dur(N)      → REQUIRED. Duration of pause in seconds (converted to ms internally).
 *   next(...)   → OPTIONAL. Cue ID to trigger immediately after pause (e.g. cueAudio, cueTraverse).
 *
 * === Responsibilities ===
 * - Interrupt playback on cue trigger
 * - Display a countdown overlay (if duration > 2s or forced)
 * - Block sync messages during pause (ignoreSyncDuringPause)
 * - Auto-resume playback after duration elapses
 * - Allow manual resume via click or Spacebar
 * - Optionally trigger a follow-up cue (`next(...)`)
 * - Broadcast pause/resume state via WebSocket to keep clients in sync
 *
 * === Functions Exported ===
 * - handlePauseCue(cueId, duration, showCountdownOverride, resumeTarget)
 *     → Main cue handler. Initiates pause, countdown, and auto-resume.
 *
 * - dismissPauseCountdown(forceNoResume = false, receivedFromServer = false)
 *     → Ends the countdown and resumes playback unless suppressed.
 *
 * - resumePlayback(receivedFromServer = false)
 *     → Restores playback and re-syncs state after pause ends.
 *
 * - preventAccidentalPauses()
 *     → Sets brief cooldown to avoid retriggering pause cues right after resume.
 *
 * - handleWebSocketSync(receivedFromServer)
 *     → Sends `resume_after_pause` event to all clients via WebSocket.
 *
 * - clearPauseTimers()
 *     → Ensures no countdown/resume timers are left running.
 *
 * - hidePauseCountdownUI()
 *     → Hides the countdown visually without triggering resume logic.
 *
 * - pauseDismissHandler()
 *     → Binds click and Spacebar to allow user-driven countdown dismissal.
 *
 * === UI Requirements ===
 * - #pause-countdown: visible overlay container (shown/hidden)
 * - #pause-time: live countdown number updated every second
 *
 * === Integration Notes ===
 * - Must be called from cue handler logic in response to `cuePause(...)`
 * - `pauseDismissHandler()` must be initialized after DOM is ready
 * - `window.isPlaying`, `startAnimation()`, `stopAnimation()`, etc., must be globally accessible
 */
export function handlePauseCue(ast) {
    const durationMs = (ast.dur ?? 0) * 1000;
    const resumeTarget = ast.next || null;

    // ✅ Only show countdown if NOT explicitly disabled
    const showCountdown = (ast.count !== false) && (durationMs > 2000);

    console.log(`[cuePause] ⏸ Pausing for ${durationMs}ms`, ast);

    // --- Stop playback ---
    window.isPlaying = false;
    window.isMusicalPause = true;
    window.animationPaused = true;
    window.ignoreSyncDuringPause = true;

    stopAnimation?.();
    window.togglePlayButton?.();

    // --- Server sync: freeze playhead globally ---
    if (window.socket?.readyState === WebSocket.OPEN) {
        window.socket.send(JSON.stringify({
            type: "pause",
            playheadX: window.playheadX,
            elapsedTime: window.elapsedTime
        }));
    }

    // --- Optional countdown UI ---
    const overlay = document.getElementById("pause-countdown");
    const timeEl = document.getElementById("pause-time");

    if (overlay && timeEl) {
        if (showCountdown) {
            overlay.classList.remove("hidden");
            overlay.style.display = "flex";
            const targetEnd = Date.now() + durationMs;

            const tick = () => {
                const msLeft = targetEnd - Date.now();
                const sec = Math.max(0, Math.ceil(msLeft / 1000));
                timeEl.textContent = sec;
                if (sec <= 0) {
                    clearInterval(window._pauseCountdownTimer);
                    overlay.classList.add("hidden");
                }
            };

            clearInterval(window._pauseCountdownTimer);
            tick();
            window._pauseCountdownTimer = setInterval(tick, 1000);
        }
    }

    // --- Resume after timeout ---
    clearTimeout(window._pauseResumeTimer);
    window._pauseResumeTimer = setTimeout(() => {
        console.log("[cuePause] ▶ Resuming playback");
        window.ignoreSyncDuringPause = false;
        window.isMusicalPause = false;

        // Hide countdown UI if present
        overlay?.classList.add("hidden");

        if (resumeTarget) {
            console.log(`[cuePause] → Triggering resume target:`, resumeTarget);
            handleCueTrigger(resumeTarget, false, true);
            return;
        }
        
        // --- Seal normal cues ---
        if (window.cues && window.triggeredCues) {
            for (const cue of window.cues) {
                if (cue.x < window.playheadX) {
                    window.triggeredCues.add(cue.id);
                }
            }
        }

        // --- Seal propagate cues ---
        if (window._cueInsideState) {
            for (const cue of window.cues) {
                if (cue.x < window.playheadX) {
                    window._cueInsideState.set(cue.id, {
                        inside: false,
                        passed: true
                    });
                }
            }
        }


        // --- Resume ---
        startPlayback();





    }, durationMs);
}



export function dismissPauseCountdown(forceNoResume = false, receivedFromServer = false) {
    console.log("[DEBUG] Dismissing pause countdown.");

    const pauseCountdown = document.getElementById("pause-countdown");
    if (pauseCountdown) {
        pauseCountdown.classList.add("hidden");
        pauseCountdown.style.display = "none";
    }

    const pauseTime = document.getElementById("pause-time");
    if (pauseTime) pauseTime.textContent = "";

    clearPauseTimers();

    // --- NEW: Fully exit pause mode if user resumes manually ---
    if (forceNoResume) {
        window.ignoreSyncDuringPause = false;
        window.isMusicalPause = false;
        console.log("[DEBUG] Manual resume: cleared pause mode.");
        return;
    }

    resumePlayback(receivedFromServer);
}


export function clearPauseTimers() {
    if (window.pauseCountdownInterval) {
        clearInterval(window.pauseCountdownInterval);
        window.pauseCountdownInterval = null;
        console.log("[DEBUG] Pause countdown timer cleared.");
    }

    if (window.pauseTimeout) {
        clearTimeout(window.pauseTimeout);
        window.pauseTimeout = null;
        console.log("[DEBUG] Pause timeout cleared.");
    }
}
/**
 * Resumes playback after pause and synchronizes across clients.
 * Respects nav(mode:scrollPaused@X) via window._resumeAfterJump.
 */
export function resumePlayback(receivedFromServer = false) {
    console.log("[DEBUG] resumePlayback called (receivedFromServer:", receivedFromServer, ")");

    // ✅ If a jump explicitly requested *paused* landing:
    if (window._resumeAfterJump === false) {
        console.log("[resumePlayback] ⏸ Staying paused due to scrollPaused mode.");

        window.isPlaying = false;
        window.animationPaused = true;
        window.isMusicalPause = true;

        // Ensure stopwatch stays stopped
        window.pauseStopwatch?.();

        // Allow normal cues to resume again later
        window.ignoreSyncDuringPause = false;

        // Clear flag so later resumes behave normally
        window._resumeAfterJump = null;
        return;
    }

    // ✅ Clear resume flag (normal scroll mode autos resume)
    if (window._resumeAfterJump === true) {
        console.log("[resumePlayback] ▶ Auto-resuming after jump.");
    }
    window._resumeAfterJump = null;

    // --- (existing code follows) ---
    console.log("[DEBUG] Resuming playback after countdown dismissal.");

    if (!Number.isNaN(window.playheadX)) {
        console.log(`[DEBUG] Resuming from playheadX: ${window.playheadX}`);
    } else {
        console.error(`[ERROR] Invalid playheadX: ${window.playheadX}. Aborting resume.`);
        return;
    }

    window.updatePosition?.();
    window.updateStopwatch?.();

    window.lastAnimationFrameTime = null;

    if (typeof window.startPlayback === "function") {
        console.log("[DEBUG] Calling startPlayback() from resumePlayback()");
        window.startPlayback();
    } else {
        window.isPlaying = true;
        window.animationPaused = false;
        window.ignoreSyncPlayback = false;
        window.togglePlayButton?.();
        console.log("[DEBUG] Calling startAnimation() from resumePlayback()");
        window.startAnimation?.();
        window.startStopwatch?.();
    }

    preventAccidentalPauses();
    handleWebSocketSync(receivedFromServer);
}


/**
 * Blocks accidental cue retriggers and pause loops after resume.
 */
export function preventAccidentalPauses() {
    window.ignorePauseAfterResume = true;
    console.log("[DEBUG] Pause prevention active.");

    setTimeout(() => {
        window.ignorePauseAfterResume = false;
        console.log("[DEBUG] Pause prevention expired.");
    }, 2000);

    window.pauseCooldownActive = true;
    console.log("[DEBUG] Pause cooldown activated.");

    setTimeout(() => {
        window.pauseCooldownActive = false;
        console.log("[DEBUG] Pause cooldown expired.");
    }, 3000);
}

/**
 * Sends resume_after_pause over WebSocket to sync all clients.
 */
export function handleWebSocketSync(receivedFromServer = false) {
    if (window.wsEnabled && window.socket && !receivedFromServer) {
        window.resumeReceived = true;

        if (!isNaN(window.playheadX) && window.playheadX > 0) {
            console.log(`[DEBUG] Syncing playheadX: ${window.playheadX}`);
        } else {
            console.error(`[ERROR] Invalid playheadX. Keeping last known value.`);
        }

        const message = JSON.stringify({
            type: "resume_after_pause",
            elapsedTime: window.elapsedTime,
            playheadX: window.playheadX,
        });

        console.log(`[CLIENT] Broadcasting resume_after_pause: ${message}`);
        window.socket.send(message);

        setTimeout(() => {
            window.resumeReceived = false;
        }, 1000);
    }
}

// ✅ Optional: Click-to-dismiss handler
export function pauseDismissClickHandler() {
    const pauseCountdown = document.getElementById("pause-countdown");

    if (!pauseCountdown) {
        console.error("[ERROR] pause-countdown not found.");
        return;
    }

    // ✅ Click to dismiss
    pauseCountdown.addEventListener("click", (event) => {
        console.log("[DEBUG] Pause countdown clicked. Dismissing.");
        dismissPauseCountdown(false);
        event.stopImmediatePropagation();
    });

    //   // ✅ Press Spacebar to dismiss
    //   document.addEventListener("keydown", (event) => {
    //     if (event.code === "Space" || event.key === " ") {
    //       if (!pauseCountdown.classList.contains("hidden")) {
    //         console.log("[DEBUG] Spacebar pressed. Dismissing pause countdown.");
    //         dismissPauseCountdown(false);
    //         event.preventDefault(); // Optional: prevent page scroll
    //       }
    //     }
    //   });

}
