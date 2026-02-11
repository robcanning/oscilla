/*!
 * layerFilter.js — Per-performer layer filtering for Oscilla
 * -----------------------------------------------------------
 * Scans Inkscape layers in score.svg, lets each performer select
 * their own part and dim other parts via opacity.
 *
 * Storage: localStorage (per-browser, per-project)
 * Key format: oscilla_layerFilter_<projectName>
 *
 * © 2025 Rob Canning — GPLv3
 */

const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";

// ============================================================
// Layer Scanning
// ============================================================

/**
 * Read an inkscape: attribute from a <g>, trying both namespace-aware
 * and plain attribute access (the latter is needed when SVG is
 * embedded in an HTML DOM where namespace resolution can differ).
 */
function readInkscapeAttr(el, localName) {
  return el.getAttributeNS(INKSCAPE_NS, localName)
      || el.getAttribute(`inkscape:${localName}`)
      || null;
}

/**
 * Scan an SVG element for Inkscape layers.
 * Populates window.scoreLayers with an array of { id, label, element }.
 * @param {SVGElement} svgElement
 * @returns {Array} discovered layers
 */
export function scanLayers(svgElement) {
  if (!svgElement) {
    console.warn("[LayerFilter] No SVG element provided");
    window.scoreLayers = [];
    return [];
  }

  const allGroups = svgElement.querySelectorAll("g");
  const layers = [];

  for (const g of allGroups) {
    const groupmode = readInkscapeAttr(g, "groupmode");
    if (groupmode !== "layer") continue;

    const label = readInkscapeAttr(g, "label");
    if (!label) continue;

    // Only include layers whose name contains "part" (case-insensitive)
    if (!label.toLowerCase().includes("part")) continue;

    layers.push({
      id: g.id,
      label: label.trim(),
      element: g
    });
  }

  window.scoreLayers = layers;
  console.log(`[LayerFilter] Found ${layers.length} layer(s):`,
    layers.map(l => `"${l.label}" (id=${l.id})`).join(", "));

  return layers;
}

// ============================================================
// Persistence (localStorage)
// ============================================================

function storageKey(projectName) {
  return `oscilla_layerFilter_${projectName}`;
}

/**
 * Read saved layer filter preferences for a project.
 * @param {string} projectName
 * @returns {{ myPart: string|null, otherOpacity: number }}
 */
export function getLayerFilterPrefs(projectName) {
  const defaults = { myPart: null, otherOpacity: 0.15 };
  if (!projectName) return defaults;

  try {
    const raw = localStorage.getItem(storageKey(projectName));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      myPart: parsed.myPart ?? null,
      otherOpacity: typeof parsed.otherOpacity === "number"
        ? parsed.otherOpacity : 0.15
    };
  } catch (e) {
    console.warn("[LayerFilter] Failed to read prefs:", e);
    return defaults;
  }
}

/**
 * Save layer filter preferences for a project.
 * @param {string} projectName
 * @param {{ myPart: string|null, otherOpacity: number }} prefs
 */
export function saveLayerFilterPrefs(projectName, prefs) {
  if (!projectName) return;
  try {
    localStorage.setItem(storageKey(projectName), JSON.stringify(prefs));
    console.log("[LayerFilter] Saved prefs:", prefs);
  } catch (e) {
    console.warn("[LayerFilter] Failed to save prefs:", e);
  }
}

// ============================================================
// Apply Filter
// ============================================================

/**
 * Apply the layer filter to the current SVG.
 * - If myPart is null or "all", all layers are fully visible.
 * - Otherwise, the selected layer gets opacity 1 and display:inline,
 *   all other layers get the configured otherOpacity.
 *
 * myPart is matched by layer ID (e.g. "layer1").
 *
 * @param {string} [projectName] defaults to window.currentProjectName
 */
