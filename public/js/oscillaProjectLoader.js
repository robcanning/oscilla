/*!
 * projectLoader.js — Modular project loader for OscillaScore
 * -----------------------------------------------------------
 * Handles loading of self-contained score projects from /scores/
 */

import { showLoader, updateLoader, hideLoader } from "./oscillaLoader.js";
import { initializeSVG } from "./app.js";
import { initializeObserver } from "./oscillaObserver.js";
import { setSpeed, applyDarkMode, initializeControlsPin, initializeTopbarPin } from "./oscillaTransport.js";
import { destroyAllHitLabels } from "./oscillaHitLabels.js";
import { preloadReuseBlocksFromPages } from "./oscillaPreProcessReuse.js";

import "./oscillaControlXYPresets.js";  
import "./oscillaControlXYPresetUI.js";  

let loadInProgress = false;
let projectMenuWired = false;

function recordRecentProject(name) {
  const key = "oscillaRecentProjects";
  let recents = JSON.parse(localStorage.getItem(key) || "[]");

  recents = recents.filter(p => p !== name);
  recents.unshift(name);
  recents = recents.slice(0, 10);

  localStorage.setItem(key, JSON.stringify(recents));
}



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

  // --- Other common overlay containers (defensive, cheap) ---
  try {
    const idsToClear = [
      "singlePage-content",
      "media-content",
      "cue-choice-container"
    ];
    idsToClear.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = "";
    });

    // hide popups if present
    const hideIds = ["singlePage-container", "media-popup", "video-popup", "pause-countdown"];
    hideIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
  } catch (e) {
    console.warn("[Cleanup] overlay container cleanup warning:", e);
  }

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
    const playhead = document.getElementById("playhead");
    if (playhead) {
      if (prefs.playheadColor) playhead.style.backgroundColor = prefs.playheadColor;
      if (prefs.playheadWidth) playhead.style.width = prefs.playheadWidth;
      if (prefs.playheadBorder) playhead.style.borderRight = prefs.playheadBorder;
    }

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
  if (loadInProgress) {
    console.warn("[loadProject] ⏳ Load already in progress — ignoring:", projectName);
    return;
  }

  loadInProgress = true;

  // Show loader (this also hides splash via z-index layering)
  showLoader(projectName);

  try {
    console.log(`\n[loadProject] 🚀 Loading project: ${projectName}`);
    const { resetOnLoad = false } = options;

    // Freeze cue-triggering while we rebuild DOM/state
    window.suppressCueTriggers = true;

    // Pause playback during switch (defensive)
    window.isPlaying = false;
    window.animationPaused = true;

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

    // HARD CLEANUP FIRST (this is what splash “gets for free” by being first load)
    console.log("[Project] 🔁 hard cleanup before mode switch");
    updateLoader("Cleaning up previous project...", 5);

    cleanupProjectOverlays();
    
    destroyAllHitLabels("project-load / mode-switch");

    // Reset cue state that tends to cause “misfire at load”
    window._prevCueLefts = new Map();
    window._cueInsideState = new Map();
    window.triggeredCues = new Set();
    window.cues = []; // important if other code pushes into it

    if (shouldReset) {
      console.log(`[Project] Resetting playhead for new project "${projectName}".`);
      window.playheadX = 0;
      window.elapsedTime = 0;
      if (window.scoreContainer) window.scoreContainer.scrollLeft = 0;

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

    // Tell server this project should start fresh
    if (window.socket) {
      window.socket.send(JSON.stringify({
        type: "reset_project_state",
        project: projectName
      }));
    }

    // 2️⃣ Load and apply preferences
    updateLoader("Loading preferences...", 15);

    const prefs = await loadPreferences(window.projectBase);
    applyPreferences(prefs);

    window.currentProjectPrefs = prefs;
    window.currentProjectName = projectName;

    // Update URL to reflect current project (without page reload)
    const newUrl = new URL(window.location);
    newUrl.searchParams.set("project", projectName);
    history.replaceState({ project: projectName }, "", newUrl);


    // Duration normalization (minutes → ms)
    if (prefs.duration_minutes && prefs.duration_minutes > 0) {
      window.duration = prefs.duration_minutes * 60 * 1000;
      console.log(`[Duration] 🎼 Set from prefs: ${prefs.duration_minutes} min → ${window.duration} ms`);
    } else {
      window.duration = 10 * 60 * 1000;
      console.log("[Duration] ⏱ Using default duration: 10 minutes");
    }

    applyDarkMode(!!prefs.darkMode);

    // Base speed multiplier
    if (prefs.defaultPlaybackSpeed && prefs.defaultPlaybackSpeed > 0) {
      window.baseSpeedMultiplier = prefs.defaultPlaybackSpeed;
      window.speedMultiplier = prefs.defaultPlaybackSpeed;
      window.updateSpeedDisplay?.();
      console.log(`[Prefs] 🎚️ Base speed multiplier set to ${prefs.defaultPlaybackSpeed}`);
    } else {
      window.baseSpeedMultiplier = 1;
      window.speedMultiplier = 1;
      console.log("[Prefs] 🎚️ Using default base speed: 1.0");
    }

    // 3️⃣ Preload reuse blocks BEFORE any mode loads (needed for both scroll and page mode)
    updateLoader("Loading reusable blocks...", 25);
    console.log("[loadProject] 📦 Preloading reuse blocks from pages directory...");
    await preloadReuseBlocksFromPages();
    console.log("[loadProject] ✅ Reuse blocks preloaded");

    // 4️⃣ Determine and load view mode
    updateLoader("Loading score...", 30);

    const viewMode = prefs.defaultViewMode || "scroll";
    const container = document.getElementById("scoreContainer") || document.querySelector("#scoreContainer");
    if (!container) throw new Error("Could not find #scoreContainer in the DOM.");
    window.scoreContainer = container;

    if (viewMode === "page") {
      const startPage = prefs.startPage || "home";
      console.log(`[loadProject] 📄 Page mode requested, loading "${startPage}"...`);
      // Defer page loading until after basic setup is complete
      setTimeout(() => {
        if (typeof window.handleCueTrigger === "function") {
          window.handleCueTrigger(`page(${startPage})`, false, true);
        } else {
          console.error("[loadProject] ❌ handleCueTrigger not available for page mode");
        }
      }, 100);
    } else {
      await loadScrollMode(container);
    }

    updateLoader("Initializing playback...", 85);



    // 5️⃣ Optional ?page override
    const params = new URLSearchParams(location.search);
    const directPage = params.get("page");
    if (directPage) {
      console.log(`[loadProject] ➡️ Detected ?page=${directPage} — will switch to page mode.`);
      setTimeout(() => {
        if (typeof window.handleCueTrigger === "function") {
          window.handleCueTrigger(`page(${directPage})`, false, true);
        }
      }, 200);
    }

    // Restore last saved playhead (only when NOT a switch)
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

    // Page registry + menus
    if (typeof window.buildPageRegistryFromDirIndex === "function") {
      await window.buildPageRegistryFromDirIndex();
    }
    if (typeof window.refreshAllPagesMenu === "function") {
      window.refreshAllPagesMenu();
    }

    recordRecentProject(projectName)
    console.log(`[loadProject] ✅ Project "${projectName}" fully loaded.`);
    hideSplashScreen();
    updateLoader("Ready", 100);



  } catch (err) {
    console.error(`[loadProject] ❌ Failed to load project "${projectName}":`, err);
  } finally {

    window.suppressCueTriggers = false;

    recordRecentProject(projectName);
    loadInProgress = false;
    hideLoader();

// initialize controlXY - after everything else is ready
if (typeof controlXYPresets?.init === "function") {
  setTimeout(() => {
    console.log(`[loadProject] ✅ Project "${projectName}" controlXYPresets initialised.`);
    controlXYPresets.init(projectName);
  }, 100);
}


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

  const inner = document.createElement("div");
  inner.id = "scoreInner";
  Object.assign(inner.style, {
    display: "block",
    margin: "0",
    padding: "0",
    lineHeight: "0"
  });

  container.appendChild(stage);
  stage.appendChild(inner);
  inner.appendChild(svg);

  window.mode = "scroll";
  console.log("[ScrollMode] ✅ Loaded score.svg into #scrollStage → #scoreInner → <svg>");

  if (typeof initializeSVG === "function") initializeSVG(svg);
  window.hideControls?.();
}


// ------------------------------------------------------------
// 📂 Utility: resolve project path
// ------------------------------------------------------------
export function resolveProjectPath(type, filename) {
  if (!filename) return "";
  switch (type) {
    case "audio": return `${window.audioDir}${filename}`;
    case "text": return `${window.textDir}${filename}`;
    case "video": return `${window.videoDir}${filename}`;
    case "page": return `${window.pagesDir}${filename}`;
    default: return `${window.projectBase}${filename}`;
  }
}

window.resolveProjectPath = resolveProjectPath;
window.loadProject = loadProject;



// ======================================================
// SPLASH SCREEN CONTROL
// ======================================================

function setSplashVisibility(show) {
  const splash = document.getElementById('splash');
  const scoreContainer = window.scoreContainer || document.getElementById('scoreContainer');
  const controls = document.getElementById('controls');

  if (!splash) {
    console.error('[Splash] Missing #splash element');
    return;
  }

  if (show) {
    console.log('[Splash] Showing splash screen.');
    splash.style.display = 'flex';
    splash.classList.remove('hidden');
    if (scoreContainer) scoreContainer.style.display = 'none';
    if (controls) controls.style.display = 'none';
  } else {
    console.log('[Splash] Hiding splash screen.');
    splash.style.display = 'none';
    splash.classList.add('hidden');

    if (scoreContainer) scoreContainer.style.display = 'block';
    if (controls) controls.style.display = 'flex';

    // ✅ Only reinitialize UI controls (not the SVG / score)
    setTimeout(() => {
      if (typeof initializeControlsPin === "function") initializeControlsPin();
      if (typeof initializeTopbarPin === "function") initializeTopbarPin();
    }, 300);

  }

}


function showSplashScreen() {
  const splash = document.getElementById("splash");
  if (!splash) return;

  splash.classList.remove("hidden");
  populateSplashProjects();
  wireSplashActions();
}

window.showSplashScreen = showSplashScreen;


export function hideSplashScreen() {
  closeProjectModal();
  setSplashVisibility(false);
}


export function toggleSplashScreen() {
  const splash = document.getElementById('splash');
  const isHidden = splash?.style.display === 'none' || splash?.classList.contains('hidden');
  setSplashVisibility(isHidden);
}

window.hideSplashScreen = hideSplashScreen;
window.toggleSplashScreen = toggleSplashScreen;



async function fetchProjects() {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}


function renderProjectMenu(projects) {
  const submenu = document.getElementById("projects-submenu");
  if (!submenu) return;

  submenu.innerHTML = "";

  if (!projects.length) {
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
}


function wireProjectMenu() {

  const submenu = document.getElementById("projects-submenu");
  if (!submenu) return;
  if (submenu.dataset.wired) return;

  submenu.dataset.wired = "true";

  submenu.addEventListener("sl-select", e => {
    const v = e.detail?.item?.value;
    if (v?.startsWith("project:")) {
      const project = v.slice(8);
      window.loadProject?.(project, { resetOnLoad: true });
    }
  });
  console.log("[ProjectMenu] submenu wired");

}


async function populateProjectMenu() {
  try {
    const projects = await fetchProjects();
    renderProjectMenu(projects);
    wireProjectMenu();
    console.log("[ProjectMenu] ✅ Updated:", projects);
  } catch (err) {
    console.error("[ProjectMenu] 🔥 Failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  populateProjectMenu();
});

window.populateProjectMenu = populateProjectMenu;


async function populateSplashProjects() {
  const grid = document.getElementById("project-grid");
  if (!grid) {
    console.warn("[SPLASH] #project-grid not found");
    return;
  }

  grid.innerHTML = "";

  try {
    const projects = await fetchProjects();

    if (!projects.length) {
      grid.innerHTML = `<div class="project-card muted">No projects found</div>`;
      return;
    }

    // --- show first 3 projects ---
    const visible = projects.slice(0, 3);

    visible.forEach(name => {
      grid.appendChild(makeProjectCard(name));
    });

    // --- add "Show all" if needed ---
    if (projects.length > 3) {
      grid.appendChild(makeShowAllCard(projects));
    }

  } catch (err) {
    console.error("[SPLASH] Failed to populate projects", err);
  }
}

function makeProjectCard(name) {
  const card = document.createElement("div");
  card.className = "project-card";
  card.title = name; // 👈 tooltip

  card.innerHTML = `
    <img src="/favicon.svg" alt="">
    <span>${name}</span>
  `;
  card.onclick = () => loadProject(name);
  return card;
}

function makeShowAllCard(projects) {
  const card = document.createElement("div");
  card.className = "project-card show-all";
  card.innerHTML = `
    <img src="/favicon.svg" alt="">
    <span>Show all</span>
  `;
  card.onclick = () => openProjectModal(projects);
  return card;
}


function openProjectModal(projects) {
  const modal = document.getElementById("project-modal");
  const grid = document.getElementById("project-modal-grid");

  if (!modal || !grid) return;

  grid.innerHTML = "";
  projects.forEach(name => {
    grid.appendChild(makeProjectCard(name));
  });

  modal.classList.remove("hidden");
}

function closeProjectModal() {
  document.getElementById("project-modal")?.classList.add("hidden");
}

window.closeProjectModal = closeProjectModal;



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
} else {
  if (typeof window.showSplashScreen === "function") {
    window.showSplashScreen();
  } else {
    console.warn("[Oscilla] showSplashScreen() not available yet.");
  }
}

function wireSplashActions() {
  const newBtn = document.getElementById("new-project-btn");
  const importBtn = document.getElementById("import-project-btn");

  // If buttons aren't in the DOM yet, try again shortly
  if (!newBtn || !importBtn) {
    console.warn("[Splash] Buttons not found yet, retrying…");
    setTimeout(wireSplashActions, 100);
    return;
  }

  // Prevent double wiring
  if (newBtn.dataset.wired) return;
  newBtn.dataset.wired = "true";

  newBtn.onclick = () => {
    console.log("[Splash] New Project");
    window.projectNew?.();
  };

  importBtn.onclick = () => {
    console.log("[Splash] Import Project");
    window.projectImport?.();
  };

  console.log("[Splash] Action buttons wired");
}