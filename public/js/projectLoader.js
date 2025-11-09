/*!
 * projectLoader.js — Modular project loader for OscillaScore
 * -----------------------------------------------------------
 * Handles loading of self-contained score projects from /scores/
 */

import { initializeSVG } from "./app.js";


import { setSpeed, applyDarkMode, toggleSplashScreen, hideSplashScreen } from "./transport.js";


export function cleanupProjectOverlays() {
  console.log("[Cleanup] Removing overlays, videos, audio, metronomes, stopwatches, cue buttons…");

  // --- Metronomes
  document.querySelectorAll(".cue-metronome").forEach(el => el.remove());

  // --- Stopwatches
  document.querySelectorAll("[id^='cue-stopwatch-']").forEach(el => el.remove());

  // --- Text overlays (cueText)
  document.querySelectorAll(".cue-text-overlay").forEach(el => el.remove());

  // --- Choice overlays
  document.querySelectorAll(".cue-choice-overlay").forEach(el => el.remove());

  // --- Cue Buttons
  document.querySelectorAll(".oscilla-cue-button").forEach(el => el.remove());


// --- VIDEO CLEANUP ---
document.querySelectorAll(".cue-video").forEach(vid => {
  try { vid.pause(); } catch(e){}
  try { vid.src = ""; } catch(e){}
  vid.remove();
});


  // ---------------------------------------------------
  //   AUDIO CUE CLEANUP 
  // ---------------------------------------------------
  if (window.activeAudioCues) {
    console.log("[Cleanup] Stopping active audio cues…");
    for (const voice of window.activeAudioCues) {
      try { voice.src.stop(); } catch(e){}
      try { voice.src.disconnect(); } catch(e){}
      try { voice.gainNode.disconnect(); } catch(e){}
    }
    window.activeAudioCues.clear();
  }

  console.log("[Cleanup] ✅ Done.");
}


// ------------------------------------------------------------
// 🚀 Main entry point
// ------------------------------------------------------------
export async function loadProject(projectName, options = {}) {
  try {

    console.log(`\n[loadProject] 🚀 Loading project: ${projectName}`);
    const { resetOnLoad = false } = options;

    // What was previously loaded in *this* session?
    const previousProject = window.currentProject || null;

    // What was the last project across reloads/tabs?
    const lastProject = sessionStorage.getItem("oscilla_lastProject") || null;

    // Update immediately
    window.currentProject = projectName;
    sessionStorage.setItem("oscilla_lastProject", projectName);

    // Decide if this counts as a "switch"
    const switchingInSession = !!previousProject && previousProject !== projectName;
    const switchingAcrossReload = !!lastProject && lastProject !== projectName;
    const shouldReset = resetOnLoad || switchingInSession || switchingAcrossReload;

    if (shouldReset) {
      console.log(`[Project] Resetting playhead for new project "${projectName}".`);
      window.playheadX = 0;
      window.elapsedTime = 0;
      if (window.scoreContainer) window.scoreContainer.scrollLeft = 0;

      // ------------------------------------------------------------
      // 🧹 Clear any old saved playhead position for this project
      // ------------------------------------------------------------
      const key = `oscilla_lastPos_${projectName}`;
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`[Project] Cleared old saved position for ${projectName}.`);
      }
    }

    // 1️⃣ Define base paths
    window.projectBase = `scores/${projectName}/`;
    window.svgDir = `${window.projectBase}`;
    window.audioDir = `${window.projectBase}audio/`;
    window.textDir = `${window.projectBase}texts/`;
    window.pagesDir = `${window.projectBase}pages/`;
    window.videoDir = `${window.projectBase}videos/`;
    window.sharedDir = `shared/`;

    // Reset canonical width + scale locally
    window.canonicalRenderedWidth = null;
    window.canonicalScale = null;

    // cleanupProjectOverlays(); // clear buttons videos metronomes etc
    // destroyAllCueButtons();



    // Tell server this project should start fresh
    if (window.socket) {
      window.socket.send(JSON.stringify({
        type: "reset_project_state",
        project: projectName   
      }));
    }



    // 2️⃣ Load and apply preferences
    const prefs = await loadPreferences(window.projectBase);


    // ✅ Duration normalization (minutes → ms)
    if (prefs.duration_minutes && prefs.duration_minutes > 0) {
      window.duration = prefs.duration_minutes * 60 * 1000;
      console.log(`[Duration] 🎼 Set from prefs: ${prefs.duration_minutes} min → ${window.duration} ms`);
    } else {
      window.duration = 10 * 60 * 1000; // fallback: 10 min
      console.log("[Duration] ⏱ Using default duration: 10 minutes");
    }


    applyDarkMode(!!prefs.darkMode);
    if (prefs.defaultPlaybackSpeed) setSpeed(prefs.defaultPlaybackSpeed);

    // 3️⃣ Prepare scroll container
    const container = document.getElementById("scoreContainer");
    if (!container) {
      console.error("[loadProject] ❌ No #scoreContainer found in DOM.");
      return;
    }
    Object.assign(container.style, {
      width: "100vw",
      height: "100vh",
      overflow: "hidden",
      whiteSpace: "nowrap",
      display: "block",
      position: "relative",
    });

    // 4️⃣ Load scroll score first (always)
    await loadScrollMode(container);

    // 5️⃣ Handle initial mode preference
    const mode = prefs.defaultViewMode || "scroll";
    const startPage = prefs.defaultPage || "home";

    if (mode === "page" || mode === "hybrid") {
      const cue = `cue:page(${startPage})`;
      console.log(`[ProjectLoader] 📄 Starting in ${mode} mode → ${cue}`);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.handleCueTrigger?.(cue))
      );
    }

    // Update the URL to ?project=name without reloading
    window.history.replaceState({}, "", `?project=${projectName}`);

    // ------------------------------------------------------------
    // 🕐 Restore last saved playhead (only when NOT a switch)
    // ------------------------------------------------------------
    const savedPos = localStorage.getItem(`oscilla_lastPos_${projectName}`);
    if (!shouldReset && savedPos) {
      console.log(`[Resume] Queuing jump to last playhead position: ${savedPos}px`);

      setTimeout(() => {
        if (window.scoreContainer) {
          window.playheadX = parseFloat(savedPos);
          window.scoreContainer.scrollLeft = window.playheadX;
          console.log(`[Resume] Jumped to saved position: ${savedPos}px`);
          window.togglePlay?.();
          window.togglePlay?.();
        }
      }, 300);
    }

    console.log(`[loadProject] ✅ Project "${projectName}" fully loaded.`);
    hideSplashScreen();
  } catch (err) {
    console.error(`[loadProject] ❌ Failed to load project "${projectName}":`, err);
  }
}