export function applyLayerFilter(projectName) {
  projectName = projectName || window.currentProjectName;
  const layers = window.scoreLayers;
  if (!layers || layers.length === 0) return;

  const prefs = getLayerFilterPrefs(projectName);
  const { myPart, otherOpacity } = prefs;

  // No filtering — restore all layers to full visibility
  if (!myPart || myPart === "all") {
    for (const layer of layers) {
      layer.element.style.opacity = "";
      // Don't touch display — leave as authored in the SVG
    }
    console.log("[LayerFilter] No filter active — all layers at authored visibility");
    return;
  }

  // Validate that myPart matches a known layer ID.
  // If not (e.g. stale data from an older version that stored labels),
  // clear it and fall back to showing everything.
  const knownIds = layers.map(l => l.id);
  if (!knownIds.includes(myPart)) {
    console.warn(`[LayerFilter] Stored myPart="${myPart}" does not match any layer ID (${knownIds.join(", ")}). Clearing stale preference.`);
    saveLayerFilterPrefs(projectName, { myPart: null, otherOpacity });
    for (const layer of layers) {
      layer.element.style.opacity = "";
    }
    return;
  }

  for (const layer of layers) {
    // Ensure all layers are visible (override Inkscape display:none)
    layer.element.style.display = "inline";

    if (layer.id === myPart) {
      layer.element.style.opacity = "1";
      console.log(`[LayerFilter] MY PART: "${layer.label}" (${layer.id}) -> opacity 1`);
    } else {
      layer.element.style.opacity = String(otherOpacity);
      console.log(`[LayerFilter]   other: "${layer.label}" (${layer.id}) -> opacity ${otherOpacity}`);
    }
  }
}

// ============================================================
// Preferences UI — Parts Tab Content
// ============================================================

/**
 * Pretty-print a score filename for display.
 * "score.svg" → "Full Score"
 * "score-part-violin.svg" → "part violin"
 * "score-conductor.svg" → "conductor"
 */
function scoreFileLabel(filename) {
  if (filename === "score.svg") return "Full Score";
  return filename
    .replace(/^score-?/, "")
    .replace(/\.svg$/i, "")
    .replace(/-/g, " ");
}

/**
 * Build the HTML content for the "Parts" tab panel.
 * Includes:
 *  - Score file selector (when multiple score*.svg exist)
 *  - Layer filter controls (when layers detected)
 *  - Explanatory text when features are unavailable
 *
 * @param {string} projectName
 * @returns {string} HTML string
 */
export function buildLayerFilterSection(projectName) {
  const layers = window.scoreLayers;
  const scores = window.availableScores || [];
  const hasLayers = layers && layers.length > 0;
  const hasMultipleScores = scores.length > 1;

  let html = '<div class="pref-grid">';

  // ---- Score file selector ----
  if (hasMultipleScores) {
    const scoreSelKey = `oscilla_scoreFile_${projectName}`;
    const current = localStorage.getItem(scoreSelKey) || scores[0];

    let options = "";
    for (const file of scores) {
      const selected = (file === current) ? " selected" : "";
      options += `<option value="${file}"${selected}>${scoreFileLabel(file)}</option>`;
    }

    html += `<div class="pref-row">
      <label for="pref-scoreFile">Score</label>
      <select id="pref-scoreFile">${options}</select>
    </div>`;
  }

  // ---- Layer filter ----
  if (hasLayers) {
    if (hasMultipleScores) html += '<hr class="pref-divider">';

    const prefs = getLayerFilterPrefs(projectName);

    let layerOptions = '<option value="all">All (no filter)</option>';
    for (const layer of layers) {
      const selected = (prefs.myPart === layer.id) ? " selected" : "";
      layerOptions += `<option value="${layer.id}"${selected}>${layer.label}</option>`;
    }

    const currentOpacity = Math.round((prefs.otherOpacity ?? 0.15) * 100);

    html += `<div class="pref-row">
      <label for="pref-layerMyPart">My Part</label>
      <select id="pref-layerMyPart">${layerOptions}</select>
    </div>
    <div class="pref-row">
      <label for="pref-layerOtherOpacity">Other Parts</label>
      <div class="pref-range-wrap">
        <input type="range" id="pref-layerOtherOpacity"
               value="${currentOpacity}" min="0" max="100" step="5">
        <span class="pref-range-value" id="pref-layerOtherOpacity-value">${currentOpacity}%</span>
      </div>
    </div>`;
  }

  html += '</div>';

  // ---- Explanatory text ----
  if (!hasMultipleScores && !hasLayers) {
    html = `<div class="pref-parts-empty">
      <p>No parts detected in this score.</p>
      <p><strong>Separate score files:</strong> create individual SVGs
      named <code>score-part-violin.svg</code>,
      <code>score-part-cello.svg</code>, etc. alongside <code>score.svg</code>.
      Each performer can then choose their own scroll.</p>
      <p><strong>Stacked layers:</strong> organise a single SVG into
      Inkscape layers with the word <strong>part</strong> in each name
      (e.g. part-violin, part-cello). Each performer can highlight
      their layer and dim others.</p>
    </div>`;
  } else if (!hasLayers && hasMultipleScores) {
    html += `<div class="pref-parts-empty">
      <p>Tip: you can also add <strong>part</strong> layers
      inside each score SVG for per-layer filtering.</p>
    </div>`;
  } else if (hasLayers && !hasMultipleScores) {
    html += `<div class="pref-parts-empty">
      <p>Tip: you can also create separate score files
      (<code>score-part-violin.svg</code>, etc.) for
      per-performer scrolling scores.</p>
    </div>`;
  }

  return html;
}

