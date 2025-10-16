/*!
 * projectLoader.js — Modular project loader for OscillaScore
 * -----------------------------------------------------------
 * Handles loading of self-contained score projects from /scores/
 */

import { initializeSVG } from './app.js';
import { preloadSvgGroups } from './scoreSetup.js';

export async function loadProject(projectName) {
  try {
    console.log(`\n[loadProject] 🚀 Loading project: ${projectName}`);

    // 🧭 Detect built-in shared (help) project
    const isHelpProject =
      projectName === "help" ||
      projectName === "shared/help";

    // 1️⃣ Define base paths
    window.currentProject = projectName;

    if (isHelpProject) {
      // 🔹 Built-in Help / Demo project
      window.projectBase = `shared/help/`;
      console.log(`[loadProject] 📘 Using shared base: ${window.projectBase}`);
    } else {
      // 🔹 Regular user project
      window.projectBase = `scores/${projectName}/`;
    }

    window.svgDir = `${window.projectBase}`;
    window.audioDir = `${window.projectBase}audio/`;
    window.textDir = `${window.projectBase}texts/`;
    window.pagesDir = `${window.projectBase}pages/`;
    window.videoDir = `${window.projectBase}videos/`;
    window.sharedDir = `shared/`; // ⬅️ note: no "scores/" prefix here

    // 3️⃣ Preload any shared UI SVGs if needed
    const preloadList = [];
    await preloadSvgGroups(preloadList);

    // 4️⃣ Fetch main SVG
    const scorePath = `${window.svgDir}score.svg`;
    const container = document.getElementById("scoreContainer");
    if (!container) {
      console.error("[loadProject] ❌ No #scoreContainer found in DOM.");
      return;
    }

    const res = await fetch(scorePath);
    if (!res.ok) throw new Error(`Failed to load ${scorePath}`);
    const svgText = await res.text();

    // Parse SVG → DOM
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svgElement = doc.querySelector("svg");
    if (!svgElement) throw new Error("No <svg> root found in loaded file");

    // --- inside loadProject(projectName) before initializeSVG() ---
    console.group("[loadProject] Cleanup before new project");
    const oldButtons = document.querySelectorAll(".oscilla-cue-button");
    oldButtons.forEach(btn => btn.remove());
    console.log(`🧹 Removed ${oldButtons.length} cue buttons.`);

    const oldTexts = document.querySelectorAll("[id^='cueText-']");
    oldTexts.forEach(el => el.remove());
    console.log(`🧹 Removed ${oldTexts.length} cueText overlays.`);
    console.groupEnd();

    // --- now append new SVG ---
    container.innerHTML = "";
    container.appendChild(svgElement);

    // 🕓 ensure browser has painted SVG before measuring positions
    await new Promise(r => requestAnimationFrame(r));
    console.log("[loadProject] ✅ SVG rendered — safe to initialize.");

    // --- finally ---
    if (typeof initializeSVG === "function") {
      initializeSVG(svgElement);
    } else {
      console.warn("[loadProject] ⚠️ initializeSVG() not defined yet.");
    }


    console.log(`[loadProject] ✅ Project "${projectName}" fully loaded.`);

  } catch (err) {
    console.error(`[loadProject] ❌ Failed to load project "${projectName}":`, err);
  }
}




function hideSplash() {
  const splash = document.getElementById("splash");
  if (splash) splash.style.display = "none";
}



/**
 * resolveProjectPath(), populateProjectMenu()
 */
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


document.addEventListener("DOMContentLoaded", () => {
  const helpBtn = document.getElementById("load-help-btn");
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      console.log("[SPLASH] ▶️ Loading Help project");
      hideSplash();
      loadProject("help");
    });
    console.log("[SPLASH] Help button initialized.");
  }
});



// --- Hamburger Menu Behaviour ---

document.addEventListener("DOMContentLoaded", () => {
  const menu = document.querySelector("#hamburger-container sl-menu");

  if (!menu) {
    console.warn("[MENU] ⚠️ Hamburger menu not found in DOM.");
    return;
  }

  // 🔹 Helper functions for splash visibility
  function showSplash() {
    const splash = document.getElementById("splash");
    if (splash) {
      splash.style.display = "flex";
      splash.style.opacity = "1";
    }
  }

  function hideSplash() {
    const splash = document.getElementById("splash");
    if (splash) {
      splash.style.display = "none";
      splash.style.opacity = "0";
    }
  }


  menu.addEventListener("sl-select", async (event) => {
    const value = event.detail.item.value;
    console.log("[MENU] Selected:", value);

    switch (value) {
      case "load":
        console.log("[MENU] Opening project selector (splash).");
        showSplash();
        await showProjectList();
        break;

      case "settings":
        alert("⚙️ Settings coming soon.");
        break;

      case "save":
        alert("💾 Save State — not implemented yet.");
        break;

      case "quit":
        console.log("[MENU] Quit requested.");
        window.close?.();
        break;

      default:
        console.warn("[MENU] Unknown menu option:", value);
    }
  });

  async function showProjectList() {
    const splash = document.getElementById("splash");
    const projectList = document.querySelector("#splash #project-grid"); // scoped lookup
    const splashMsg = document.querySelector("#splash #splash-message");

    if (!splash || !projectList) {
      console.warn("[MENU] ⚠️ Splash or project grid missing in DOM.");
      return;
    }

    splash.style.display = "flex";
    if (!projectList) {
      console.warn("[MENU] ⚠️ No project grid found in DOM.");
      return;
    }

    // Always re-show splash before populating
    if (splash) showSplash();

    projectList.innerHTML = "<p>Loading projects...</p>";
    // if (splashMsg) splashMsg.textContent = "Loading available projects...";

    try {
      // 🔹 Fetch project directories
      const res = await fetch("/scores/");
      if (!res.ok) throw new Error("Failed to fetch scores directory listing");
      const text = await res.text();

      // Extract folder names
      const allProjects = [...text.matchAll(/href="([^"/]+)\/"/g)].map(m => m[1]);
      const userProjects = allProjects.filter(name => !/^help$/i.test(name));

      // Populate project list
      projectList.innerHTML = "";
      // const projectHeader = document.createElement("h3");
      // projectHeader.textContent = "Projects";
      // projectList.appendChild(projectHeader);

      userProjects.forEach(name => {
        const card = document.createElement("div"); // or "button"
        card.classList.add("project-card");
        card.textContent = name;
        card.addEventListener("click", () => {
          hideSplash();
          loadProject(name);
        });
        projectList.appendChild(card);
      });


      console.log(`[MENU] ✅ Loaded ${userProjects.length} projects.`);

    } catch (err) {
      console.error("[MENU] ❌ Failed to list projects:", err);
      projectList.innerHTML = `
      <p style="color:red">⚠️ Could not load project list.</p>
      <p>You can still <a href="https://github.com/robcanning/oscilla/wiki" target="_blank">
      read the online documentation</a>.</p>
    `;
    }
  }







});


window.loadProject = loadProject;

// --- Simple auto-load by URL (wait for DOM) ---
window.addEventListener("DOMContentLoaded", () => {
  const url = new URL(window.location.href);
  const projectArg =
    url.searchParams.get("project") || url.pathname.split("/").filter(Boolean)[0];

  if (projectArg) {
    console.log("[BOOT] Auto-loading project:", projectArg);
    loadProject(projectArg);

    const splash = document.getElementById("splash");
    if (splash) {
      splash.style.opacity = 0;
      setTimeout(() => (splash.style.display = "none"), 600);
    }
  }
});





