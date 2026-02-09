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
// Preferences UI Section
// ============================================================

/**
 * Build the HTML for the "Parts" section in the preferences dialog.
 * Returns empty string if no layers found.
 *
 * Uses layer.id as the option value (reliable, no spaces).
 * Displays layer.label as the visible text.
 *
 * @param {string} projectName
 * @returns {string} HTML string
 */
export function buildLayerFilterSection(projectName) {
  const layers = window.scoreLayers;
  if (!layers || layers.length === 0) return "";

  const prefs = getLayerFilterPrefs(projectName);

  let options = `<sl-option value="all">All (no filter)</sl-option>`;
  for (const layer of layers) {
    options += `<sl-option value="${layer.id}">${layer.label}</sl-option>`;
  }

  const currentOpacity = Math.round((prefs.otherOpacity ?? 0.15) * 100);

  return `<details class="pref-section" open>
    <summary>Parts</summary>
    <div class="pref-section-content">
      <div class="pref-row">
        <label for="pref-layerMyPart">My Part</label>
        <sl-select id="pref-layerMyPart" name="layerMyPart"
                   value="${prefs.myPart || 'all'}" size="small">
          ${options}
        </sl-select>
      </div>
      <div class="pref-row">
        <label for="pref-layerOtherOpacity">Other Parts</label>
        <div class="pref-range-wrap">
          <sl-range id="pref-layerOtherOpacity" name="layerOtherOpacity"
                    value="${currentOpacity}"
                    min="0" max="100" step="5"
                    label="Other parts opacity"></sl-range>
          <span id="pref-layerOtherOpacity-value">${currentOpacity}%</span>
        </div>
      </div>
    </div>
  </details>`;
}

/**
 * Wire up the Parts section event handlers after it's been
 * inserted into the preferences form. Provides live preview.
 * @param {HTMLElement} form - The preferences form element
 * @param {string} projectName
 */
export function wireLayerFilterUI(form, projectName) {
  const partSelect = form.querySelector("#pref-layerMyPart");
  const opacityRange = form.querySelector("#pref-layerOtherOpacity");
  const opacityValue = form.querySelector("#pref-layerOtherOpacity-value");

  if (!partSelect || !opacityRange) return;

  // Live preview on change
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

  partSelect.addEventListener("sl-change", applyLive);

  opacityRange.addEventListener("sl-input", () => {
    if (opacityValue) opacityValue.textContent = opacityRange.value + "%";
  });
  opacityRange.addEventListener("sl-change", applyLive);
}

/**
 * Read layer filter values from the form during a general save.
 * Called from oscillaPreferences.js save handler.
 * @param {HTMLElement} form
 * @param {string} projectName
 */
export function saveLayerFilterFromForm(form, projectName) {
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
