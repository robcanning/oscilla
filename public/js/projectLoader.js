/*!
 * projectLoader.js — Modular project loader for OscillaScore
 * -----------------------------------------------------------
 * Handles loading of self-contained score projects from /scores/
 */

import { initializeSVG } from "./app.js";
import { initializeObserver } from "./oscillaObserver.js";
import { setSpeed, applyDarkMode, toggleSplashScreen, hideSplashScreen } from "./oscillaTransport.js";
import { destroyAllHitLabels } from "./oscillaHitLabels.js";


export function cleanupProjectOverlays() {
  console.log("[Cleanup] Removing overlays, videos, audio, metronomes, stopwatches, cue buttons…");

  destroyAllHitLabels("project-load");

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
    try { vid.pause(); } catch (e) { }
    try { vid.src = ""; } catch (e) { }
    vid.remove();
  });


  // ---------------------------------------------------
  //   AUDIO CUE CLEANUP 
  // ---------------------------------------------------
  if (window.activeAudioCues) {
    console.log("[Cleanup] Stopping active audio cues…");
    for (const voice of window.activeAudioCues) {
      try { voice.src.stop(); } catch (e) { }
      try { voice.src.disconnect(); } catch (e) { }
      try { voice.gainNode.disconnect(); } catch (e) { }
    }
    window.activeAudioCues.clear();
  }

  console.log("[Cleanup] ✅ Done.");
}

window.applyPreferences = function applyPreferences(prefs) {
  console.log("[Prefs] applyPreferences() called:", prefs);

  // 1. Dark mode
  applyDarkMode?.(!!prefs.darkMode);

  // 2. Duration (your baseline speed control)
  if (prefs.duration_minutes > 0) {
    window.duration = prefs.duration_minutes * 60 * 1000;
    console.log(`[Prefs] duration set to ${window.duration} ms`);
  }

  // 3. OSC + audio sync toggles
  window.oscOutputEnabled = !!prefs.oscOutput;
  window.audioSyncEnabled = !!prefs.audioSync;

  // 4. Loop playback
  window.loopPlayback = !!prefs.loopPlayback;

// 5. Playhead + playzone styling
try {

  // ---- PLAYHEAD ----
  const playhead = document.getElementById("playhead");
  if (playhead) {
    if (prefs.playheadColor)  playhead.style.backgroundColor = prefs.playheadColor;
    if (prefs.playheadWidth)  playhead.style.width = prefs.playheadWidth;
    if (prefs.playheadBorder) playhead.style.borderRight = prefs.playheadBorder;
  }

  // ---- PLAYZONE ----
  const zone = document.getElementById("playzone");
  if (zone) {
    if (prefs.playzoneColor) zone.style.backgroundColor = prefs.playzoneColor;
  }

} catch (err) {
  console.warn("[Prefs] playhead/playzone styling failed:", err);
}


};


