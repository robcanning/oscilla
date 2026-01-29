/*!
 * oscillaControlXYPresetUI.js — Preset Management UI
 * Part of oscillaScore control plane
 * © 2025 Rob Canning — GPLv3
 *
 * Provides a floating panel UI for managing controlXY presets
 */

// ============================================================================
// UI STATE
// ============================================================================

let panelVisible = false;
let panelElement = null;

// ============================================================================
// CREATE UI
// ============================================================================

export function createPresetUI() {
  if (panelElement) return panelElement;
  
  panelElement = document.createElement('div');
  panelElement.id = 'controlxy-preset-panel';
  panelElement.innerHTML = `
    <div class="controlxy-panel-header">
      <span class="controlxy-panel-title">XY Presets</span>
      <button class="controlxy-panel-close" title="Close">×</button>
    </div>
    
    <div class="controlxy-panel-body">
      <!-- Save Section -->
      <div class="controlxy-section">
        <div class="controlxy-section-title">Save Preset</div>
        <div class="controlxy-input-row">
          <input type="text" id="controlxy-save-name" placeholder="Preset name..." />
          <button id="controlxy-save-btn" title="Save current positions">💾</button>
        </div>
      </div>
      
      <!-- Presets List -->
      <div class="controlxy-section">
        <div class="controlxy-section-title">Presets</div>
        <div id="controlxy-preset-list" class="controlxy-preset-list">
          <div class="controlxy-empty">No presets saved</div>
        </div>
      </div>
      
      <!-- Recall Options -->
      <div class="controlxy-section">
        <div class="controlxy-section-title">Recall Options</div>
        <div class="controlxy-options-row">
          <label>
            Duration:
            <input type="number" id="controlxy-recall-dur" value="0" min="0" max="30" step="0.1" />
            <span>s</span>
          </label>
          <label>
            Ease:
            <select id="controlxy-recall-ease">
              <option value="linear">Linear</option>
              <option value="easeInOutSine" selected>Sine</option>
              <option value="easeInOutQuad">Quad</option>
              <option value="easeInOutCubic">Cubic</option>
              <option value="easeInOutBack">Back</option>
              <option value="easeOutElastic">Elastic</option>
            </select>
          </label>
        </div>
      </div>
      
      <!-- Sequences Section -->
      <div class="controlxy-section">
        <div class="controlxy-section-title">Sequences</div>
        <div id="controlxy-sequence-list" class="controlxy-preset-list">
          <div class="controlxy-empty">No sequences defined</div>
        </div>
        <div class="controlxy-sequence-controls">
          <button id="controlxy-seq-stop" title="Stop sequence">⏹ Stop</button>
          <label>
            <input type="checkbox" id="controlxy-seq-loop" /> Loop
          </label>
        </div>
      </div>
      
      <!-- Import/Export -->
      <div class="controlxy-section">
        <div class="controlxy-section-title">Import / Export</div>
        <div class="controlxy-button-row">
          <button id="controlxy-export-btn">📤 Export</button>
          <button id="controlxy-import-btn">📥 Import</button>
        </div>
        <input type="file" id="controlxy-import-file" accept=".json" style="display:none" />
      </div>
    </div>
  `;
  
  document.body.appendChild(panelElement);
  
  // Bind events
  bindUIEvents();
  
  // Initial refresh
  refreshPresetList();
  refreshSequenceList();
  
  // Listen for changes
  window.addEventListener('controlxy:presetSaved', refreshPresetList);
  window.addEventListener('controlxy:presetDeleted', refreshPresetList);
  window.addEventListener('controlxy:presetsImported', () => {
    refreshPresetList();
    refreshSequenceList();
  });
  
  console.log("[controlXY] Preset UI created");
  
  return panelElement;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindUIEvents() {
  // Close button
  panelElement.querySelector('.controlxy-panel-close').addEventListener('click', hidePresetUI);
  
  // Save button
  panelElement.querySelector('#controlxy-save-btn').addEventListener('click', () => {
    const nameInput = panelElement.querySelector('#controlxy-save-name');
    const name = nameInput.value.trim();
    
    if (!name) {
      nameInput.classList.add('controlxy-input-error');
      setTimeout(() => nameInput.classList.remove('controlxy-input-error'), 500);
      return;
    }
    
    window.controlXYPresets?.save(name);
    nameInput.value = '';
    refreshPresetList();
  });
  
  // Enter key in save input
  panelElement.querySelector('#controlxy-save-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      panelElement.querySelector('#controlxy-save-btn').click();
    }
  });
  
  // Stop sequence
  panelElement.querySelector('#controlxy-seq-stop').addEventListener('click', () => {
    window.controlXYPresets?.stopSequence();
  });
  
  // Export
  panelElement.querySelector('#controlxy-export-btn').addEventListener('click', exportPresets);
  
  // Import
  panelElement.querySelector('#controlxy-import-btn').addEventListener('click', () => {
    panelElement.querySelector('#controlxy-import-file').click();
  });
  
  panelElement.querySelector('#controlxy-import-file').addEventListener('change', importPresets);
  
  // Make panel draggable
  makeDraggable(panelElement, panelElement.querySelector('.controlxy-panel-header'));
}

