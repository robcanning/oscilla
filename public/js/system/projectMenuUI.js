/*!
 * oscillaSystemProjectMenu.js — Project Discovery & Menu UI
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

// ===========================
// Project Menu Population
// ===========================

/**
 * Populate the project menu with available projects from the server
 */
export async function populateProjectMenu() {
  const submenu = document.getElementById("projects-submenu");
  if (!submenu) return;

  try {
    const text = await (await fetch("/scores/")).text();
    const projects = [...text.matchAll(/href="\/scores\/([^"\/]+)\//g)]
      .map(m => m[1])
      .filter(x => !x.startsWith("."));

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

    submenu.addEventListener("sl-select", handleProjectSelect);
  } catch (err) {
    console.error("[ProjectMenu] Error:", err);
  }
}

/**
 * Handle project selection from the menu
 * @param {CustomEvent} e - Selection event from sl-menu
 */
function handleProjectSelect(e) {
  const value = e.detail.item.value;
  if (value.startsWith("project:")) {
    const projectName = value.split(":")[1];
    window.loadProject?.(projectName, { resetOnLoad: true });
  }
}

/**
 * Get list of available projects
 * @returns {Promise<string[]>} Array of project names
 */
export async function getAvailableProjects() {
  try {
    const text = await (await fetch("/scores/")).text();
    return [...text.matchAll(/href="\/scores\/([^"\/]+)\//g)]
      .map(m => m[1])
      .filter(x => !x.startsWith("."));
  } catch (err) {
    console.error("[ProjectMenu] Error fetching projects:", err);
    return [];
  }
}

/**
 * Check if a project exists
 * @param {string} projectName - Name of the project
 * @returns {Promise<boolean>} True if project exists
 */
export async function projectExists(projectName) {
  const projects = await getAvailableProjects();
  return projects.includes(projectName);
}

// ===========================
// Window Bindings
// ===========================

// Expose to window for legacy compatibility
window.populateProjectMenu = populateProjectMenu;