// ------------------------------------------------------------
// 🚀 Main entry point
// ------------------------------------------------------------
export async function loadProject(projectName, options = {}) {
  try {

        console.log("[Project] 🔁 hard cleanup before mode switch");

    destroyAllHitLabels("project-load / mode-switch");


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

    applyPreferences(prefs);

    // ✅ Make available to Preferences dialog and runtime
    window.currentProjectPrefs = prefs;
    window.currentProjectName = projectName;

    // ✅ Duration normalization (minutes → ms)
    if (prefs.duration_minutes && prefs.duration_minutes > 0) {
      window.duration = prefs.duration_minutes * 60 * 1000;
      console.log(`[Duration] 🎼 Set from prefs: ${prefs.duration_minutes} min → ${window.duration} ms`);
    } else {
      window.duration = 10 * 60 * 1000; // fallback: 10 min
      console.log("[Duration] ⏱ Using default duration: 10 minutes");
    }

    applyDarkMode(!!prefs.darkMode);

    // ============================================================
    // 🎚️ BASE SPEED MULTIPLIER — from preferences
    // ============================================================
    // This is the "global tempo" multiplier that all speed cues multiply against.
    // e.g., baseSpeedMultiplier = 0.3 means:
    //   - speed(1) in score → actual speed = 1 × 0.3 = 0.3
    //   - speed(3) in score → actual speed = 3 × 0.3 = 0.9
    // ============================================================
    if (prefs.defaultPlaybackSpeed && prefs.defaultPlaybackSpeed > 0) {
      window.baseSpeedMultiplier = prefs.defaultPlaybackSpeed;
      window.speedMultiplier = prefs.defaultPlaybackSpeed; // initial speed before any cues
      window.updateSpeedDisplay?.();
      console.log(`[Prefs] 🎚️ Base speed multiplier set to ${prefs.defaultPlaybackSpeed}`);
    } else {
      window.baseSpeedMultiplier = 1;
      window.speedMultiplier = 1;
      console.log("[Prefs] 🎚️ Using default base speed: 1.0");
    }



    // create preferences dialog from json
    window.openPreferencesDialog = function openPreferencesDialog() {
      console.log("[Prefs] openPreferencesDialog() called");

      const dlg = document.getElementById("preferences-dialog");
      const form = document.getElementById("preferences-form");

      console.log("[Prefs] dialog:", dlg);
      console.log("[Prefs] form:", form);

      // Where prefs should come from
      const prefs = window.currentProjectPrefs;
      const projectName = window.currentProjectName;

      console.log("[Prefs] currentProjectName:", projectName);
      console.log("[Prefs] currentProjectPrefs:", prefs);

      if (!prefs) {
        console.warn("[Prefs] ❌ No preferences loaded — aborting UI build");
        dlg.show();
        return;
      }

      form.innerHTML = ""; // clear

      for (const [key, value] of Object.entries(prefs)) {
        if (key.startsWith("_")) {
          console.log(`[Prefs] Skipping metadata key: ${key}`);
          continue;
        }

        console.log(`[Prefs] Building field: ${key} =`, value);

        const label = document.createElement("label");
        label.textContent = key;

        let input;
        if (typeof value === "boolean") {
          input = document.createElement("sl-switch");
          input.checked = value;
        } else if (typeof value === "number") {
          input = document.createElement("input");
          input.type = "number";
          input.value = value;
        } else {
          input = document.createElement("input");
          input.type = "text";
          input.value = value;
        }

        input.dataset.prefKey = key;

        form.appendChild(label);
        form.appendChild(input);
      }

      console.log("[Prefs] ✅ UI build complete — now displaying dialog.");

      dlg.show();
    };




    // Expose for external UI
    window.openPreferencesDialog = openPreferencesDialog;


    // 3️⃣ Determine and load view mode
    const viewMode = prefs.defaultViewMode || "scroll";

    const container = document.getElementById("scoreContainer")
      || document.getElementById("scoreInner")
      || document.querySelector("#scoreContainer");

    if (!container) {
      throw new Error("Could not find #scoreContainer in the DOM.");
    }

    window.scoreContainer = container;

    if (viewMode === "page") {
      // await loadPageMode(container, prefs.startPage || "main");
    } else {
      await loadScrollMode(container);
    }

    // 4️⃣ Check for query param page override (for direct page links)
    const params = new URLSearchParams(location.search);
    const directPage = params.get("page");
    if (directPage) {
      console.log(`[loadProject] ➡️ Detected ?page=${directPage} — will switch to page mode.`);
      // await loadPageMode(container, directPage);
    }


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

    // populate the project menu
    window.loadProject = new Proxy(window.loadProject, {
      apply(target, thisArg, args) {
        const result = Reflect.apply(target, thisArg, args);
        requestAnimationFrame(populateProjectMenu);
        return result;
      }
    });

    // ✅ Build page registry FIRST, then refresh menu
    if (typeof window.buildPageRegistryFromDirIndex === "function") {
      await window.buildPageRegistryFromDirIndex();
    }

    if (typeof window.refreshAllPagesMenu === "function") {
      window.refreshAllPagesMenu();
    }


    console.log(`[loadProject] ✅ Project "${projectName}" fully loaded.`);


    // initializeObserver();


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
// 🔗 Auto-load project & optional page
// ------------------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const projectFromURL = urlParams.get("project");
const pageFromURL = urlParams.get("page");

if (projectFromURL) {
  loadProject(projectFromURL).then(() => {
    if (pageFromURL) {
      const wait = setInterval(() => {
        if (window.pageState?.mode === "scroll" && !window.isCuePagePlaylistActive) {
          clearInterval(wait);
          handleCueTrigger(`page(${pageFromURL})`, false, true);
        }
      }, 650);
    }
  });
}
else {
  if (typeof window.showSplashScreen === "function") {
    window.showSplashScreen();
  } else {
    console.warn("[Oscilla] showSplashScreen() not available yet.");
  }
}


async function populateProjectMenu() {
  console.log("[ProjectMenu] 🟡 Starting populateProjectMenu()");

  const submenu = document.getElementById("projects-submenu");
  if (!submenu) {
    console.warn("[ProjectMenu] ❌ #projects-submenu not found in DOM");
    return;
  }

  try {
    console.log("[ProjectMenu] Fetching /scores/…");
    const res = await fetch("/scores/");
    const text = await res.text();

    console.log("[ProjectMenu] Raw fetch response:\n", text.substring(0, 300), "…");

    // ✅ Correct regex for href="/scores/NAME/"
    const matches = [...text.matchAll(/href="\/scores\/([^"\/]+)\//g)];
    const projects = matches.map(m => m[1]).filter(x => !x.startsWith("."));

    console.log("[ProjectMenu] Extracted projects:", projects);

    submenu.innerHTML = "";

    if (projects.length === 0) {
      const item = document.createElement("sl-menu-item");
      item.disabled = true;
      item.textContent = "(no projects found)";
      submenu.appendChild(item);
      return;
    }

    projects.forEach(name => {
      const item = document.createElement("sl-menu-item");
      item.textContent = name;
      item.value = `project:${name}`;
      submenu.appendChild(item);
    });

    submenu.addEventListener("sl-select", (e) => {
      const v = e.detail.item.value;
      if (v.startsWith("project:")) {
        const project = v.split(":")[1];
        console.log(`[ProjectMenu] 🟢 Loading project: ${project}`);
        window.loadProject?.(project, { resetOnLoad: true });
      }
    });

    console.log("[ProjectMenu] ✅ Project submenu updated:", projects);

  } catch (err) {
    console.error("[ProjectMenu] 🔥 ERROR while listing /scores/:", err);
  }
}

document.addEventListener("DOMContentLoaded", populateProjectMenu);

document.addEventListener("DOMContentLoaded", populateProjectMenu);


window.populateProjectMenu = populateProjectMenu;

document.addEventListener("DOMContentLoaded", populateProjectMenu);