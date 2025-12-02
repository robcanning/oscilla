
export function destroyAllCueButtons() {
  document.querySelectorAll(".oscilla-cue-button").forEach(btn => {
    try {
      btn._destroyCueButton?.();   // ✅ cancel raf, listeners, restore SVG visibility
    } catch (e) { }

    btn.remove();                  // ✅ ensure DOM cleared
  });

  console.log("[cueButtons] 🧹 Cleared all cue buttons");
}

export function buildCueButtonsIn(svgRoot, containerEl) {
  if (!svgRoot) return [];

  // ✔ Select correct container for PAGE MODE
  if (!containerEl) {
    containerEl =
      document.getElementById("singlePage-content") ||
      document.getElementById("pageOverlay") ||
      document.getElementById("scoreInner");
  }

  if (containerEl instanceof SVGElement) {
    console.warn("[cueButton] ❌ Container was SVG — overriding to singlePage-content");
    containerEl = document.getElementById("singlePage-content");
  }

  if (!containerEl) {
    console.warn("[cueButtons] ⚠ No containerEl found for button placement.");
    return [];
  }

  const built = [];
  const elements = svgRoot.querySelectorAll('[id^="button("]');

  // console.log("[cueButton:build] Found", elements.length, "button() element(s)");

  elements.forEach(el => {
    const cueExpr = el.id.trim();
    // console.log("\n[cueButton:scan] id=", cueExpr);

    let ast;
    try {
      ast = parseCueToAST(cueExpr);
    } catch (e) {
      // console.warn("[cueButton] ❌ parse failed:", cueExpr, e);
      return;
    }

    if (!ast || ast.type !== "cueButton") return;

    const triggerAst = ast.triggerAst || ast.trigger;

    const label =
      (ast.label && ast.label.trim()) ||
      (triggerAst.uid && String(triggerAst.uid)) ||
      (triggerAst.action && String(triggerAst.action)) ||
      (triggerAst.page && String(triggerAst.page)) ||
      "button";

    const btn = createCueButtonForElement(el, {
      triggerAst,
      label,
      opt: { ...ast.opt, containerEl }
    });

    if (btn) built.push(btn);
  });

  // console.log("[cueButton:build] ✅ Finished. Total created:", built.length);
  return built;
}

