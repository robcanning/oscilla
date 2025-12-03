
// ------------------------------------------------------------
//  handleVideoCueFromAST(ast, cueElement)
// ------------------------------------------------------------
// Plays a video from window.videoDir according to cue:video(...) params.
// Supported params:
// file:, size:, loop:, hold:, speed:, offsetX:, offsetY:, location:(fixed|scroll),
// target:(uid), in:, out:, fadeIn:, fadeOut:, opacity:, audio:(0|1)

export function handleVideoCueFromAST(ast, cueElement = null) {
  if (!ast?.params) return console.error("[cueVideo] ❌ Missing AST params.");

  const p = ast.params;
  if (!p.file) return console.error("[cueVideo] ❌ Missing required 'file' parameter.");

  // --- Build source path
  let fileName = p.file.trim();
  if (!fileName.match(/\.(mp4|webm|ogg)$/)) fileName += ".mp4";
  const src = `${window.videoDir}${fileName}`;

  // --- Unique key and instance control
  const key = `${p.file}_${p.target || "none"}`;
  const allowNewInstance = Boolean(p.uid) || p.new === "1" || p.new === 1;

  const existing = !allowNewInstance
    ? document.querySelector(`video[data-key="${key}"]`)
    : null;

  if (existing) {
    console.log(`[cueVideo] 🔁 Reusing existing instance for ${key}`);
    existing.currentTime = Number(p.in || 0);
    existing.playbackRate = Number(p.speed) || 1;
    existing.muted = !(p.audio === "1" || p.audio === 1 || p.audio === "true" || p.audio === true);
    existing.style.opacity = p.opacity ? Number(p.opacity) : 1;
    existing.play();
    return;
  }

  // --- Create video element
  const vid = document.createElement("video");
  vid.classList.add("cue-video");

  const vsize = p.vsize?.toLowerCase?.();
  if (vsize === "fs" || vsize === "fullscreen") {
    vid.classList.add("cue-video-fullscreen");
  }

  const uid = p.uid || `video-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  vid.id = uid;
  vid.dataset.uid = uid;
  vid.dataset.key = key;
  vid.src = src;
  vid.autoplay = true;
  vid.playsInline = true;
  vid.muted = !(p.audio === "1" || p.audio === 1 || p.audio === "true" || p.audio === true);
  vid.controls = false;
  vid.loop = false;
  vid.playbackRate = Number(p.speed) || 1;
  vid.style.position = p.location === "fixed" ? "fixed" : "absolute";
  vid.style.cursor = "pointer";
  vid.style.zIndex = 9999;
  vid.style.border = "none";
  vid.style.opacity = p.fadeIn ? 0 : p.opacity ? Number(p.opacity) : 1;
  vid.style.transition = "opacity 0.5s ease";

  console.log(`[cueVideo] 🎬 Creating ${allowNewInstance ? "new" : "reused"} instance → ${key} (uid:${uid})`);

  // --- Geometry base
  const score = document.getElementById("scoreContainer");
  const scrollX = score?.scrollLeft || 0;
  const scrollY = score?.scrollTop || 0;
  const containerBox = score?.getBoundingClientRect?.() || { left: 0, top: 0 };

  const targetEl = p.target ? document.getElementById(p.target) : null;
  const baseEl = targetEl || cueElement;
  const offsetX = Number(p.offsetX) || 0;
  const offsetY = Number(p.offsetY) || 0;

  let x = 100, y = 100;
  if (baseEl?.getBoundingClientRect) {
    const bbox = baseEl.getBoundingClientRect();
    const centerX = bbox.left + bbox.width / 2;
    const centerY = bbox.top + bbox.height / 2;

    if (p.location === "scroll") {
      // relative to scrollable content
      x = centerX - containerBox.left + scrollX + offsetX;
      y = centerY - containerBox.top + scrollY + offsetY;
    } else {
      // fixed to viewport, preserve sign of offsets
      x = centerX + offsetX;
      y = centerY + offsetY;
    }
  }

  // --- Size and positioning
  let vidW = 320, vidH = 180;
  const size = p.size?.toLowerCase?.();

  if (size === "fs" || size === "fullscreen") {
    Object.assign(vid.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      margin: "0",
      padding: "0",
      pointerEvents: "none",
    });
    // Re-enable click handling only if explicitly requested
    if (p.clickable === "1" || p.clickable === 1) vid.style.pointerEvents = "auto";
  } else if (typeof p.size === "string" && p.size.includes("x")) {
    const [w, h] = p.size.split("x").map(Number);
    if (!isNaN(w)) vidW = w;
    if (!isNaN(h)) vidH = h;
  } else if (!isNaN(p.size)) {
    vidW = Number(p.size);
  }

  vid.width = vidW;
  vid.height = vidH;

  // Only center if not fullscreen
  if (size !== "fs" && size !== "fullscreen") {
    vid.style.left = `${x - vidW / 2}px`;
    vid.style.top = `${y - vidH / 2}px`;
  }

  // --- Append
  const container = document.getElementById("videoLayer") || document.body;
  if (p.location === "scroll" && score) score.appendChild(vid);
  else container.appendChild(vid);

  console.log(`[cueVideo] ▶️ ${src} (size:${size || `${vidW}x${vidH}`}, speed:${vid.playbackRate}x, target:${p.target || "(none)"})`);

  // --- Timing & fade parameters
  const fadeInDur = Number(p.fadeIn || 0);
  const fadeOutDur = Number(p.fadeOut || 0);
  const inTime = Number(p.in || 0);
  const outTime = Number(p.out || 0);
  const opacityTarget = Number(p.opacity || 1);
  const totalHold = p.hold ? Number(p.hold) * 1000 : null;

  let loopCount = 0;
  const maxLoops = Number(p.loop) || 1;

  // --- Cleanup
  function removeVideo() {
    try {
      vid.pause();
      if (vid._scrollHandler && score)
        score.removeEventListener("scroll", vid._scrollHandler);
      vid.remove();
      console.log(`[cueVideo] 🧹 Removed ${uid}`);
      emitCueComplete?.(uid, "cueVideo");
    } catch (err) {
      console.warn("[cueVideo] ⚠️ Error removing video:", err);
    }
  }

  // --- Scroll tracking (non-fullscreen)
  if (p.location === "scroll" && baseEl && score && size !== "fs" && size !== "fullscreen") {
    const updatePos = () => {
      const bbox = baseEl.getBoundingClientRect();
      const sx = score.scrollLeft || 0;
      const sy = score.scrollTop || 0;
      vid.style.left = `${bbox.left - containerBox.left + sx + bbox.width / 2 - vidW / 2 + offsetX}px`;
      vid.style.top = `${bbox.top - containerBox.top + sy + bbox.height / 2 - vidH / 2 + offsetY}px`;
    };
    vid._scrollHandler = updatePos;
    score.addEventListener("scroll", updatePos);
  }

  // --- Handle video timing, fades, and in/out offsets
  vid.style.visibility = "hidden"; // hide the element to prevent the first frame flash

  vid.addEventListener("loadedmetadata", () => {

    //  SEEK TO START ("in:" parameter)

    if (inTime > 0) {
      vid.pause(); // stop autoplay so we can seek safely
      vid.currentTime = inTime; // jump to desired start position in seconds

      // Wait until the seek completes before revealing or playing
      vid.addEventListener(
        "seeked",
        () => {
          vid.style.visibility = "visible"; // show the video only after the seek is complete
          vid.play(); // now begin playback from the desired inTime

          //  FADE IN

          if (fadeInDur > 0) {
            vid.style.opacity = 0;
            vid.animate([{ opacity: 0 }, { opacity: opacityTarget }], {
              duration: fadeInDur * 1000,
              fill: "forwards",
              easing: "ease-out",
            });
          } else {
            vid.style.opacity = opacityTarget; // no fade → set opacity immediately
          }

          //  FADE OUT (based on "out:" and "fadeOut:" parameters)
          // --------------------------
          if (outTime > 0) {
            // start fade out slightly before the outTime so fade completes by that time
            const fadeOutStart = Math.max((outTime - fadeOutDur) * 1000, 0);
            setTimeout(() => {
              vid.animate([{ opacity: opacityTarget }, { opacity: 0 }], {
                duration: fadeOutDur * 1000,
                fill: "forwards",
                easing: "ease-in",
              });
            }, fadeOutStart);
          }
        },
        { once: true } // ensures the event handler runs only once
      );
    }

    //  NO "in:" PARAMETER — PLAY IMMEDIATELY
    // --------------------------
    else {
      vid.style.visibility = "visible"; // show right away
      vid.play();

      // --- Fade in
      if (fadeInDur > 0) {
        vid.style.opacity = 0;
        vid.animate([{ opacity: 0 }, { opacity: opacityTarget }], {
          duration: fadeInDur * 1000,
          fill: "forwards",
          easing: "ease-out",
        });
      } else {
        vid.style.opacity = opacityTarget;
      }

      // --- Fade out
      if (outTime > 0) {
        const fadeOutStart = Math.max((outTime - fadeOutDur) * 1000, 0);
        setTimeout(() => {
          vid.animate([{ opacity: opacityTarget }, { opacity: 0 }], {
            duration: fadeOutDur * 1000,
            fill: "forwards",
            easing: "ease-in",
          });
        }, fadeOutStart);
      }
    }
  });


  // --- Looping & removal
  if (p.loop === 0 || p.loop === "0") {
    vid.loop = true;
  } else if (maxLoops > 1) {
    vid.addEventListener("ended", () => {
      loopCount++;
      if (loopCount < maxLoops) {
        vid.currentTime = inTime;
        vid.play();
      } else removeVideo();
    });
  } else {
    vid.addEventListener("ended", removeVideo);
  }

  if (totalHold && totalHold > 0) {
    setTimeout(removeVideo, totalHold);
  }

  vid.addEventListener("click", removeVideo);
}
