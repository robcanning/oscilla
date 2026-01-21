// ============================================================
// 🔹 PREFERENCES DIALOG — oscillaPreferences.js
// ============================================================

// Track the current save handler so we can remove it
let currentSaveController = null;

/**
 * Opens the preferences dialog and populates it with current project settings.
 */
async function openPreferencesDialog() {
  const dialog = document.querySelector("#preferences-dialog");
  const form = document.querySelector("#preferences-form");
  const saveBtn = document.querySelector("#preferences-save");

  if (!dialog || !form) {
    console.error("[Preferences] ❌ Dialog or form element not found");
    alert("Preferences dialog not available");
    return;
  }

  // Clear previous form content and show loading
  form.innerHTML = '<sl-spinner style="font-size: 2rem; display: block; margin: 2rem auto;"></sl-spinner>';
  
  // Open dialog immediately to show loading state
  dialog.show();

  try {
    const projectName = window.currentProjectName;
    if (!projectName) {
      form.innerHTML = '<p style="color: var(--sl-color-danger-600);">No project loaded.</p>';
      return;
    }

    // Fetch current preferences
    let prefs = {};
    try {
      const res = await fetch(`/scores/${projectName}/preferences.json`);
      if (res.ok) {
        prefs = await res.json();
      }
    } catch (e) {
      console.warn("[Preferences] Could not load existing preferences, using defaults");
    }

    // Define the preference fields with defaults
    const fields = [
      { key: "projectTitle", label: "Project Title", type: "text", default: projectName },
      { key: "projectAuthor", label: "Author", type: "text", default: "" },
      { key: "projectDescription", label: "Description", type: "text", default: "" },
      { key: "darkMode", label: "Dark Mode", type: "checkbox", default: false },
      { key: "defaultPlaybackSpeed", label: "Default Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "defaultViewMode", label: "Default View", type: "select", default: "scroll", options: ["scroll", "page"] },
      { key: "defaultPage", label: "Default Page", type: "text", default: "" },
      { key: "playzoneColor", label: "Playzone Color", type: "color", default: "#00ff0033" },
      { key: "playheadColor", label: "Playhead Color", type: "color", default: "#ff0000" },
      { key: "playheadWidth", label: "Playhead Width (px)", type: "number", default: 4, min: 1, max: 20 },
      { key: "audioSync", label: "Audio Sync", type: "checkbox", default: true },
      { key: "oscOutput", label: "OSC Output", type: "checkbox", default: true },
      { key: "overlayMode", label: "Overlay Mode", type: "checkbox", default: false },
      { key: "loopPlayback", label: "Loop Playback", type: "checkbox", default: false },
    ];

    // Build form HTML
    let html = '';
    for (const field of fields) {
      const value = prefs[field.key] ?? field.default;
      
      html += `<label for="pref-${field.key}">${field.label}</label>`;
      
      switch (field.type) {
        case "checkbox":
          html += `<sl-switch id="pref-${field.key}" name="${field.key}" ${value ? "checked" : ""}></sl-switch>`;
          break;
          
        case "select":
          html += `<sl-select id="pref-${field.key}" name="${field.key}" value="${value}">`;
          for (const opt of field.options) {
            html += `<sl-option value="${opt}">${opt}</sl-option>`;
          }
          html += `</sl-select>`;
          break;
          
        case "color":
          html += `<sl-color-picker id="pref-${field.key}" name="${field.key}" value="${value}" format="hex" no-format-toggle></sl-color-picker>`;
          break;
          
        case "number":
          html += `<sl-input id="pref-${field.key}" name="${field.key}" type="number" value="${value}" 
                    min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}"></sl-input>`;
          break;
          
        default:
          html += `<sl-input id="pref-${field.key}" name="${field.key}" type="text" value="${value || ''}"></sl-input>`;
      }
    }
    
    form.innerHTML = html;

    // Wire save button using AbortController to manage listener lifecycle
    if (saveBtn) {
      // Abort any previous listener
      if (currentSaveController) {
        currentSaveController.abort();
      }
      currentSaveController = new AbortController();

      saveBtn.addEventListener("click", async () => {
        saveBtn.loading = true;
        try {
          await savePreferences(projectName, fields, form);
          dialog.hide();
        } catch (err) {
          console.error("[Preferences] Save error:", err);
        } finally {
          saveBtn.loading = false;
        }
      }, { signal: currentSaveController.signal });
    } else {
      console.warn("[Preferences] ⚠️ Save button (#preferences-save) not found");
    }

  } catch (err) {
    console.error("[Preferences] Failed to load:", err);
    form.innerHTML = `<p style="color: var(--sl-color-danger-600);">Failed to load preferences: ${err.message}</p>`;
  }
}

/**
 * Saves preferences to the server
 */
async function savePreferences(projectName, fields, form) {
  const prefs = {};

  for (const field of fields) {
    const el = form.querySelector(`#pref-${field.key}`);
    if (!el) continue;

    switch (field.type) {
      case "checkbox":
        prefs[field.key] = el.checked;
        break;
      case "number":
        prefs[field.key] = parseFloat(el.value) || field.default;
        break;
      case "color":
        prefs[field.key] = el.value;
        break;
      case "select":
        prefs[field.key] = el.value;
        break;
      default:
        prefs[field.key] = el.value;
    }
  }

  // Use the correct endpoint: /save-preferences/:project
  const res = await fetch(`/save-preferences/${encodeURIComponent(projectName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Save failed");
  }

  console.log("[Preferences] ✅ Saved successfully");
  
  // Apply some preferences immediately
  applyPreferences(prefs);
}

/**
 * Apply preferences to the current session (live updates)
 */
function applyPreferences(prefs) {
  if (prefs.playheadColor) {
    const playhead = document.getElementById("playhead");
    if (playhead) playhead.style.backgroundColor = prefs.playheadColor;
  }

  if (prefs.playzoneColor) {
    const playzone = document.getElementById("playzone");
    if (playzone) playzone.style.backgroundColor = prefs.playzoneColor;
  }

  if (typeof prefs.darkMode === "boolean") {
    document.body.classList.toggle("dark-mode", prefs.darkMode);
  }

  if (prefs.defaultPlaybackSpeed && typeof window.setPlaybackSpeed === "function") {
    window.setPlaybackSpeed(prefs.defaultPlaybackSpeed);
  }
}

// Make available globally
window.openPreferencesDialog = openPreferencesDialog;
