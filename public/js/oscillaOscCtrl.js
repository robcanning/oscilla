// ============================================================================
// oscillaOscCtrl.js — Continuous OSC Control Lanes
// ----------------------------------------------------------------------------
// Cue: oscCtrl(...)
//
// Example:
//   oscCtrl(
//     addr:/fx/ring/freq,
//     path:ringCurve,
//     min:60,
//     max:800,
//     uid:ringModFreq
//   )
//
// • Continuous, playhead-driven control
// • Path defines baseline curve
// • Y normalized relative to path bbox
// • Min/max mapped to OSC values
// • Throttled streaming
// • Designed to later integrate oscCtrlNode()
// ============================================================================

import { scheduleCueStart } from "./oscillaCueDispatcher.js";


import {
    registerAnimation,
    registerRunningAnimation,
    clearRunningAnimation,
    resolveAnimationUid
} from "./oscillaAnimation.js";



const OSCCTRL_THROTTLE_MS = 30;
// Global registry of control lanes
window.oscCtrlState ??= {};

export function handleOscCtrlCue(el, args = []) {

    console.group("[oscCtrl] REGISTER");

    const cfg = {
        addr: null,
        min: 0,
        max: 1,
        trig: "auto",
        mode: "event",          // default behaviour
        uid: resolveAnimationUid(el, "oscCtrl", args),

        // internals
        _path: null,
        _bbox: null,
        _len: 0,
        _lastSent: 0,

        _lastValue: null,       // last value sent
        _epsilon: 0.005,        // change threshold (tunable)

        _overlay: null,
        _updateOverlay: null
    };

    // -------------------------
    // parse args
    // -------------------------
    for (const a of args) {
        switch (a.type) {
            case "addr": cfg.addr = String(a.value); break;
            case "min": cfg.min = Number(a.value); break;
            case "max": cfg.max = Number(a.value); break;
            case "uid": cfg.uid = String(a.value); break;
            case "mode": cfg.mode = String(a.value).toLowerCase(); break;
        }
    }

    // must have OSC address
    if (!cfg.addr) {
        console.warn("[oscCtrl] missing addr — skipping");
         console.groupEnd();
        return;
    }

    // -------------------------
    // path must BE the element
    // -------------------------
    if (el.tagName?.toLowerCase() !== "path") {
        console.warn("[oscCtrl] cue must be attached to a <path>");
        console.groupEnd();
        return;
    }

    cfg._path = el;
    cfg._bbox = el.getBBox();
    cfg._len = el.getTotalLength();

    // ---------------------------------------
    // HTML overlay showing addr + min/max
    // ---------------------------------------
    const overlay = document.createElement("div");
    overlay.className = "oscctrl-overlay";

    overlay.style.position = "absolute";
    overlay.style.pointerEvents = "none";
    // overlay.style.background = "rgba(0,0,0,.65)";
    overlay.style.color = "black";
    overlay.style.fontSize = "11px";
    overlay.style.fontFamily = `"Courier New", Courier, monospace`;
    overlay.style.padding = "3px 6px";
    overlay.style.borderRadius = "6px";
    overlay.style.whiteSpace = "nowrap";
    overlay.style.zIndex = 99999;

    overlay.innerHTML = `
    <div>${cfg.addr}  ${cfg.min} → ${cfg.max}</div>
  `;

const scroller = document.getElementById("scoreInner") || document.body;
scroller.appendChild(overlay);
scroller.style.position ??= "relative";
cfg._overlay = overlay;

cfg._updateOverlay = function () {
    if (!cfg._path || !cfg._overlay) return;

    const rect = cfg._path.getBoundingClientRect();
    const parentRect = scroller.getBoundingClientRect();

    const s = cfg._overlay.style;
    s.left = `${rect.left - parentRect.left}px`;
    s.top  = `${rect.top  - parentRect.top }px`;
};


    // initial position
    cfg._updateOverlay();

    let _rafRunning = false;

    cfg._trackOverlay = function track() {
        if (_rafRunning) return;
        _rafRunning = true;

        const loop = () => {
            cfg._updateOverlay();
            if (!cfg._overlay) {
                _rafRunning = false;
                return;
            }
            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    };

    // start tracking
    cfg._trackOverlay();



    // keep roughly in sync with viewport changes
    window.addEventListener("scroll", cfg._updateOverlay, { passive: true });
    window.addEventListener("resize", cfg._updateOverlay, { passive: true });

    // const scroller = document.getElementById("scoreInner");
    if (scroller) {
        scroller.addEventListener("scroll", cfg._updateOverlay, { passive: true });
    }

    // register with animation engine (will start when active)
    registerAnimation(el, "oscCtrl", cfg, () => startOscCtrl(cfg));

    console.groupEnd();
}



function startOscCtrl(cfg) {
    console.log("[oscCtrl] START", cfg.uid);

    const instance = {
        uid: cfg.uid,

        stop() {
            clearRunningAnimation(cfg.uid);
            if (cfg._overlay) {
                cfg._overlay.remove();
                cfg._overlay = null;
            }
        },

        tick() {
            const playX = window.getPlayheadX?.();
            if (playX == null) return;

            // ------------------------------------
            // SCREEN-SPACE path bounds (refresh)
            // ------------------------------------
            const rect = cfg._path.getBoundingClientRect();

            // small tolerance so edge counts as "inside"
            const EPS = 1.5;

            // bail unless the playhead is visually over the path
            if (playX < rect.left - EPS || playX > rect.right + EPS) return;

            // ------------------------------------
            // map X position → path length fraction
            // ------------------------------------
            let t = (playX - rect.left) / rect.width;
            t = Math.min(1, Math.max(0, t));

            const p = cfg._path.getPointAtLength(t * cfg._len);

            // ------------------------------------
            // Y normalization (relative to rect)
            // ------------------------------------
            let ny = (p.y - rect.top) / rect.height;
            ny = 1 - ny;
            ny = Math.min(1, Math.max(0, ny));

            const value = cfg.min + ny * (cfg.max - cfg.min);

            // ------------------------------------
            // mode:event → only send when value changes
            // ------------------------------------
            if (cfg.mode === "event") {
                if (cfg._lastValue !== null) {
                    if (Math.abs(value - cfg._lastValue) < cfg._epsilon) {
                        return; // skip — value not meaningfully different
                    }
                }
            }

            cfg._lastValue = value;

            // ------------------------------------
            // rate-limit sends (still applied to both modes)
            // ------------------------------------
            const now = performance.now();
            if (now - cfg._lastSent < 30) return;
            cfg._lastSent = now;

            // ------------------------------------
            // send
            // ------------------------------------
            if (window.socket?.readyState === WebSocket.OPEN) {
                console.log("[oscCtrl]: ", cfg.addr, value );

                window.socket.send(
                    JSON.stringify({
                        type: "osc_control",
                        addr: cfg.addr,
                        uid: cfg.uid,
                        value,
                        t,
                        timestamp: Date.now()
                    })
                );
            }
        }
    };

    registerRunningAnimation(cfg.uid, instance);
}



