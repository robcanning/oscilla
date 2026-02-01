/*!
 * oscillaSystemSVGInit.js — SVG Setup Lifecycle & Layout
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

import { propagate } from "../parser/preProcessPropagate.js";
import { destroyAllHitLabels } from "../oscillaHitLabels.js";
import { registerReuseBlocks, autoInjectUseBlocks } from "../parser/preProcessReuse.js";
import { hideAllButtonPlaceholders, buildCueButtonsIn } from "../cues/button.js";
import { animationAssign } from "../cues/animation.js";
import { initializeObserver } from "../oscillaObserver.js";
import { assignCues } from "../cues/cueDispatcher.js";
import { storePathVariants } from "./paths.js";
import { sendScoreMeta } from "./socket.js";

// ===========================
// SVG Initialization
// ===========================

/**
 * Initialize an SVG score element
 * @param {SVGElement} svgElement - The SVG element to initialize
 */
export async function initializeSVG(svgElement) {
  await settleDomForPropagate();
  console.log("[initializeSVG] 🔧 propagate() after FULL DOM settle");
  propagate(svgElement);

  const isPageOverlay =
    svgElement.id === "pageSVG" ||
    svgElement.classList.contains("oscilla-page");

  // HARD RESET of HTML overlays when mode changes
  if (window.isPageOverlay !== undefined &&
    window.isPageOverlay !== isPageOverlay) {
    destroyAllHitLabels(
      isPageOverlay ? "enter-page-mode" : "enter-scroll-mode"
    );
  }

  window.isPageOverlay = isPageOverlay;

  // ----- PAGE OVERLAY MODE -----
  if (isPageOverlay) {
    await initializePageMode(svgElement);
    return;
  }

  // ----- SCROLL MODE -----
  await initializeScrollMode(svgElement);
}

/**
 * Initialize page overlay mode
 * @param {SVGElement} svgElement - The SVG element
 */
async function initializePageMode(svgElement) {
  if (!window.pageRegistry || Object.keys(window.pageRegistry).length === 0) {
    window.buildPageRegistryFromDirIndex?.();
  }

  registerReuseBlocks(svgElement);
  autoInjectUseBlocks(svgElement);
  hideAllButtonPlaceholders(svgElement);
  storePathVariants(svgElement);
  animationAssign(svgElement);
  buildCueButtonsIn(svgElement, svgElement);
  initializeObserver();

  if (!window.cues) window.cues = [];
  assignCues(svgElement, window.cues);
  window.setupScore?.(svgElement);
  window.autostartStopwatchCues?.();
  window.autostartMetronomes?.();
}

/**
 * Initialize scroll mode
 * @param {SVGElement} svgElement - The SVG element
 */
async function initializeScrollMode(svgElement) {
  window.buildPageRegistryFromDirIndex?.();
  window.refreshAllPagesMenu?.();
  registerReuseBlocks(svgElement);
  storePathVariants(svgElement);
  
  if (window.playheadX === undefined) window.playheadX = 0;

  requestAnimationFrame(() => {
    animationAssign(svgElement);
    initializeObserver();

    // Final paint phase - assign cues + setupScore
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const svgReady = svgElement || document.querySelector("#scoreContainer svg");
        if (!svgReady) return;
        if (!window.cues) window.cues = [];
        assignCues(svgReady, window.cues);
        window.setupScore?.(svgReady);
      });
    });

    // Wide-scroll layout
    requestAnimationFrame(() => requestAnimationFrame(applyWideScrollLayout));

    // Disable native scrolling + measure world width
    setupScrollDisabling(svgElement);
    measureAndSyncScoreWidth(svgElement);
  });
}

/**
 * Apply wide scroll layout to container and SVG
 */
export function applyWideScrollLayout() {
  const cont = document.getElementById("scoreContainer");
  const svg = cont?.querySelector("svg");
  if (!svg || !cont) return;

  Object.assign(cont.style, {
    width: "100vw",
    height: "100vh",
    overflowX: "auto",
    overflowY: "hidden",
    whiteSpace: "nowrap",
    display: "block",
    position: "relative",
  });

  svg.removeAttribute("width");
  svg.removeAttribute("height");
  
  Object.assign(svg.style, {
    display: "inline-block",
    height: "100vh",
    width: "auto",
    maxWidth: "none",
    maxHeight: "100%",
    verticalAlign: "top",
  });

  svg.getBoundingClientRect();
}

/**
 * Setup scroll disabling for the container
 * @param {SVGElement} svgElement - The SVG element
 */
function setupScrollDisabling(svgElement) {
  const container = window.scoreContainer;
  const svg = svgElement;
  if (!container || !svg) return;

  container.style.overflow = "hidden";
  
  const stopScroll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  ["wheel", "touchmove", "gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
    container.addEventListener(ev, stopScroll, { passive: false })
  );

  container.addEventListener("scroll", () => {
    if (container.scrollLeft !== 0 || container.scrollTop !== 0) {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
  }, { passive: true });
}

/**
 * Measure score width and sync with server
 * @param {SVGElement} svgElement - The SVG element
 */
function measureAndSyncScoreWidth(svgElement) {
  const svg = svgElement;
  if (!svg) return;

  // Determine score width
  let width = null;
  const attrWidth = svg.getAttribute("width");
  if (attrWidth && !attrWidth.includes("%")) {
    width = parseFloat(attrWidth);
  }
  if (!width && svg.viewBox?.baseVal) {
    width = svg.viewBox.baseVal.width;
  }
  if (!width && svg.getBBox) {
    width = svg.getBBox().width;
  }
  window.scoreWidth = width || 40960;

  // Sync with server
  if (window.socket && window.scoreWidth) {
    sendScoreMeta({
      project: window.currentProject,
      scoreWidth: window.scoreWidth,
      renderedWidth: svg.getBoundingClientRect().width,
      duration: window.duration,
    });
  }
}

// ===========================
// DOM Settlement
// ===========================

/**
 * Wait for DOM to fully settle before propagate
 * This ensures all layout calculations are complete
 */
export async function settleDomForPropagate() {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await Promise.resolve();
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}

// ===========================
// Window Bindings
// ===========================

// Expose to window for legacy compatibility
window.initializeSVG = initializeSVG;
window.applyWideScrollLayout = applyWideScrollLayout;
