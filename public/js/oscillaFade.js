

export function handleFadeCueFromAST(ast, cueElementId) {
  console.group("[cueFade] 🎛 Handling fade cue");

  const params = Object.fromEntries(ast.args.map(a => [a.type, a.value]));

  const mode = params.mode || "in";
  const dur = Number(params.dur ?? 1);
  const from = Number(params.from ?? (mode === "in" ? 0 : 1));
  const to = Number(params.to ?? (mode === "in" ? 1 : 0));
  const ease = params.ease || "linear";
  const delay = Number(params.delay ?? 0);
  const hold = Number(params.hold ?? 0); // ⏸ pause between loops
  const targetId = params.target || "self";

  
  function sendFadeOSC(value) {
    const oscFlag = Number(params.osc ?? 1);
    if (!window.OSC_ENABLED || !oscFlag) return;
    if (!window.wsEnabled || !window.socket || window.socket.readyState !== WebSocket.OPEN) return;

    const message = {
      type: "osc_fade",
      uid,
      value,
      timestamp: Date.now(),
    };

    window.socket.send(JSON.stringify(message));
    console.debug("[OSC] 🎚 Sent fade update:", message);
  }

  //  Resolve target: "self" defaults to element containing this cue
  let target = null;

  if (targetId === "self") {
    if (typeof cueElementId === "string") {
      target =
        document.getElementById(cueElementId) ||
        window.svgElement?.getElementById?.(cueElementId);
    } else if (cueElementId instanceof Element) {
      target = cueElementId;
    }
  } else {
    // Try HTML first, then inside the loaded SVG
    target =
      document.getElementById(targetId) ||
      window.svgElement?.getElementById?.(targetId);
  }

  //  fallback
  if (!target) {
    target =
      document.querySelector(`[data-id="${ast.type}"]`) ||
      document.getElementById("scoreContainer") ||
      window.svgElement ||
      document.body;
  }

  if (!target || !(target instanceof Element)) {
    console.warn(`[cueFade] No valid target found for ID '${targetId}', aborting.`);
    console.groupEnd();
    return;
  }

  console.log(
    `[cueFade] mode=${mode}, dur=${dur}s, hold=${hold}s, from=${from}, to=${to}, ease=${ease}, delay=${delay}s`
  );
  console.log("[cueFade] Target element:", target);

  anime.remove(target);
  target.style.opacity = from;


  //  Resolve and normalize UID once for OSC and logging
  let uid = params.uid || null;

  if (!uid) {
    // Prefer target.id if valid, otherwise fall back to cueElementId
    uid =
      target?.id ||
      cueElementId?.replace(/^cue:/, "") ||
      targetId?.replace(/^cue:/, "") ||
      "unknown";
  }

  // Sanitize for OSC address
  uid = String(uid).replace(/[^a-zA-Z0-9_\-]/g, "");


  const commonProps = {
    targets: target,
    easing: ease,
    duration: dur * 1000,
    delay: delay * 1000,
    begin: () => console.log("[cueFade] ▶ Fade begin"),
    update: anim => {
      const current = parseFloat(anim.animations?.[0]?.currentValue || 0);
      sendFadeOSC(current);
    },
    complete: () => {
      sendFadeOSC(to);
      console.log("[cueFade] ✅ Fade complete");
    },
  };



  // Switch by mode
  switch (mode) {
    case "in":
    case "out":
      anime({ ...commonProps, opacity: [from, to] });
      break;

    case "inout":
      anime({ ...commonProps, opacity: [from, to], direction: "alternate", loop: 2 });
      break;

    case "pulse": {
      const ms = dur * 1000;
      anime({
        ...commonProps,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        easing: ease || "easeInOutSine",
        duration: ms,
        endDelay: hold * 1000,
      });
      break;
    }

    case "pulseSlow":
      anime({
        ...commonProps,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        easing: "easeInOutSine",
        duration: dur * 2000,
        endDelay: hold * 1000, // ⏸ pause between each cycle
      });
      break;

    case "pulseFast":
      anime({
        ...commonProps,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        easing: "easeInOutSine",
        duration: dur * 500,
        endDelay: hold * 1000, // ⏸ pause between each cycle
      });
      break;

    case "strobe":
      anime({
        ...commonProps,
        opacity: [from, to],
        loop: true,
        direction: "alternate",
        duration: dur * 100,
        easing: "steps(2)",
        endDelay: hold * 1000, // ⏸ pause between strobes
      });
      break;

    case "blink": {
      console.log("[cueFade] ⚡ Blink mode (native setInterval + OSC)");

      const cycle = dur * 1000;
      const half = cycle / 2;
      let visible = false;

      if (target._blinkTimer) clearInterval(target._blinkTimer);

      target._blinkTimer = setInterval(() => {
        visible = !visible;
        const value = visible ? to : from;
        target.style.opacity = value;
        sendFadeOSC(value); // 🔊 send only on change
      }, half);

      const timeLimit = Number(params.time || params.hold || 0);
      if (timeLimit > 0) {
        setTimeout(() => {
          clearInterval(target._blinkTimer);
          target.style.opacity = from;
          sendFadeOSC(from);
          console.log(`[cueFade] ⏹ Blink auto-stopped after ${timeLimit}s`);
        }, timeLimit * 1000);
      }
      break;
    }

    case "stop":
      console.log(`[cueFade] ⏹ Stopping fade on target: ${target.id || target}`);
      anime.remove(target);
      clearInterval(target._blinkTimer);
      target.style.opacity = from ?? 0;
      break;

    default:
      console.warn(`[cueFade] ⚠️ Unknown fade mode: ${mode}`);
      break;
  }

  // 🕒 Optional global auto-stop (applies to any looping mode)
  const timeLimit = Number(params.time || 0);
  if (timeLimit > 0 && ["blink", "pulseSlow", "pulseFast", "strobe"].includes(mode)) {
    setTimeout(() => {
      anime.remove(target);
      clearInterval(target._blinkTimer);
      target.style.opacity = from;
      console.log(`[cueFade] ⏹ Auto-stopped after ${timeLimit}s`);
    }, timeLimit * 1000);
  }

  console.groupEnd();
}