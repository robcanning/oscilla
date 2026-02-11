// ============================================================
// 🔹 PREFERENCES DIALOG — oscillaPreferences.js
// ============================================================

import { buildLayerFilterSection, wireLayerFilterUI, saveLayerFilterFromForm } from "./layerFilter.js";

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

  // Initialize dragging after dialog opens
  setTimeout(() => initDraggableDialog(dialog), 100);

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

    // Define the preference fields with defaults - organized into sections
    const sections = [
      {
        title: "Project Info",
        fields: [
          { key: "projectTitle", label: "Title", type: "text", default: projectName },
          { key: "projectAuthor", label: "Author", type: "text", default: "" },
          { key: "projectDescription", label: "Description", type: "text", default: "" },
        ]
      },
      {
        title: "Display",
        fields: [
          { key: "darkMode", label: "Dark Mode", type: "checkbox", default: false },
          { key: "defaultViewMode", label: "Default View", type: "select", default: "scroll", options: ["scroll", "page"] },
          { key: "defaultPage", label: "Default Page", type: "text", default: "" },
        ]
      },
      {
        title: "UI Behavior",
        fields: [
          { key: "pinControls", label: "Pin Transport", type: "checkbox", default: true },
          { key: "pinTopbar", label: "Pin Top Bar", type: "checkbox", default: true },
        ]
      },
      {
        title: "Playback",
        fields: [
          { key: "defaultPlaybackSpeed", label: "Default Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
          { key: "loopPlayback", label: "Loop", type: "checkbox", default: false },
          { key: "audioSync", label: "Audio Sync", type: "checkbox", default: true },
          { key: "oscOutput", label: "OSC Output", type: "checkbox", default: true },
        ]
      },
      {
        title: "Appearance",
        fields: [
          { key: "playzoneColor", label: "Playzone Color", type: "color", default: "#00ff0033" },
          { key: "playheadColor", label: "Playhead Color", type: "color", default: "#ff0000" },
          { key: "playheadWidth", label: "Playhead Width", type: "number", default: 4, min: 1, max: 20 },
          { key: "playheadOffset", label: "Playhead Position %", type: "range", default: 50, min: 10, max: 90, step: 1 },
        ]
      },
      {
        title: "Touch Settings",
        collapsed: true,
        fields: [
          { key: "touchSeekFriction", label: "Seek Friction", type: "range", default: 0.95, min: 0.85, max: 0.99, step: 0.01 },
          { key: "touchSeekStopThreshold", label: "Stop Threshold", type: "number", default: 5, min: 1, max: 50, step: 1 },
        ]
      },
    ];

    // Build compact form HTML
    let html = '';
    
    for (const section of sections) {
      html += `<details class="pref-section" ${section.collapsed ? '' : 'open'}>
        <summary>${section.title}</summary>
        <div class="pref-section-content">`;
      
      for (const field of section.fields) {
        const value = prefs[field.key] ?? field.default;
        
        html += `<div class="pref-row">
          <label for="pref-${field.key}">${field.label}</label>`;
        
        switch (field.type) {
          case "checkbox":
            html += `<sl-switch id="pref-${field.key}" name="${field.key}" size="small" ${value ? "checked" : ""}></sl-switch>`;
            break;
            
          case "select":
            html += `<sl-select id="pref-${field.key}" name="${field.key}" value="${value}" size="small">`;
            for (const opt of field.options) {
              html += `<sl-option value="${opt}">${opt}</sl-option>`;
            }
            html += `</sl-select>`;
            break;
            
          case "color":
            html += `<sl-color-picker id="pref-${field.key}" name="${field.key}" value="${value}" format="hex" no-format-toggle size="small"></sl-color-picker>`;
            break;
          
          case "range":
            html += `<div class="pref-range-wrap">
              <sl-range id="pref-${field.key}" name="${field.key}" value="${value}" 
                        min="${field.min ?? 0}" max="${field.max ?? 1}" step="${field.step ?? 0.01}"></sl-range>
              <span id="pref-${field.key}-value">${value}</span>
            </div>`;
            break;
            
          case "number":
            html += `<sl-input id="pref-${field.key}" name="${field.key}" type="number" value="${value}" 
                      min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" size="small"></sl-input>`;
            break;
            
          default:
            html += `<sl-input id="pref-${field.key}" name="${field.key}" type="text" value="${value || ''}" size="small"></sl-input>`;
        }
        
        html += `</div>`;
      }
      
      html += `</div></details>`;
    }
    
    // Append dynamic layer filter section (if layers exist in loaded SVG)
    html += buildLayerFilterSection(projectName);

    form.innerHTML = html;

    // Wire up range sliders to show live values
    form.querySelectorAll('sl-range').forEach(range => {
      const valueSpan = form.querySelector(`#${range.id}-value`);
      if (valueSpan) {
        range.addEventListener('sl-input', () => {
          valueSpan.textContent = range.value;
        });
      }
    });

    // Wire layer filter controls (live preview)
    wireLayerFilterUI(form, projectName);

    // Flatten fields for save
    const allFields = sections.flatMap(s => s.fields);

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
          await savePreferences(projectName, allFields, form);
          saveLayerFilterFromForm(form, projectName);
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
      case "range":
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
  applyPreferencesLive(prefs);
}