/**
 * Wire up the Parts controls for live preview.
 * Handles both score file selector and layer filter.
 * @param {HTMLElement} form - The preferences form element
 * @param {string} projectName
 */
export function wireLayerFilterUI(form, projectName) {
  // ---- Score file selector ----
  const scoreSelect = form.querySelector("#pref-scoreFile");
  if (scoreSelect) {
    scoreSelect.addEventListener("change", () => {
      const scoreSelKey = `oscilla_scoreFile_${projectName}`;
      localStorage.setItem(scoreSelKey, scoreSelect.value);
      console.log(`[ScoreFile] Selection saved: ${scoreSelect.value} — reload to apply`);

      // Show reload notice
      let notice = form.querySelector("#pref-scoreFile-notice");
      if (!notice) {
        notice = document.createElement("div");
        notice.id = "pref-scoreFile-notice";
        notice.className = "pref-parts-empty";
        notice.style.marginTop = "4px";
        notice.innerHTML = '<p style="color:#fa3;">Score change takes effect on next project load.</p>';
        scoreSelect.parentElement.after(notice);
      }
    });
  }

  // ---- Layer filter ----
  const partSelect = form.querySelector("#pref-layerMyPart");
  const opacityRange = form.querySelector("#pref-layerOtherOpacity");
  const opacityValue = form.querySelector("#pref-layerOtherOpacity-value");

  if (!partSelect || !opacityRange) return;

  const applyLive = () => {
    const val = partSelect.value;
    console.log("[LayerFilter] UI change — select value:", JSON.stringify(val),
                "opacity:", opacityRange.value);

    const prefs = {
      myPart: val === "all" ? null : val,
      otherOpacity: parseInt(opacityRange.value, 10) / 100
    };
    saveLayerFilterPrefs(projectName, prefs);
    applyLayerFilter(projectName);
  };

  partSelect.addEventListener("change", applyLive);

  opacityRange.addEventListener("input", () => {
    if (opacityValue) opacityValue.textContent = opacityRange.value + "%";
  });
  opacityRange.addEventListener("change", applyLive);
}

/**
 * Read layer filter values from the form during a general save.
 * Also persists score file selection.
 * Called from oscillaPreferences.js save handler.
 * @param {HTMLElement} form
 * @param {string} projectName
 */
export function saveLayerFilterFromForm(form, projectName) {
  // Score file selection
  const scoreSelect = form.querySelector("#pref-scoreFile");
  if (scoreSelect) {
    const scoreSelKey = `oscilla_scoreFile_${projectName}`;
    localStorage.setItem(scoreSelKey, scoreSelect.value);
  }

  // Layer filter
  const partSelect = form.querySelector("#pref-layerMyPart");
  const opacityRange = form.querySelector("#pref-layerOtherOpacity");

  if (!partSelect || !opacityRange) return;

  const prefs = {
    myPart: partSelect.value === "all" ? null : partSelect.value,
    otherOpacity: parseInt(opacityRange.value, 10) / 100
  };

  saveLayerFilterPrefs(projectName, prefs);
  applyLayerFilter(projectName);
}

// ============================================================
// Window Bindings
// ============================================================

window.scanLayers = scanLayers;
window.applyLayerFilter = applyLayerFilter;
