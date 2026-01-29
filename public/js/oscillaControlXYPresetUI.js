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
      <span class="controlxy-panel-title">🎛️ XY Control</span>
      <button class="controlxy-panel-close" title="Close">×</button>
    </div>
    
    <!-- Tab Navigation -->
    <div class="controlxy-tabs">
      <button class="controlxy-tab active" data-tab="presets">Presets</button>
      <button class="controlxy-tab" data-tab="sequences">Sequences</button>
      <button class="controlxy-tab" data-tab="generators">Generators</button>
    </div>
    
    <div class="controlxy-panel-body">
      
      <!-- ========== TAB 1: PRESETS ========== -->
      <div class="controlxy-tab-content active" data-tab="presets">
        
        <!-- Save Preset -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">💾 Save Preset</div>
          <div class="controlxy-input-row">
            <input type="text" id="controlxy-save-name" placeholder="Preset name..." />
            <button id="controlxy-save-btn" title="Save current positions">Save</button>
          </div>
        </div>
        
        <!-- Quick Save Positions -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">⚡ Quick Save</div>
          <div class="controlxy-button-grid">
            <button class="controlxy-quick-save" data-pos='{"x":0.2,"y":0.8}' title="Top-Left">↖</button>
            <button class="controlxy-quick-save" data-pos='{"x":0.5,"y":0.8}' title="Top">↑</button>
            <button class="controlxy-quick-save" data-pos='{"x":0.8,"y":0.8}' title="Top-Right">↗</button>
            <button class="controlxy-quick-save" data-pos='{"x":0.2,"y":0.5}' title="Left">←</button>
            <button class="controlxy-quick-save" data-pos='{"x":0.5,"y":0.5}' title="Center">⊙</button>
            <button class="controlxy-quick-save" data-pos='{"x":0.8,"y":0.5}' title="Right">→</button>
            <button class="controlxy-quick-save" data-pos='{"x":0.2,"y":0.2}' title="Bottom-Left">↙</button>
            <button class="controlxy-quick-save" data-pos='{"x":0.5,"y":0.2}' title="Bottom">↓</button>
            <button class="controlxy-quick-save" data-pos='{"x":0.8,"y":0.2}' title="Bottom-Right">↘</button>
          </div>
        </div>
        
        <!-- Presets List -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">📋 Saved Presets</div>
          <div id="controlxy-preset-list" class="controlxy-preset-list">
            <div class="controlxy-empty">No presets saved</div>
          </div>
        </div>
        
        <!-- Recall Options -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">🎬 Recall Options</div>
          <div class="controlxy-options-grid">
            <label>
              <span>Duration</span>
              <input type="number" id="controlxy-recall-dur" value="0" min="0" max="30" step="0.1" />
              <span class="unit">s</span>
            </label>
            <label>
              <span>Easing</span>
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
        
      </div>
      
      <!-- ========== TAB 2: SEQUENCES ========== -->
      <div class="controlxy-tab-content" data-tab="sequences">
        
        <!-- Create Sequence -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">🎬 Create Sequence</div>
          <div class="controlxy-input-row">
            <input type="text" id="controlxy-seq-name" placeholder="Sequence name..." />
          </div>
          <div class="controlxy-input-row" style="margin-top: 8px;">
            <textarea id="controlxy-seq-steps" 
                      placeholder="Steps (comma-separated):&#10;preset1, preset2, preset3&#10;&#10;Or reference sequences:&#10;seq:pattern1, preset4, seq:pattern2" 
                      rows="4"></textarea>
          </div>
          <button id="controlxy-seq-create-btn" class="controlxy-full-btn">Create Sequence</button>
        </div>
        
        <!-- Sequences List -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">📜 Sequences</div>
          <div id="controlxy-sequence-list" class="controlxy-preset-list">
            <div class="controlxy-empty">No sequences defined</div>
          </div>
        </div>
        
        <!-- Sequence Playback -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">▶️ Playback</div>
          <div class="controlxy-options-grid">
            <label>
              <span>Duration</span>
              <input type="number" id="controlxy-seq-dur" value="1" min="0.01" max="30" step="0.1" />
              <span class="unit">s</span>
            </label>
            <label>
              <span>Easing</span>
              <select id="controlxy-seq-ease">
                <option value="linear">Linear</option>
                <option value="easeInOutSine" selected>Sine</option>
                <option value="easeInOutQuad">Quad</option>
                <option value="easeInOutCubic">Cubic</option>
                <option value="easeInOutBack">Back</option>
                <option value="easeOutElastic">Elastic</option>
              </select>
            </label>
          </div>
          <div class="controlxy-seq-controls">
            <label class="controlxy-checkbox">
              <input type="checkbox" id="controlxy-seq-loop" />
              <span>Loop</span>
            </label>
            <button id="controlxy-seq-stop" title="Stop sequence">⏹ Stop</button>
          </div>
        </div>
        
      </div>
      
      <!-- ========== TAB 3: GENERATORS ========== -->
      <div class="controlxy-tab-content" data-tab="generators">
        
        <!-- Pattern Type Selector -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">🌀 Pattern Generator</div>
          <select id="controlxy-gen-type" class="controlxy-full-select">
            <option value="lissajous">Lissajous Curve</option>
            <option value="circle">Circle / Orbit</option>
            <option value="spiral">Spiral</option>
            <option value="grid">Grid Scan</option>
            <option value="randomWalk">Random Walk</option>
          </select>
        </div>
        
        <!-- Target Selection -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">🎯 Target</div>
          <div class="controlxy-input-row">
            <input type="text" id="controlxy-gen-uid" placeholder="Pad UID" value="pad1" />
            <input type="text" id="controlxy-gen-handle" placeholder="Handle ID" value="dot1" />
          </div>
        </div>
        
        <!-- Generator Options (dynamic based on type) -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">⚙️ Options</div>
          <div id="controlxy-gen-options" class="controlxy-options-grid">
            <!-- Dynamically populated based on generator type -->
          </div>
        </div>
        
        <!-- Generate Button -->
        <div class="controlxy-section">
          <div class="controlxy-input-row">
            <input type="text" id="controlxy-gen-name" placeholder="Pattern name..." />
            <button id="controlxy-gen-btn" class="controlxy-gen-button">Generate & Play</button>
          </div>
          <div class="controlxy-gen-info" id="controlxy-gen-info"></div>
        </div>
        
      </div>
      
      <!-- ========== IMPORT/EXPORT (Always Visible) ========== -->
      <div class="controlxy-section controlxy-always-show">
        <div class="controlxy-section-title">💾 Import / Export</div>
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
  bindTabSwitching();
  bindGeneratorOptions();
  
  // Initial refresh
  refreshPresetList();
  refreshSequenceList();
  updateGeneratorOptions(); // Set initial options for lissajous
  
  // Listen for changes
  window.addEventListener('controlxy:presetSaved', refreshPresetList);
  window.addEventListener('controlxy:presetDeleted', refreshPresetList);
  window.addEventListener('controlxy:presetsImported', () => {
    refreshPresetList();
    refreshSequenceList();
  });
  
  console.log("[controlXY] Preset UI created with tabs");
  
  return panelElement;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindTabSwitching() {
  const tabs = panelElement.querySelectorAll('.controlxy-tab');
  const contents = panelElement.querySelectorAll('.controlxy-tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Update tab buttons
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update content visibility
      contents.forEach(c => {
        if (c.dataset.tab === targetTab) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
    });
  });
}

