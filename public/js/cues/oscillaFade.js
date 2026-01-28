// ============================================================================
// oscillaFade.js
// Fade cue handling with correct lifecycle, transport reset, and ownership
// ============================================================================

/*
Fade semantics:
  - fade(in)     → hidden until triggered
  - fade(inout)  → hidden until triggered
  - fade(out)    → visible until triggered
  - explicit from: always wins

Fade OWNS opacity.
Nothing else should permanently set opacity on fade targets.
*/

// -----------------------------------------------------------------------------
// Internal registry (one fade per element)
// -----------------------------------------------------------------------------
window._fadeCues ??= new Map();

// -----------------------------------------------------------------------------
// Resolve fade target (shared logic)
// -----------------------------------------------------------------------------
function resolveFadeTarget(ast, cueElement) {
  const params = Object.fromEntries(ast.args.map(a => [a.type, a.value]));
  const targetId = params.target || "self";

  let target = null;

  if (targetId === "self") {
    if (cueElement instanceof Element) {
      target = cueElement;
    } else if (typeof cueElement === "string") {
      target =
        document.getElementById(cueElement) ||
        window.svgElement?.getElementById?.(cueElement);
    }
  } else {
    target =
      document.getElementById(targetId) ||
      window.svgElement?.getElementById?.(targetId);
  }

  // Fallbacks (defensive)
  if (!target || !(target instanceof Element)) {
    target =
      document.querySelector(`[data-id="${ast.type}"]`) ||
      window.svgElement ||
      document.body;
  }

  return target instanceof Element ? target : null;
}

// -----------------------------------------------------------------------------
// Prime fade target (load + transport reset)
// -----------------------------------------------------------------------------
export function primeFadeTargetFromAST(ast, cueElement) {
  if (!ast || !Array.isArray(ast.args)) return;

  const params = Object.fromEntries(ast.args.map(a => [a.type, a.value]));
  const mode = (params.mode || "in").toLowerCase();

  const from = Number(
    params.from ??
    (mode === "out" ? 1 : 0) // in + inout start hidden
  );

  const target = resolveFadeTarget(ast, cueElement);
  if (!target) return;

  // Fade owns opacity → assert authority
  target.style.setProperty("opacity", from, "important");
}

// -----------------------------------------------------------------------------
// Reset ALL fades (call on rewind / jump / restart)
// -----------------------------------------------------------------------------
export function resetAllFadePriming() {
  if (!window._fadeCues || window._fadeCues.size === 0) return;

  console.log("[fade] 🔄 Resetting fade priming");

  for (const [element, ast] of window._fadeCues.entries()) {
    primeFadeTargetFromAST(ast, element);
  }
}

// -----------------------------------------------------------------------------
// Handle fade cue trigger
// -----------------------------------------------------------------------------
export function handleFadeCueFromAST(ast, cueElement) {
  console.group("[cueFade] 🎛 Handling fade cue");

  const params = Object.fromEntries(ast.args.map(a => [a.type, a.value]));

  const mode  = (params.mode || "in").toLowerCase();
  const dur   = Number(params.dur ?? 1);
  const hold  = Number(params.hold ?? 0);
  const delay = Number(params.delay ?? 0);
  const ease  = params.ease || "linear";

  const from = Number(
    params.from ??
    (mode === "out" ? 1 : 0)
  );

  const to = Number(
    params.to ??
    (mode === "out" ? 0 : 1)
  );

  const target = resolveFadeTarget(ast, cueElement);

  if (!target) {
    console.warn("[cueFade] No valid target, aborting.");
    console.groupEnd();
    return;
  }

  // ---------------------------------------------------------------------------
  // UID (resolve BEFORE OSC)
  // ---------------------------------------------------------------------------
  let uid =
    params.uid ||
    target.id ||
    (typeof cueElement === "string" ? cueElement : null) ||
    "fade";

  uid = String(uid).replace(/[^a-zA-Z0-9_\-]/g, "");

  // ---------------------------------------------------------------------------
  // OSC sender
  // ---------------------------------------------------------------------------
  function sendFadeOSC(value) {
    const oscFlag = Number(params.osc ?? 1);
    if (!window.OSC_ENABLED || !oscFlag) return;
    if (!window.wsEnabled || !window.socket || window.socket.readyState !== WebSocket.OPEN) return;

    window.socket.send(JSON.stringify({
      type: "osc_fade",
      uid,
      value,
      timestamp: Date.now(),
    }));
  }

  // ---------------------------------------------------------------------------
  // Prepare target for animation
  // ---------------------------------------------------------------------------
  anime.remove(target);

  // Release fade priming authority so Anime.js can control opacity
  target.style.removeProperty("opacity");
  target.style.opacity = from;

  console.log(
    `[cueFade] mode=${mode}, dur=${dur}s, from=${from}, to=${to}, hold=${hold}s`
  );
  console.log("[cueFade] Target:", target);

  const common = {
    targets: target,
    easing: ease,
    duration: dur * 1000,
    delay: delay * 1000,
    update: anim => {
      const v = parseFloat(anim.animations?.[0]?.currentValue ?? from);
      sendFadeOSC(v);
    },
    complete: () => {
      sendFadeOSC(to);
      console.log("[cueFade] ✅ Complete");
    },
  };

  // ---------------------------------------------------------------------------
  // Modes
  // ---------------------------------------------------------------------------
  switch (mode) {

    case "in":
    case "out":
      anime({ ...common, opacity: [from, to] });
      break;

    case "inout":
      anime({
        ...common,
        opacity: [from, to],
        direction: "alternate",
        loop: 2
      });
      break;

    case "pulse":
      anime({
        ...common,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        endDelay: hold * 1000
      });
      break;

    case "pulseSlow":
      anime({
        ...common,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        duration: dur * 2000,
        endDelay: hold * 1000
      });
      break;

    case "pulseFast":
      anime({
        ...common,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        duration: dur * 500,
        endDelay: hold * 1000
      });
      break;

    case "strobe":
      anime({
        ...common,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        duration: dur * 100,
        easing: "steps(2)",
        endDelay: hold * 1000
      });
      break;

    case "blink": {
      let visible = false;
      const interval = (dur * 1000) / 2;

      clearInterval(target._blinkTimer);

      target._blinkTimer = setInterval(() => {
        visible = !visible;
        const v = visible ? to : from;
        target.style.opacity = v;
        sendFadeOSC(v);
      }, interval);

      break;
    }

    case "stop":
      anime.remove(target);
      clearInterval(target._blinkTimer);
      target.style.opacity = from;
      break;

    default:
      console.warn("[cueFade] Unknown mode:", mode);
  }

  // ---------------------------------------------------------------------------
  // Optional auto-stop
  // ---------------------------------------------------------------------------
  const timeLimit = Number(params.time || 0);
  if (timeLimit > 0) {
    setTimeout(() => {
      anime.remove(target);
      clearInterval(target._blinkTimer);
      target.style.opacity = from;
      sendFadeOSC(from);
      console.log(`[cueFade] ⏹ Auto-stopped after ${timeLimit}s`);
    }, timeLimit * 1000);
  }

  console.groupEnd();
}