// ------------------------------------------------------------
// ⚙️ Load preferences.json (if available)
// ------------------------------------------------------------
async function loadPreferences(basePath) {
  const prefsPath = `${basePath}preferences.json`;
  try {
    const res = await fetch(prefsPath);
    if (!res.ok) throw new Error("No preferences.json found");
    const prefs = await res.json();
    console.log("[Prefs] ✅ Loaded project preferences:", prefs);
    window.oscillaPrefs = prefs;
    return prefs;
  } catch (err) {
    console.warn("[Prefs] ⚠️ Using defaults (no preferences.json):", err);
    const defaults = {
      darkMode: false,
      defaultPlaybackSpeed: 1.0,
      defaultViewMode: "scroll",
    };
    window.oscillaPrefs = defaults;
    return defaults;
  }
}

// ------------------------------------------------------------
// 🧾 SCROLL MODE — load main score.svg
// ------------------------------------------------------------
async function loadScrollMode(container) {
  const scorePath = `${window.svgDir}score.svg`;
  const res = await fetch(scorePath);
  if (!res.ok) throw new Error(`Failed to load ${scorePath}`);

  const svgText = await res.text();
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) throw new Error("No <svg> root found in loaded file");
  svg.id = "score";

  Object.assign(svg.style, {
    display: "inline-block",
    height: "100vh",
    width: "auto",
    maxWidth: "none",
    maxHeight: "100%",
    verticalAlign: "top",
  });

  // Clear container
  container.innerHTML = "";

  // ✅ Create transform isolation wrapper (scroll/pan layer)
  const stage = document.createElement("div");
  stage.id = "scrollStage";
  Object.assign(stage.style, {
    willChange: "transform",
    transformOrigin: "left top",
    display: "block",
    margin: "0",
    padding: "0",
    lineHeight: "0"
  });

  // ✅ Create world-width wrapper (the element that gets the canonical scaled size)
  const inner = document.createElement("div");
  inner.id = "scoreInner";
  Object.assign(inner.style, {
    display: "block",
    margin: "0",
    padding: "0",
    lineHeight: "0"
  });

  // ✅ Build the correct DOM hierarchy
  container.appendChild(stage);
  stage.appendChild(inner);
  inner.appendChild(svg);

  window.mode = "scroll";

  console.log("[ScrollMode] ✅ Loaded score.svg into #scrollStage → #scoreInner → <svg>");
  if (typeof initializeSVG === "function") initializeSVG(svg);



  window.hideControls?.();
  window.toggleScoreNotes();


}

// ------------------------------------------------------------
// 📚 Preload reusable shared SVG groups
// ------------------------------------------------------------
export async function preloadSvgGroups(list = []) {
  window.groupRegistry = window.groupRegistry || {};

  for (const src of list) {
    try {
      const text = await fetch(src).then((r) => r.text());
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const groups = doc.querySelectorAll(
        'g[id^="group-"], g[id^="menu-"], g[id^="ui-"]'
      );
      groups.forEach((g) => {
        const id = g.id.replace(/^group-|^menu-|^ui-/, "");
        window.groupRegistry[id] = g.cloneNode(true);
      });
      console.log(`[preloadSvgGroups] ✅ Loaded from ${src}`);
    } catch (err) {
      console.warn(`[preloadSvgGroups] ⚠️ Could not load ${src}: ${err}`);
    }
  }

  console.log(
    `[preloadSvgGroups] Registered ${Object.keys(window.groupRegistry).length} groups`
  );
}

// ------------------------------------------------------------
// 📂 Utility: resolve project path
// ------------------------------------------------------------
export function resolveProjectPath(type, filename) {
  if (!filename) return "";
  switch (type) {
    case "audio":
      return `${window.audioDir}${filename}`;
    case "text":
      return `${window.textDir}${filename}`;
    case "video":
      return `${window.videoDir}${filename}`;
    case "page":
      return `${window.pagesDir}${filename}`;
    default:
      return `${window.projectBase}${filename}`;
  }
}

window.resolveProjectPath = resolveProjectPath;
window.loadProject = loadProject;

// ------------------------------------------------------------
// 🔗 Auto-load project if specified in URL (?project=name)
// ------------------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const projectFromURL = urlParams.get("project");

if (projectFromURL) {
  console.log(`[Oscilla] Loading project from URL: ${projectFromURL}`);
  loadProject(projectFromURL);
} else {
  if (typeof window.showSplashScreen === "function") {
    window.showSplashScreen();
  } else {
    console.warn("[Oscilla] showSplashScreen() not available yet.");
  }
}