function bindGeneratorOptions() {
  const genType = panelElement.querySelector('#controlxy-gen-type');
  const genBtn = panelElement.querySelector('#controlxy-gen-btn');
  
  genType.addEventListener('change', updateGeneratorOptions);
  genBtn.addEventListener('click', handleGenerate);
}

function updateGeneratorOptions() {
  const genType = panelElement.querySelector('#controlxy-gen-type').value;
  const optionsDiv = panelElement.querySelector('#controlxy-gen-options');
  
  const optionsHTML = {
    lissajous: `
      <label>
        <span>X Cycles</span>
        <input type="number" id="gen-xCycles" value="3" min="1" max="20" step="1" />
      </label>
      <label>
        <span>Y Cycles</span>
        <input type="number" id="gen-yCycles" value="2" min="1" max="20" step="1" />
      </label>
      <label>
        <span>Steps</span>
        <input type="number" id="gen-steps" value="60" min="10" max="200" step="10" />
      </label>
      <label>
        <span>Amplitude</span>
        <input type="number" id="gen-amplitude" value="0.4" min="0.1" max="0.5" step="0.05" />
      </label>
      <label>
        <span>Phase</span>
        <input type="number" id="gen-phase" value="0" min="0" max="6.28" step="0.1" />
      </label>
    `,
    circle: `
      <label>
        <span>Radius</span>
        <input type="number" id="gen-radius" value="0.4" min="0.1" max="0.5" step="0.05" />
      </label>
      <label>
        <span>Steps</span>
        <input type="number" id="gen-steps" value="32" min="8" max="100" step="4" />
      </label>
      <label>
        <span>Start Angle</span>
        <input type="number" id="gen-startAngle" value="0" min="0" max="6.28" step="0.1" />
      </label>
    `,
    spiral: `
      <label>
        <span>Inner Radius</span>
        <input type="number" id="gen-innerRadius" value="0.1" min="0" max="0.4" step="0.05" />
      </label>
      <label>
        <span>Outer Radius</span>
        <input type="number" id="gen-outerRadius" value="0.45" min="0.1" max="0.5" step="0.05" />
      </label>
      <label>
        <span>Turns</span>
        <input type="number" id="gen-turns" value="3" min="1" max="10" step="0.5" />
      </label>
      <label>
        <span>Steps</span>
        <input type="number" id="gen-steps" value="100" min="20" max="300" step="10" />
      </label>
    `,
    grid: `
      <label>
        <span>Rows</span>
        <input type="number" id="gen-rows" value="4" min="2" max="10" step="1" />
      </label>
      <label>
        <span>Columns</span>
        <input type="number" id="gen-cols" value="4" min="2" max="10" step="1" />
      </label>
      <label>
        <span>Margin</span>
        <input type="number" id="gen-margin" value="0.1" min="0" max="0.3" step="0.05" />
      </label>
    `,
    randomWalk: `
      <label>
        <span>Steps</span>
        <input type="number" id="gen-steps" value="50" min="10" max="200" step="10" />
      </label>
      <label>
        <span>Step Size</span>
        <input type="number" id="gen-stepSize" value="0.1" min="0.01" max="0.3" step="0.01" />
      </label>
      <label>
        <span>Seed (optional)</span>
        <input type="number" id="gen-seed" value="" placeholder="Random" />
      </label>
    `
  };
  
  optionsDiv.innerHTML = optionsHTML[genType] || '';
}