// ============================================================================
// PRESET LIST
// ============================================================================

function refreshPresetList() {
  const list = panelElement?.querySelector('#controlxy-preset-list');
  if (!list) return;
  
  const presets = window.controlXYPresets?.list() || [];
  
  if (presets.length === 0) {
    list.innerHTML = '<div class="controlxy-empty">No presets saved</div>';
    return;
  }
  
  list.innerHTML = presets.map(name => `
    <div class="controlxy-preset-item" data-preset="${name}">
      <span class="controlxy-preset-name">${name}</span>
      <div class="controlxy-preset-actions">
        <button class="controlxy-recall-btn" title="Recall preset">▶</button>
        <button class="controlxy-delete-btn" title="Delete preset">🗑</button>
      </div>
    </div>
  `).join('');
  
  // Bind recall buttons
  list.querySelectorAll('.controlxy-recall-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.preset;
      const dur = parseFloat(panelElement.querySelector('#controlxy-recall-dur').value) || 0;
      const ease = panelElement.querySelector('#controlxy-recall-ease').value;
      
      window.controlXYPresets?.recall(name, { dur, ease });
    });
  });
  
  // Bind delete buttons
  list.querySelectorAll('.controlxy-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.preset;
      if (confirm(`Delete preset "${name}"?`)) {
        window.controlXYPresets?.delete(name);
        refreshPresetList();
      }
    });
  });
}

// ============================================================================
// SEQUENCE LIST
// ============================================================================

function refreshSequenceList() {
  const list = panelElement?.querySelector('#controlxy-sequence-list');
  if (!list) return;
  
  const store = window.controlXYPresets?._store;
  const sequences = Object.keys(store?.sequences || {});
  
  if (sequences.length === 0) {
    list.innerHTML = '<div class="controlxy-empty">No sequences defined</div>';
    return;
  }
  
  list.innerHTML = sequences.map(name => {
    const seq = store.sequences[name];
    const stepCount = Array.isArray(seq) ? seq.length : 0;
    
    return `
      <div class="controlxy-preset-item" data-sequence="${name}">
        <span class="controlxy-preset-name">${name} <small>(${stepCount} steps)</small></span>
        <div class="controlxy-preset-actions">
          <button class="controlxy-play-seq-btn" title="Play sequence">▶</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Bind play buttons
  list.querySelectorAll('.controlxy-play-seq-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.sequence;
      const dur = parseFloat(panelElement.querySelector('#controlxy-recall-dur').value) || 1;
      const ease = panelElement.querySelector('#controlxy-recall-ease').value;
      const loop = panelElement.querySelector('#controlxy-seq-loop').checked;
      
      window.controlXYPresets?.playSequence(name, { dur, ease, loop });
    });
  });
}

// ============================================================================
// IMPORT / EXPORT
// ============================================================================

function exportPresets() {
  const json = window.controlXYPresets?.export();
  if (!json) return;
  
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `controlxy-presets-${Date.now()}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  console.log("[controlXY] Presets exported");
}

function importPresets(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const json = evt.target.result;
      const merge = confirm("Merge with existing presets?\n\nOK = Merge\nCancel = Replace all");
      
      window.controlXYPresets?.import(json, merge);
      
      refreshPresetList();
      refreshSequenceList();
      
      console.log("[controlXY] Presets imported");
    } catch (err) {
      alert("Failed to import presets: " + err.message);
    }
  };
  reader.readAsText(file);
  
  // Reset input
  e.target.value = '';
}

// ============================================================================
// PANEL VISIBILITY
// ============================================================================

export function showPresetUI() {
  if (!panelElement) createPresetUI();
  
  panelElement.classList.add('controlxy-panel-visible');
  panelVisible = true;
  
  refreshPresetList();
  refreshSequenceList();
}

export function hidePresetUI() {
  panelElement?.classList.remove('controlxy-panel-visible');
  panelVisible = false;
}

export function togglePresetUI() {
  if (panelVisible) {
    hidePresetUI();
  } else {
    showPresetUI();
  }
}

// ============================================================================
// DRAGGABLE
// ============================================================================

function makeDraggable(element, handle) {
  let offsetX = 0, offsetY = 0;
  let isDragging = false;
  
  handle.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    
    isDragging = true;
    offsetX = e.clientX - element.offsetLeft;
    offsetY = e.clientY - element.offsetTop;
    
    handle.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    element.style.left = (e.clientX - offsetX) + 'px';
    element.style.top = (e.clientY - offsetY) + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
    handle.style.cursor = 'grab';
  });
}

// ============================================================================
// KEYBOARD SHORTCUT
// ============================================================================

document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Shift + P = Toggle preset panel
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
    e.preventDefault();
    togglePresetUI();
  }
});

// ============================================================================
// GLOBAL API
// ============================================================================

window.controlXYPresetUI = {
  show: showPresetUI,
  hide: hidePresetUI,
  toggle: togglePresetUI,
  refresh: () => {
    refreshPresetList();
    refreshSequenceList();
  }
};

console.log("[controlXYPresetUI] Module loaded. Toggle with Ctrl+Shift+P or window.controlXYPresetUI.toggle()");
