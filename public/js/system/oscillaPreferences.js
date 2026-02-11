// ============================================================
// PREFERENCES DIALOG — oscillaPreferences.js
// Native HTML — tabbed layout with Parts tab
// ============================================================

import { buildLayerFilterSection, wireLayerFilterUI, saveLayerFilterFromForm } from "./layerFilter.js";

let currentSaveController = null;

// ============================================================
// OPEN / CLOSE
// ============================================================

function showPreferencesDialog() {
  document.getElementById("preferences-overlay")?.classList.add("visible");
  document.getElementById("preferences-dialog")?.classList.add("visible");
}

function hidePreferencesDialog() {
  document.getElementById("preferences-overlay")?.classList.remove("visible");
  const dlg = document.getElementById("preferences-dialog");
  if (dlg) {
    dlg.classList.remove("visible");
    dlg.style.transform = "translate(-50%, -50%)";
  }
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function openPreferencesDialog() {
  const form = document.getElementById("preferences-form");
  const saveBtn = document.getElementById("preferences-save");
  const dialog = document.getElementById("preferences-dialog");

  if (!form || !dialog) {
    console.error("[Preferences] Dialog or form element not found");
    return;
  }

  form.innerHTML = '<p style="text-align:center; padding:1.5rem; opacity:0.5;">Loading...</p>';
  showPreferencesDialog();
  initDraggableDialog();

  try {
    const projectName = window.currentProjectName;
    if (!projectName) {
      form.innerHTML = '<p style="color:#e55;">No project loaded.</p>';
      return;
    }

    let prefs = {};
    try {
      const res = await fetch(`/scores/${projectName}/preferences.json`);
      if (res.ok) prefs = await res.json();
    } catch (e) {
      console.warn("[Preferences] Could not load existing preferences, using defaults");
    }

    // ---- Tab definitions ----
    // Fields with type "checkbox" or "color" render as half-width cells.
    // Fields with type "divider" insert a horizontal rule.
    // Tabs with custom:true get their content from buildLayerFilterSection.

    const tabs = [
      {
        id: "project",
        label: "Project",
        fields: [
          { key: "projectTitle", label: "Title", type: "text", default: projectName },
          { key: "projectAuthor", label: "Author", type: "text", default: "" },
          { key: "projectDescription", label: "Description", type: "text", default: "" },
        ]
      },
      {
        id: "settings",
        label: "Settings",
        fields: [
          { key: "darkMode", label: "Dark Mode", type: "checkbox", default: false },
          { key: "loopPlayback", label: "Loop", type: "checkbox", default: false },
          { key: "pinControls", label: "Pin Transport", type: "checkbox", default: true },
          { key: "pinTopbar", label: "Pin Top Bar", type: "checkbox", default: true },
          { key: "audioSync", label: "Audio Sync", type: "checkbox", default: true },
          { key: "oscOutput", label: "OSC Output", type: "checkbox", default: true },
          { type: "divider" },
          { key: "defaultViewMode", label: "Default View", type: "select", default: "hybrid", options: ["hybrid", "scroll", "page"] },
          { key: "defaultPage", label: "Default Page", type: "text", default: "" },
          { key: "defaultPlaybackSpeed", label: "Default Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
        ]
      },
      {
        id: "appearance",
        label: "UI",
        fields: [
          { key: "playzoneColor", label: "Playzone", type: "color", default: "#00ff0033" },
          { key: "playheadColor", label: "Playhead", type: "color", default: "#ff0000" },
          { key: "playheadWidth", label: "Playhead Width", type: "number", default: 4, min: 1, max: 20 },
          { key: "playheadOffset", label: "Playhead Pos %", type: "range", default: 50, min: 10, max: 90, step: 1 },
          { type: "divider" },
          { key: "touchSeekFriction", label: "Touch Friction", type: "range", default: 0.95, min: 0.85, max: 0.99, step: 0.01 },
          { key: "touchSeekStopThreshold", label: "Touch Stop", type: "number", default: 5, min: 1, max: 50, step: 1 },
        ]
      },
      {
        id: "parts",
        label: "Parts",
        custom: true
      },
    ];

    // ---- Build HTML ----

    // Tab bar
    let html = '<div class="pref-tabs">';
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      html += `<button type="button" class="pref-tab${i === 0 ? ' active' : ''}" data-tab="${tab.id}">${tab.label}</button>`;
    }
    html += '</div>';

    // Tab panels
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      html += `<div class="pref-panel${i === 0 ? ' active' : ''}" data-panel="${tab.id}">`;

      // Custom tab: content from layerFilter.js
      if (tab.custom) {
        html += buildLayerFilterSection(projectName);
        html += '</div>';
        continue;
      }

      // Standard tab: build field grid
      html += '<div class="pref-grid">';

      for (const field of tab.fields) {
        if (field.type === "divider") {
          html += '<hr class="pref-divider">';
          continue;
        }

        const value = prefs[field.key] ?? field.default;

        // Checkbox: half-width cell
        if (field.type === "checkbox") {
          html += `<div class="pref-cell">
            <label class="pref-toggle">
              <input type="checkbox" id="pref-${field.key}" ${value ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <label for="pref-${field.key}">${field.label}</label>
          </div>`;
          continue;
        }

        // Color: half-width cell
        if (field.type === "color") {
          html += `<div class="pref-cell">
            <input type="color" id="pref-${field.key}" value="${value}">
            <label for="pref-${field.key}">${field.label}</label>
          </div>`;
          continue;
        }

        // Full-width row
        html += `<div class="pref-row">
          <label for="pref-${field.key}">${field.label}</label>`;

        switch (field.type) {
          case "select":
            html += `<select id="pref-${field.key}">`;
            for (const opt of field.options) {
              html += `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt}</option>`;
            }
            html += `</select>`;
            break;

          case "range":
            html += `<div class="pref-range-wrap">
              <input type="range" id="pref-${field.key}" value="${value}"
                     min="${field.min ?? 0}" max="${field.max ?? 1}" step="${field.step ?? 0.01}">
              <span class="pref-range-value" id="pref-${field.key}-value">${value}</span>
            </div>`;
            break;

          case "number":
            html += `<input type="number" id="pref-${field.key}" value="${value}"
                      min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}">`;
            break;

          default:
            html += `<input type="text" id="pref-${field.key}" value="${value || ''}">`;
        }

        html += `</div>`;
      }

      html += '</div>'; // .pref-grid
      html += '</div>'; // .pref-panel
    }

    form.innerHTML = html;

    // ---- Wire tab switching ----
    form.querySelectorAll('.pref-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('.pref-tab').forEach(t => t.classList.remove('active'));
        form.querySelectorAll('.pref-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        form.querySelector(`.pref-panel[data-panel="${btn.dataset.tab}"]`)?.classList.add('active');
      });
    });

    // ---- Wire range sliders ----
    form.querySelectorAll('input[type="range"]').forEach(range => {
      const valueSpan = form.querySelector(`#${range.id}-value`);
      if (valueSpan) {
        range.addEventListener('input', () => {
          valueSpan.textContent = range.value;
        });
      }
    });

    // Wire layer filter controls (if present)
    wireLayerFilterUI(form, projectName);

    // ---- Wire save button ----
    const allFields = tabs.flatMap(t => t.fields || []).filter(f => f.key);

    if (saveBtn) {
      if (currentSaveController) currentSaveController.abort();
      currentSaveController = new AbortController();

      saveBtn.addEventListener("click", async () => {
        saveBtn.classList.add("saving");
        saveBtn.textContent = "Saving...";
        try {
          await savePreferences(projectName, allFields, form);
          saveLayerFilterFromForm(form, projectName);
          hidePreferencesDialog();
        } catch (err) {
          console.error("[Preferences] Save error:", err);
        } finally {
          saveBtn.classList.remove("saving");
          saveBtn.textContent = "Save";
        }
      }, { signal: currentSaveController.signal });
    }

  } catch (err) {
    console.error("[Preferences] Failed to load:", err);
    form.innerHTML = `<p style="color:#e55;">Failed to load preferences: ${err.message}</p>`;
  }
}