function handleGenerate() {
  const genType = panelElement.querySelector('#controlxy-gen-type').value;
  const genName = panelElement.querySelector('#controlxy-gen-name').value.trim();
  const genUID = panelElement.querySelector('#controlxy-gen-uid').value.trim();
  const genHandle = panelElement.querySelector('#controlxy-gen-handle').value.trim();
  const infoDiv = panelElement.querySelector('#controlxy-gen-info');
  
  if (!genName) {
    infoDiv.textContent = '⚠️ Please enter a pattern name';
    infoDiv.style.color = '#ff4444';
    return;
  }
  
  if (!genUID || !genHandle) {
    infoDiv.textContent = '⚠️ Please specify pad UID and handle ID';
    infoDiv.style.color = '#ff4444';
    return;
  }
  
  try {
    const options = {
      uid: genUID,
      handleId: genHandle
    };
    
    // Gather options based on generator type
    switch (genType) {
      case 'lissajous':
        options.xCycles = parseFloat(panelElement.querySelector('#gen-xCycles').value);
        options.yCycles = parseFloat(panelElement.querySelector('#gen-yCycles').value);
        options.steps = parseInt(panelElement.querySelector('#gen-steps').value);
        options.amplitude = parseFloat(panelElement.querySelector('#gen-amplitude').value);
        options.phase = parseFloat(panelElement.querySelector('#gen-phase').value);
        break;
      case 'circle':
        options.radius = parseFloat(panelElement.querySelector('#gen-radius').value);
        options.steps = parseInt(panelElement.querySelector('#gen-steps').value);
        options.startAngle = parseFloat(panelElement.querySelector('#gen-startAngle').value);
        break;
      case 'spiral':
        options.innerRadius = parseFloat(panelElement.querySelector('#gen-innerRadius').value);
        options.outerRadius = parseFloat(panelElement.querySelector('#gen-outerRadius').value);
        options.turns = parseFloat(panelElement.querySelector('#gen-turns').value);
        options.steps = parseInt(panelElement.querySelector('#gen-steps').value);
        break;
      case 'grid':
        options.rows = parseInt(panelElement.querySelector('#gen-rows').value);
        options.cols = parseInt(panelElement.querySelector('#gen-cols').value);
        options.margin = parseFloat(panelElement.querySelector('#gen-margin').value);
        break;
      case 'randomWalk':
        options.steps = parseInt(panelElement.querySelector('#gen-steps').value);
        options.stepSize = parseFloat(panelElement.querySelector('#gen-stepSize').value);
        const seedVal = panelElement.querySelector('#gen-seed').value;
        if (seedVal) options.seed = parseInt(seedVal);
        break;
    }
    
    // Generate pattern
    let presets;
    switch (genType) {
      case 'lissajous':
        presets = window.controlXYPresets.generateLissajous(genName, options);
        break;
      case 'circle':
        presets = window.controlXYPresets.generateCircle(genName, options);
        break;
      case 'spiral':
        presets = window.controlXYPresets.generateSpiral(genName, options);
        break;
      case 'grid':
        presets = window.controlXYPresets.generateGrid(genName, options);
        break;
      case 'randomWalk':
        presets = window.controlXYPresets.generateRandomWalk(genName, options);
        break;
    }
    
    // Define sequence
    window.controlXYPresets.defineSequence(genName, presets);
    
    // Auto-play
    const dur = panelElement.querySelector('#controlxy-seq-dur').value;
    const ease = panelElement.querySelector('#controlxy-seq-ease').value;
    const loop = panelElement.querySelector('#controlxy-seq-loop').checked;
    
    window.controlXYPresets.playSequence(genName, { dur: parseFloat(dur), ease, loop });
    
    // Show success
    infoDiv.textContent = `✓ Generated ${presets.length} presets, playing now!`;
    infoDiv.style.color = '#44ff44';
    
    // Refresh lists
    refreshPresetList();
    refreshSequenceList();
    
  } catch (err) {
    infoDiv.textContent = `❌ Error: ${err.message}`;
    infoDiv.style.color = '#ff4444';
    console.error('[controlXY] Generation error:', err);
  }
}

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
  
  // Quick save buttons
  panelElement.querySelectorAll('.controlxy-quick-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const pos = JSON.parse(btn.dataset.pos);
      const nameInput = panelElement.querySelector('#controlxy-save-name');
      const name = nameInput.value.trim() || `quick_${Date.now()}`;
      
      // Get first registry entry (simplification - could be enhanced)
      const firstUID = window._controlXYRegistry?.keys().next().value;
      if (!firstUID) {
        console.warn('[controlXY] No controlXY instances found');
        return;
      }
      
      const instance = window._controlXYRegistry.get(firstUID);
      const firstHandle = instance.handles[0]?.id;
      
      if (!firstHandle) return;
      
      // Save using saveFromData
      window.controlXYPresets.saveFromData(name, {
        [firstUID]: { [firstHandle]: pos }
      });
      
      nameInput.value = '';
      refreshPresetList();
    });
  });
  
  // Sequence creation
  panelElement.querySelector('#controlxy-seq-create-btn').addEventListener('click', () => {
    const nameInput = panelElement.querySelector('#controlxy-seq-name');
    const stepsInput = panelElement.querySelector('#controlxy-seq-steps');
    const name = nameInput.value.trim();
    const stepsText = stepsInput.value.trim();
    
    if (!name || !stepsText) {
      if (!name) nameInput.classList.add('controlxy-input-error');
      if (!stepsText) stepsInput.classList.add('controlxy-input-error');
      setTimeout(() => {
        nameInput.classList.remove('controlxy-input-error');
        stepsInput.classList.remove('controlxy-input-error');
      }, 500);
      return;
    }
    
    // Parse steps (comma-separated, support seq: prefix)
    const steps = stepsText.split(',').map(s => s.trim()).filter(Boolean);
    
    window.controlXYPresets?.defineSequence(name, steps);
    
    nameInput.value = '';
    stepsInput.value = '';
    refreshSequenceList();
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
    
    // Check if sequence contains nested sequences
    const hasNested = Array.isArray(seq) && seq.some(step => 
      typeof step === 'string' && step.startsWith('seq:')
    );
    
    const nestedIcon = hasNested ? ' 🔗' : '';
    
    return `
      <div class="controlxy-preset-item" data-sequence="${name}">
        <span class="controlxy-preset-name">${name}${nestedIcon} <small>(${stepCount} steps)</small></span>
        <div class="controlxy-preset-actions">
          <button class="controlxy-play-seq-btn" title="Play sequence">▶</button>
          <button class="controlxy-delete-seq-btn" title="Delete sequence">🗑</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Bind play buttons
  list.querySelectorAll('.controlxy-play-seq-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.sequence;
      const dur = parseFloat(panelElement.querySelector('#controlxy-seq-dur').value) || 1;
      const ease = panelElement.querySelector('#controlxy-seq-ease').value;
      const loop = panelElement.querySelector('#controlxy-seq-loop').checked;
      
      window.controlXYPresets?.playSequence(name, { dur, ease, loop });
    });
  });
  
  // Bind delete buttons
  list.querySelectorAll('.controlxy-delete-seq-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.sequence;
      if (confirm(`Delete sequence "${name}"?`)) {
        const store = window.controlXYPresets?._store;
        if (store?.sequences) {
          delete store.sequences[name];
          refreshSequenceList();
        }
      }
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
  // Alt + Shift + P = Toggle preset panel
  if (e.altKey && e.shiftKey && e.key === 'P') {
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

console.log("[controlXYPresetUI] Module loaded. Toggle with Alt+Shift+P or window.controlXYPresetUI.toggle()");