/**
 * Apply preferences to the current session (live updates after save)
 */
function applyPreferencesLive(prefs) {
  if (prefs.playheadColor) {
    const playhead = document.getElementById("playhead");
    if (playhead) playhead.style.backgroundColor = prefs.playheadColor;
  }

  if (prefs.playzoneColor) {
    const playzone = document.getElementById("playzone");
    if (playzone) playzone.style.backgroundColor = prefs.playzoneColor;
  }

  if (prefs.playheadOffset != null) {
    const ratio = Number(prefs.playheadOffset) / 100;
    window.setPlayheadOffset?.(ratio);
  }

  if (typeof prefs.darkMode === "boolean") {
    document.body.classList.toggle("dark-mode", prefs.darkMode);
  }

  if (prefs.defaultPlaybackSpeed && typeof window.setPlaybackSpeed === "function") {
    window.setPlaybackSpeed(prefs.defaultPlaybackSpeed);
  }

  // Pin state preferences - update both the global state and UI
  if (typeof prefs.pinControls === "boolean") {
    window.controlsPinned = prefs.pinControls;
    window.oscillaControlsPinned = prefs.pinControls;
    const pinBtn = document.getElementById("pin-controls");
    if (pinBtn) pinBtn.classList.toggle("active", prefs.pinControls);
    
    const controls = document.getElementById('controls');
    if (prefs.pinControls) {
      controls?.classList.remove('dismissed');
    }
  }
  
  if (typeof prefs.pinTopbar === "boolean") {
    window.topbarPinned = prefs.pinTopbar;
    window.oscillaTopbarPinned = prefs.pinTopbar;
    const pinBtn = document.getElementById("pin-topbar");
    if (pinBtn) pinBtn.classList.toggle("active", prefs.pinTopbar);
    
    const topBar = document.getElementById('top-bar');
    if (prefs.pinTopbar) {
      topBar?.classList.remove('dismissed');
    }
  }

  // Touch seek momentum settings (read by oscillaTouchSeek.js)
  if (typeof prefs.touchSeekFriction === "number") {
    window.touchSeekFriction = prefs.touchSeekFriction;
  }
  if (typeof prefs.touchSeekStopThreshold === "number") {
    window.touchSeekStopThreshold = prefs.touchSeekStopThreshold;
  }
}

// ============================================================
// DRAGGABLE DIALOG SUPPORT
// ============================================================

/**
 * Makes a Shoelace dialog draggable by its header
 */
function initDraggableDialog(dialog) {
  if (!dialog || dialog._draggableInitialized) return;

  // Wait for shadow DOM
  const tryInit = () => {
    const panel = dialog.shadowRoot?.querySelector('[part="panel"]');
    const header = dialog.shadowRoot?.querySelector('[part="header"]');
    
    if (!panel || !header) {
      setTimeout(tryInit, 50);
      return;
    }

    let isDragging = false;
    let startX, startY, initialX, initialY;

    function getTransform() {
      const style = window.getComputedStyle(panel);
      const matrix = new DOMMatrix(style.transform);
      return { x: matrix.m41, y: matrix.m42 };
    }

    header.style.cursor = 'move';
    header.style.userSelect = 'none';

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('[part="close-button"]')) return;
      
      isDragging = true;
      const transform = getTransform();
      startX = e.clientX;
      startY = e.clientY;
      initialX = transform.x;
      initialY = transform.y;
      
      panel.style.transition = 'none';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      panel.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
      }
    });

    // Reset position when dialog is closed
    dialog.addEventListener('sl-after-hide', () => {
      panel.style.transform = '';
      panel.style.transition = '';
    });

    dialog._draggableInitialized = true;
    console.log("[Preferences] Dialog dragging enabled");
  };

  tryInit();
}

// Make available globally
window.openPreferencesDialog = openPreferencesDialog;
