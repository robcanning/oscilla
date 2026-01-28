/* ============================================================================
 * oscillaOscCtrl.js — Continuous OSC Control Lanes
 * ============================================================================
 */

import { scheduleCueStart } from "../oscillaCueDispatcher.js";
import { sendOSCMessage, createOscOverlay } from "./oscillaOSC.js";

import {
    registerAnimation,
    registerRunningAnimation,
    clearRunningAnimation,
    resolveAnimationUid
} from "./oscillaAnimation.js";


const OSCCTRL_THROTTLE_MS = 30;

window.oscCtrlState ??= {};

export function handleOscCtrlCue(el, args = []) {

    console.group("[oscCtrl] REGISTER");

    const cfg = {
        addr: null,
        min: 0,
        max: 1,
        trig: "auto",
        mode: "event",
        uid: resolveAnimationUid(el, "oscCtrl", args),

        _path: null,
        _bbox: null,
        _len: 0,
        _lastSent: 0,

        _lastValue: null,
        _epsilon: 0.005,

        _overlay: null
    };

    for (const a of args) {
        switch (a.type) {
            case "addr": cfg.addr = String(a.value); break;
            case "min": cfg.min = Number(a.value); break;
            case "max": cfg.max = Number(a.value); break;
            case "uid": cfg.uid = String(a.value); break;
            case "mode": cfg.mode = String(a.value).toLowerCase(); break;
        }
    }

    if (!cfg.addr) {
        console.warn("[oscCtrl] missing addr — skipping");
        console.groupEnd();
        return;
    }

    if (el.tagName?.toLowerCase() !== "path") {
        console.warn("[oscCtrl] cue must be attached to a <path>");
        console.groupEnd();
        return;
    }

    cfg._path = el;
    cfg._bbox = el.getBBox();
    cfg._len = el.getTotalLength();

    // ------------------------------------------------------
    // Debug overlay (global overlay system)
    // ------------------------------------------------------
    cfg._overlay = createOscOverlay({
        anchorEl: el,                 // overlay glued to path bbox
        label: cfg.addr || "oscCtrl", // label (or addr)
        mode: "auto"                  // follows global overlayMode
    });

    // initial display (in label or full mode)
    cfg._overlay.update(`${cfg.min} → ${cfg.max}`);
    cfg._overlay.position();


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
        cfg._overlay.destroy();
        cfg._overlay = null;
    }
},

        tick() {
            const playX = window.getPlayheadX?.();
            if (playX == null) return;

            const rect = cfg._path.getBoundingClientRect();
            const EPS = 1.5;

            // overlay ALWAYS follows, even when not active
            if (cfg._overlay) cfg._overlay.position();

            // determine whether we are inside path horizontally
            const inside =
                !(playX < rect.left - EPS || playX > rect.right + EPS);

            if (!inside) {
                // do nothing else — just keep HUD locked
                return;
            }

            // map playhead to normalized t
            let t = (playX - rect.left) / rect.width;
            t = Math.min(1, Math.max(0, t));

            const p = cfg._path.getPointAtLength(t * cfg._len);

            // normalize Y
            let ny = (p.y - cfg._bbox.y) / cfg._bbox.height;
            ny = Math.min(1, Math.max(0, 1 - ny));

            const value = cfg.min + ny * (cfg.max - cfg.min);

            let shouldSend = true;

            if (cfg.mode === "event") {
                if (cfg._lastValue !== null) {
                    if (Math.abs(value - cfg._lastValue) < cfg._epsilon) {
                        shouldSend = false;
                    }
                }
            }

            cfg._lastValue = value;

            const now = performance.now();
            if (!shouldSend || now - cfg._lastSent < OSCCTRL_THROTTLE_MS)
                return;

            cfg._lastSent = now;

// overlay (only shows live values in "full" mode)
if (cfg._overlay) {
    cfg._overlay.update(
        `val:${value.toFixed(3)}  t:${t.toFixed(3)}`
    );
}


            sendOSCMessage({
                type: "osc_control",
                addr: cfg.addr,
                uid: cfg.uid,
                value,
                t,
                timestamp: Date.now()
            });
        }
    };

    registerRunningAnimation(cfg.uid, instance);
}