// ============================================================
// SAVE
// ============================================================

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
      default:
        prefs[field.key] = el.value;
    }
  }

  const res = await fetch(`/save-preferences/${encodeURIComponent(projectName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Save failed");
  }

  console.log("[Preferences] Saved successfully");
  applyPreferencesLive(prefs);
}

// ============================================================
// LIVE APPLICATION
// ============================================================

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

  if (typeof prefs.pinControls === "boolean") {
    window.controlsPinned = prefs.pinControls;
    window.oscillaControlsPinned = prefs.pinControls;
    const pinBtn = document.getElementById("pin-controls");
    if (pinBtn) pinBtn.classList.toggle("active", prefs.pinControls);
    const controls = document.getElementById('controls');
    if (prefs.pinControls) controls?.classList.remove('dismissed');
  }

  if (typeof prefs.pinTopbar === "boolean") {
    window.topbarPinned = prefs.pinTopbar;
    window.oscillaTopbarPinned = prefs.pinTopbar;
    const pinBtn = document.getElementById("pin-topbar");
    if (pinBtn) pinBtn.classList.toggle("active", prefs.pinTopbar);
    const topBar = document.getElementById('top-bar');
    if (prefs.pinTopbar) topBar?.classList.remove('dismissed');
  }

  if (typeof prefs.touchSeekFriction === "number") {
    window.touchSeekFriction = prefs.touchSeekFriction;
  }
  if (typeof prefs.touchSeekStopThreshold === "number") {
    window.touchSeekStopThreshold = prefs.touchSeekStopThreshold;
  }
}

// ============================================================
// DRAGGABLE DIALOG
// ============================================================

let _draggableInit = false;

function initDraggableDialog() {
  if (_draggableInit) return;

  const dialog = document.getElementById("preferences-dialog");
  const header = document.getElementById("preferences-header");
  if (!dialog || !header) return;

  let isDragging = false;
  let startX, startY, initialX, initialY;

  function getOffset() {
    const style = window.getComputedStyle(dialog);
    const matrix = new DOMMatrix(style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  }

  header.addEventListener('mousedown', (e) => {
    if (e.target.id === 'preferences-close') return;
    isDragging = true;
    const offset = getOffset();
    startX = e.clientX;
    startY = e.clientY;
    initialX = offset.x;
    initialY = offset.y;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    dialog.style.transform = `translate(${initialX + (e.clientX - startX)}px, ${initialY + (e.clientY - startY)}px)`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
    }
  });

  _draggableInit = true;
}

// ============================================================
// CLOSE HANDLERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("preferences-close")?.addEventListener("click", hidePreferencesDialog);
  document.getElementById("preferences-overlay")?.addEventListener("click", hidePreferencesDialog);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("preferences-dialog")?.classList.contains("visible")) {
      hidePreferencesDialog();
    }
  });
});

// ============================================================
// GLOBAL
// ============================================================

window.openPreferencesDialog = openPreferencesDialog;
window.hidePreferencesDialog = hidePreferencesDialog;