export function createCueButtonForElement(
  cueSvgEl,
  { triggerAst, label = "", opt = {} }
) {
  // console.log("\n[cueButton:create] =====================================");
  // console.log("[cueButton:create] marker element:", cueSvgEl);

  if (!triggerAst) {
    // console.warn("[cueButton] ❌ Missing triggerAst for:", cueSvgEl?.id);
    return null;
  }

  // ------------------------------------------------------------
  // 1. Resolve container
  // ------------------------------------------------------------
  let containerEl =
    opt.containerEl ||
    document.getElementById("singlePage-content") ||
    document.getElementById("pageOverlay") ||
    document.getElementById("scoreInner");

  // console.log("[cueButton:create] containerEl:", containerEl);

  if (containerEl instanceof SVGElement) {
    // console.warn("[cueButton] ❌ Container was SVG — overriding to singlePage-content");
    containerEl = document.getElementById("singlePage-content");
  }

  if (!containerEl) {
    // console.warn("[cueButton:create] ❌ No container for cueButton:", cueSvgEl?.id);
    return null;
  }

  // ------------------------------------------------------------
  // 2. Hide SVG marker unless part of reuse clone
  // ------------------------------------------------------------
  const insideReuse = !!cueSvgEl.closest('g[id^="reuse("]');
  // console.log("[cueButton:create] insideReuse:", insideReuse);

  if (!insideReuse) {
    cueSvgEl.style.visibility = "hidden";
    // console.log("[cueButton:create] SVG marker hidden (normal mode)");
  } else {
    // console.log("[cueButton:create] SVG marker NOT hidden (reuse clone)");
  }

  // ------------------------------------------------------------
  // 3. Create HTML button
  // ------------------------------------------------------------
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.className = "oscilla-cue-button";
  btn.style.position = "absolute";

  containerEl.appendChild(btn);

  // console.log("[cueButton:create] HTML button created:", btn);

  // ------------------------------------------------------------
  // 4. Normalize style block (opt.key → opt.style.key)
  // ------------------------------------------------------------
  if (!opt.style) {
    const styleKeys = [
      "size",
      "label",
      "font",
      "fontsize",
      "color",
      "textcolor",
      "active",
      "uid"
    ];
    const styleObj = {};
    let found = false;

    for (const k of styleKeys) {
      if (opt[k] !== undefined) {
        styleObj[k] = opt[k];
        found = true;
      }
    }

    if (found) {
      opt.style = styleObj;
      // console.log(
      //   "[cueButton:create] 🟦 Normalized flat style keys into opt.style:",
      //   styleObj
      // );
    }
  }

  // ------------------------------------------------------------
  // 5. Apply style() block
  // ------------------------------------------------------------
  if (opt.style) {
    const s = opt.style;
    // console.log("[cueButton:create] Applying style:", s);
    // Label override

    if (s.label) btn.textContent = s.label;

    // Size: "120x45"
    if (typeof s.size === "string") {
      const [w, h] = s.size.split("x").map(Number);
      if (!isNaN(w)) btn.style.width = `${w}px`;
      if (!isNaN(h)) btn.style.height = `${h}px`;
    }

    // Background color
    if (s.color) {
      btn.style.backgroundColor = s.color;
    }

    // Text color
    if (s.textcolor) {
      btn.style.color = s.textcolor;
    }

    // Font family
    if (s.font) {
      btn.style.fontFamily = s.font;
    }

    // Font size
    if (s.fontsize) {
      btn.style.fontSize = `${s.fontsize}px`;
    }

    // Active effect: flash
    if (s.active === "flash") {
      btn.classList.add("oscilla-button-flashable");
    }
  }

  // ------------------------------------------------------------
  // 6. Debug geometry
  // ------------------------------------------------------------
  // const debugCTM = () => {
  //   const ctm = cueSvgEl.getScreenCTM();
  //   const ctmLocal = cueSvgEl.getCTM();
  //   const bbox = cueSvgEl.getBBox?.();
  //   const containerRect = containerEl.getBoundingClientRect();

  //   console.log("\n[cueButton:geometry]");
  //   console.log("  cueSvgEl.getScreenCTM():", ctm);
  //   console.log("  cueSvgEl.getCTM():", ctmLocal);
  //   console.log("  cueSvgEl.getBBox():", bbox);
  //   console.log("  container rect:", containerRect);
  //   console.log("  marker visibility:", cueSvgEl.style.visibility);
  // };

  // debugCTM();

  // ------------------------------------------------------------
  // 7. Placement using BCR
  // ------------------------------------------------------------
  const place = () => {
    const bbox = cueSvgEl.getBBox();
    const ctm = cueSvgEl.getScreenCTM();
    const container = containerEl.getBoundingClientRect();

    // Screen coordinates of the SVG placeholder's true top-left
    const screenX = ctm.e + bbox.x * ctm.a;
    const screenY = ctm.f + bbox.y * ctm.d;

    // Convert to container-local coords
    const left = screenX - container.left + (opt.offsetX || 0);
    const top = screenY - container.top + (opt.offsetY || 0);

    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
  };


  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // console.log("[cueButton:create] 🔄 3×RAF reached — placing now");
        // debugCTM();
        place();
      }
      )
    )
  );

  window.addEventListener("resize", place);

  // ------------------------------------------------------------
  // 8. Button click → trigger cue
  // ------------------------------------------------------------
  btn.addEventListener("click", (e) => {
    console.log("[cueButton:CLICK]", label, triggerAst);
    e.preventDefault();
    e.stopPropagation();

    if (opt.style?.active === "flash") {
      btn.classList.add("flash");
      setTimeout(() => btn.classList.remove("flash"), 150);
    }

    try {
      handleCueTrigger(triggerAst, false, true, cueSvgEl);
    } catch (err) {
      console.error("[cueButton] ❌ Error in handleCueTrigger:", err);
    }
  });

  btn._cueMarkerEl = cueSvgEl;

  return btn;
}


export function hideAllButtonPlaceholders(svgRoot) {
  const markers = svgRoot.querySelectorAll('[id^="button("]');
  markers.forEach(el => {
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  });
  console.log(`[cueButton] 🔒 Hidden ${markers.length} button() placeholders (original + clones)`);
}