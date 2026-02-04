/*!
 * oscillaControlXYPresetUI.js — Preset Management UI
 * Part of oscillaScore control plane
 * © 2025 Rob Canning — GPLv3
 *
 * Provides a floating panel UI for managing controlXY presets
 * Updated: Light theme, slot assignment for presets, removed quick save arrows
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
        
        <!-- Presets List with Slot Assignment -->
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
        
        <!-- Scenes Section -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">🎭 Scenes</div>
          <div class="controlxy-input-row">
            <input type="text" id="controlxy-scene-name" placeholder="Scene name..." />
            <button id="controlxy-scene-save-btn" title="Save current state as scene">Save</button>
          </div>
          <div id="controlxy-scene-list" class="controlxy-preset-list controlxy-scene-list">
            <div class="controlxy-empty">No scenes saved</div>
          </div>
        </div>
        
      </div>
      
      <!-- ========== TAB 2: SEQUENCES ========== -->
      <div class="controlxy-tab-content" data-tab="sequences">
        
        <!-- Sequence Editor -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">🎬 Sequence Editor</div>
          <div class="controlxy-input-row">
            <input type="text" id="controlxy-seq-name" placeholder="Sequence name..." />
            <label class="controlxy-checkbox controlxy-loop-editor">
              <input type="checkbox" id="controlxy-seq-loop-editor" />
              <span>Loop</span>
            </label>
            <button id="controlxy-seq-create-btn" title="Create/Update">💾</button>
          </div>
          
          <!-- Step Editor -->
          <div id="controlxy-step-editor" class="controlxy-step-editor">
            <div class="controlxy-step-header">
              <span class="step-col-preset">Preset</span>
              <span class="step-col-dur">Duration</span>
              <span class="step-col-ease">Ease</span>
              <span class="step-col-actions"></span>
            </div>
            <div id="controlxy-step-list" class="controlxy-step-list">
              <!-- Steps added dynamically -->
            </div>
            <div class="controlxy-step-actions">
              <button id="controlxy-add-step-btn" title="Add step">+ Add Step</button>
              <select id="controlxy-add-preset-select">
                <option value="">Select preset...</option>
              </select>
            </div>
          </div>
        </div>
        
        <!-- Sequences List -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">📜 Saved Sequences</div>
          <div id="controlxy-sequence-list" class="controlxy-preset-list">
            <div class="controlxy-empty">No sequences defined</div>
          </div>
        </div>
        
        <!-- Sequence Playback -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">▶️ Playback</div>
          <div class="controlxy-options-grid">
            <label>
              <span>Speed</span>
              <input type="number" id="controlxy-seq-speed" value="1" min="0.1" max="10" step="0.1" />
              <span class="unit">×</span>
            </label>
            <label>
              <span>Default Dur</span>
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
            <button id="controlxy-seq-stop" title="Stop sequence">⏹ Stop</button>
          </div>
          <div id="controlxy-seq-status" class="controlxy-seq-status"></div>
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
  refreshSceneList();
  updateGeneratorOptions();
  
  // Listen for changes
  window.addEventListener('controlxy:presetSaved', refreshPresetList);
  window.addEventListener('controlxy:presetDeleted', refreshPresetList);
  window.addEventListener('controlxy:presetsImported', () => {
    refreshPresetList();
    refreshSequenceList();
  });
  
  console.log("[controlXY] Preset UI created (light theme)");
  
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
      
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
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
    infoDiv.style.color = '#c62828';
    return;
  }
  
  if (!genUID || !genHandle) {
    infoDiv.textContent = '⚠️ Please specify pad UID and handle ID';
    infoDiv.style.color = '#c62828';
    return;
  }
  
  try {
    const options = {
      uid: genUID,
      handleId: genHandle
    };
    
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
    
    window.controlXYPresets.defineSequence(genName, presets);
    
    const dur = panelElement.querySelector('#controlxy-seq-dur').value;
    const ease = panelElement.querySelector('#controlxy-seq-ease').value;
    
    window.controlXYPresets.playSequence(genName, { dur: parseFloat(dur), ease, loop: true });
    
    infoDiv.textContent = `✓ Generated ${presets.length} presets, playing now!`;
    infoDiv.style.color = '#2e7d32';
    
    refreshPresetList();
    refreshSequenceList();
    
  } catch (err) {
    infoDiv.textContent = `❌ Error: ${err.message}`;
    infoDiv.style.color = '#c62828';
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
  
  // Sequence creation from step editor
  panelElement.querySelector('#controlxy-seq-create-btn').addEventListener('click', () => {
    const nameInput = panelElement.querySelector('#controlxy-seq-name');
    const loopCheckbox = panelElement.querySelector('#controlxy-seq-loop-editor');
    const name = nameInput.value.trim();
    
    if (!name) {
      nameInput.classList.add('controlxy-input-error');
      setTimeout(() => nameInput.classList.remove('controlxy-input-error'), 500);
      return;
    }
    
    const steps = getStepsFromEditor();
    
    if (steps.length === 0) {
      alert('Add at least one step to the sequence');
      return;
    }
    
    const loop = loopCheckbox?.checked ?? false;
    
    window.controlXYPresets?.defineSequence(name, steps, { loop });
    
    nameInput.value = '';
    loopCheckbox.checked = false;
    clearStepEditor();
    refreshSequenceList();
    refreshPresetDropdown();
  });
  
  // Add step button
  panelElement.querySelector('#controlxy-add-step-btn').addEventListener('click', () => {
    const presetSelect = panelElement.querySelector('#controlxy-add-preset-select');
    const presetName = presetSelect.value;
    
    if (!presetName) {
      presetSelect.classList.add('controlxy-input-error');
      setTimeout(() => presetSelect.classList.remove('controlxy-input-error'), 500);
      return;
    }
    
    addStepToEditor(presetName);
    presetSelect.value = '';
  });
  
  // Stop sequence
  panelElement.querySelector('#controlxy-seq-stop').addEventListener('click', () => {
    window.controlXYPresets?.stopSequence();
    updateSequenceStatus('Stopped');
  });
  
  // Listen for sequence events
  window.addEventListener('controlxy:sequenceStarted', (e) => {
    updateSequenceStatus(`Playing: ${e.detail.name}`);
  });
  
  window.addEventListener('controlxy:saved', () => {
    showSaveIndicator();
  });
  
  window.addEventListener('controlxy:loaded', () => {
    refreshPresetList();
    refreshSequenceList();
    refreshSceneList();
    refreshPresetDropdown();
  });
  
  // Export
  panelElement.querySelector('#controlxy-export-btn').addEventListener('click', exportPresets);
  
  // Import
  panelElement.querySelector('#controlxy-import-btn').addEventListener('click', () => {
    panelElement.querySelector('#controlxy-import-file').click();
  });
  
  panelElement.querySelector('#controlxy-import-file').addEventListener('change', importPresets);
  
  // ====== SCENE BINDINGS ======
  
  // Save scene button
  panelElement.querySelector('#controlxy-scene-save-btn').addEventListener('click', () => {
    const nameInput = panelElement.querySelector('#controlxy-scene-name');
    const name = nameInput.value.trim();
    
    if (!name) {
      nameInput.classList.add('controlxy-input-error');
      setTimeout(() => nameInput.classList.remove('controlxy-input-error'), 500);
      return;
    }
    
    window.controlXYPresets?.saveScene(name);
    nameInput.value = '';
    refreshSceneList();
  });
  
  // Enter key in scene name input
  panelElement.querySelector('#controlxy-scene-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      panelElement.querySelector('#controlxy-scene-save-btn').click();
    }
  });
  
  // Listen for scene events
  window.addEventListener('controlxy:sceneSaved', refreshSceneList);
  window.addEventListener('controlxy:sceneDeleted', refreshSceneList);
  window.addEventListener('controlxy:sceneRecalled', (e) => {
    showSaveIndicator(`Scene "${e.detail.name}" recalled`);
  });
  
  // ====== END SCENE BINDINGS ======
  
  // Make panel draggable
  makeDraggable(panelElement, panelElement.querySelector('.controlxy-panel-header'));
}

// ============================================================================
// STEP EDITOR
// ============================================================================

let editorSteps = [];

function addStepToEditor(presetName, dur = 1, ease = 'easeInOutSine') {
  const step = { preset: presetName, dur, ease };
  editorSteps.push(step);
  renderStepEditor();
}

function removeStepFromEditor(index) {
  editorSteps.splice(index, 1);
  renderStepEditor();
}

function moveStep(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= editorSteps.length) return;
  
  const temp = editorSteps[index];
  editorSteps[index] = editorSteps[newIndex];
  editorSteps[newIndex] = temp;
  renderStepEditor();
}

function updateStepDuration(index, dur) {
  if (editorSteps[index]) {
    editorSteps[index].dur = parseFloat(dur) || 1;
  }
}

function updateStepEase(index, ease) {
  if (editorSteps[index]) {
    editorSteps[index].ease = ease;
  }
}

function getStepsFromEditor() {
  return editorSteps.map(step => {
    if (step.dur === 1 && step.ease === 'easeInOutSine') {
      return step.preset;
    }
    return { preset: step.preset, dur: step.dur, ease: step.ease };
  });
}

function clearStepEditor() {
  editorSteps = [];
  renderStepEditor();
}

function loadSequenceToEditor(name) {
  // Use the shared module's getSequence function, not _store
  const shared = window.controlXYPresets?._shared;
  const seqItem = shared?.getSequence?.(name);
  
  if (!seqItem) {
    console.warn(`[controlXY UI] Sequence "${name}" not found via shared.getSequence()`);
    return;
  }
  
  // Ensure the panel exists and is visible
  if (!panelElement) {
    console.warn(`[controlXY UI] Panel not created yet`);
    createPresetUI();
  }
  
  // Show the panel if hidden
  panelElement.classList.add('controlxy-panel-visible');
  
  // seqItem is the full item object with { id, kind, name, data, ... }
  // The actual sequence data is in seqItem.data
  const seqData = seqItem.data || seqItem;
  const isLegacy = Array.isArray(seqData);
  const seq = isLegacy ? seqData : (seqData.steps || seqData);
  const seqLoop = isLegacy ? false : (seqData.loop ?? false);
  
  if (!seq || !Array.isArray(seq)) {
    console.warn(`[controlXY UI] Invalid sequence data for "${name}"`, seqData);
    return;
  }
  
  editorSteps = seq.map(step => {
    if (typeof step === 'string') {
      return { preset: step, dur: 1, ease: 'easeInOutSine' };
    }
    return { 
      preset: step.preset || step, 
      dur: step.dur || 1, 
      ease: step.ease || 'easeInOutSine' 
    };
  });
  
  // Set name and loop checkbox
  const nameInput = panelElement.querySelector('#controlxy-seq-name');
  const loopCheckbox = panelElement.querySelector('#controlxy-seq-loop-editor');
  
  if (nameInput) nameInput.value = name;
  if (loopCheckbox) loopCheckbox.checked = seqLoop;
  
  renderStepEditor();
  
  // Switch to sequences tab
  const seqTab = panelElement.querySelector('[data-tab="sequences"]');
  if (seqTab) {
    // Trigger tab switch
    seqTab.click();
  } else {
    console.warn(`[controlXY UI] Sequences tab not found`);
  }
  
  console.log(`[controlXY UI] Loaded sequence "${name}" to editor (${editorSteps.length} steps)`);
}

function renderStepEditor() {
  const list = panelElement?.querySelector('#controlxy-step-list');
  if (!list) return;
  
  if (editorSteps.length === 0) {
    list.innerHTML = '<div class="controlxy-empty-steps">No steps added yet</div>';
    return;
  }
  
  list.innerHTML = editorSteps.map((step, i) => `
    <div class="controlxy-step-row" data-index="${i}">
      <span class="step-num">${i + 1}</span>
      <span class="step-preset">${step.preset}</span>
      <input type="number" class="step-dur-input" value="${step.dur}" min="0.01" max="30" step="0.1" />
      <select class="step-ease-select">
        <option value="linear" ${step.ease === 'linear' ? 'selected' : ''}>Lin</option>
        <option value="easeInOutSine" ${step.ease === 'easeInOutSine' ? 'selected' : ''}>Sin</option>
        <option value="easeInOutQuad" ${step.ease === 'easeInOutQuad' ? 'selected' : ''}>Qd</option>
        <option value="easeInOutCubic" ${step.ease === 'easeInOutCubic' ? 'selected' : ''}>Cu</option>
      </select>
      <div class="step-actions">
        <button class="step-up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="step-down" title="Move down" ${i === editorSteps.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="step-delete" title="Remove">×</button>
      </div>
    </div>
  `).join('');
  
  // Bind events
  list.querySelectorAll('.step-dur-input').forEach((input, i) => {
    input.addEventListener('change', () => updateStepDuration(i, input.value));
  });
  
  list.querySelectorAll('.step-ease-select').forEach((select, i) => {
    select.addEventListener('change', () => updateStepEase(i, select.value));
  });
  
  list.querySelectorAll('.step-up').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('.controlxy-step-row').dataset.index);
      moveStep(index, -1);
    });
  });
  
  list.querySelectorAll('.step-down').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('.controlxy-step-row').dataset.index);
      moveStep(index, 1);
    });
  });
  
  list.querySelectorAll('.step-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('.controlxy-step-row').dataset.index);
      removeStepFromEditor(index);
    });
  });
}

function refreshPresetDropdown() {
  const select = panelElement?.querySelector('#controlxy-add-preset-select');
  if (!select) return;
  
  const presets = window.controlXYPresets?.list() || [];
  const shared = window.controlXYPresets?._shared;
  const sequences = shared?.listSequences?.() || [];
  
  select.innerHTML = '<option value="">Select preset...</option>';
  
  if (presets.length > 0) {
    select.innerHTML += '<optgroup label="Presets">' + 
      presets.map(p => `<option value="${p}">${p}</option>`).join('') +
      '</optgroup>';
  }
  
  if (sequences.length > 0) {
    select.innerHTML += '<optgroup label="Sequences (nested)">' + 
      sequences.map(s => `<option value="seq:${s}">seq:${s}</option>`).join('') +
      '</optgroup>';
  }
}

function updateSequenceStatus(text) {
  const status = panelElement?.querySelector('#controlxy-seq-status');
  if (status) {
    status.textContent = text;
    status.classList.add('active');
    setTimeout(() => status.classList.remove('active'), 2000);
  }
}

function showSaveIndicator() {
  const title = panelElement?.querySelector('.controlxy-panel-title');
  if (title) {
    const original = title.textContent;
    title.textContent = '💾 Saved!';
    setTimeout(() => { title.textContent = original; }, 1000);
  }
}

// ============================================================================
// PRESET LIST WITH SLOT ASSIGNMENT
// ============================================================================

/**
 * Get all launcher UIDs and their bank/slot configurations
 */
function getLauncherSlotOptions() {
  const shared = window.controlXYPresets?._shared;
  const launcherUids = shared?.listLaunchers?.() || [];
  const options = [];
  
  // Add "unassigned" option
  options.push({ value: '', label: 'No slot' });
  
  // Collect all launchers and their banks/slots
  for (const uid of launcherUids) {
    const launcherItem = shared?.getLauncher?.(uid);
    const launcher = launcherItem?.data || launcherItem || {};
    const banks = launcher.banks || [];
    const slotsPerBank = banks[0]?.slots?.length || 8;
    
    for (let bankIdx = 0; bankIdx < banks.length; bankIdx++) {
      for (let slotIdx = 0; slotIdx < slotsPerBank; slotIdx++) {
        const slotKey = `${uid}:${bankIdx}:${slotIdx}`;
        const label = `${uid} B${bankIdx + 1}-${slotIdx + 1}`;
        options.push({ value: slotKey, label, uid, bankIdx, slotIdx });
      }
    }
  }
  
  return options;
}

/**
 * Find which slot a preset is assigned to
 */
function findPresetSlot(presetName) {
  const shared = window.controlXYPresets?._shared;
  const launcherUids = shared?.listLaunchers?.() || [];
  
  for (const uid of launcherUids) {
    const launcherItem = shared?.getLauncher?.(uid);
    const launcher = launcherItem?.data || launcherItem || {};
    const banks = launcher.banks || [];
    
    for (let bankIdx = 0; bankIdx < banks.length; bankIdx++) {
      const slots = banks[bankIdx]?.slots || [];
      for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
        const slot = slots[slotIdx];
        if (slot && slot.type === 'preset' && slot.name === presetName) {
          return { uid, bankIdx, slotIdx, key: `${uid}:${bankIdx}:${slotIdx}` };
        }
      }
    }
  }
  
  return null;
}

/**
 * Assign a preset to a launcher slot
 */
function assignPresetToSlot(presetName, slotKey) {
  const shared = window.controlXYPresets?._shared;
  if (!shared) return;
  
  // First, remove preset from any existing slot
  const existing = findPresetSlot(presetName);
  if (existing) {
    const { uid, bankIdx, slotIdx } = existing;
    const launcherItem = shared.getLauncher?.(uid);
    const launcherData = launcherItem?.data || launcherItem;
    if (launcherData?.banks?.[bankIdx]?.slots) {
      launcherData.banks[bankIdx].slots[slotIdx] = null;
      shared.saveLauncher?.(uid, launcherData);
    }
  }
  
  // If no slot key provided, just unassign
  if (!slotKey) {
    shared.save?.();
    refreshLauncherUI();
    return;
  }
  
  // Parse the slot key
  const [uid, bankIdxStr, slotIdxStr] = slotKey.split(':');
  const bankIdx = parseInt(bankIdxStr);
  const slotIdx = parseInt(slotIdxStr);
  
  // Get or create launcher using shared module
  const launcherData = shared.getOrCreateLauncher?.(uid, {
    currentBank: 0,
    mode: 'preset',
    tween: true,
    visible: true,
    banks: []
  }) || { banks: [] };
  
  // Ensure bank exists
  while (launcherData.banks.length <= bankIdx) {
    launcherData.banks.push({
      name: `Bank ${launcherData.banks.length + 1}`,
      slots: Array(8).fill(null)
    });
  }
  
  // Assign the preset
  launcherData.banks[bankIdx].slots[slotIdx] = {
    type: 'preset',
    name: presetName
  };
  
  // Save and refresh UI
  shared.saveLauncher?.(uid, launcherData);
  shared.save?.();
  refreshLauncherUI();
}

/**
 * Refresh launcher UI to reflect current slot assignments
 */
function refreshLauncherUI() {
  // Trigger a re-render of any visible launchers
  document.querySelectorAll('.controlxy-launcher').forEach(launcher => {
    const uid = launcher.dataset.uid;
    if (uid) {
      const event = new CustomEvent('controlxy:launcherRefresh', { detail: { uid } });
      window.dispatchEvent(event);
    }
  });
}

function refreshPresetList() {
  const list = panelElement?.querySelector('#controlxy-preset-list');
  if (!list) return;
  
  const presets = window.controlXYPresets?.list() || [];
  const slotOptions = getLauncherSlotOptions();
  
  if (presets.length === 0) {
    list.innerHTML = '<div class="controlxy-empty">No presets saved</div>';
    return;
  }
  
  list.innerHTML = presets.map(name => {
    const slot = findPresetSlot(name);
    const slotBadge = slot 
      ? `<span class="controlxy-preset-slot-badge">B${slot.bankIdx + 1}-${slot.slotIdx + 1}</span>`
      : `<span class="controlxy-preset-slot-badge unassigned">—</span>`;
    
    const selectOptions = slotOptions.map(opt => {
      const selected = (slot?.key === opt.value) ? 'selected' : '';
      return `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
    }).join('');
    
    return `
      <div class="controlxy-preset-item" data-preset="${name}">
        <span class="controlxy-preset-name">${name}</span>
        ${slotBadge}
        <select class="controlxy-preset-slot-select" title="Assign to launcher slot">
          ${selectOptions}
        </select>
        <div class="controlxy-preset-actions">
          <button class="controlxy-recall-btn" title="Recall preset">▶</button>
          <button class="controlxy-delete-btn" title="Delete preset">🗑</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Bind slot select handlers
  list.querySelectorAll('.controlxy-preset-slot-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const presetName = e.target.closest('.controlxy-preset-item').dataset.preset;
      const slotKey = e.target.value;
      assignPresetToSlot(presetName, slotKey);
      refreshPresetList();
    });
  });
  
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
        // Also remove from any slot assignment
        assignPresetToSlot(name, '');
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
  
  const sequences = window.controlXYPresets?.listSequences() || [];
  
  refreshPresetDropdown();
  
  if (sequences.length === 0) {
    list.innerHTML = '<div class="controlxy-empty">No sequences defined</div>';
    return;
  }
  
  list.innerHTML = sequences.map(name => {
    const seqData = window.controlXYPresets?.getSequence(name);
    
    const isLegacy = Array.isArray(seqData);
    const seq = isLegacy ? seqData : (seqData?.steps || seqData);
    const seqLoop = isLegacy ? false : (seqData?.loop ?? false);
    const stepCount = Array.isArray(seq) ? seq.length : 0;
    
    const hasNested = Array.isArray(seq) && seq.some(step => {
      const preset = typeof step === 'string' ? step : step?.preset;
      return typeof preset === 'string' && preset.startsWith('seq:');
    });
    
    const hasPerStepDur = Array.isArray(seq) && seq.some(step => 
      typeof step === 'object' && step.dur !== undefined
    );
    
    const nestedIcon = hasNested ? ' 🔗' : '';
    const durIcon = hasPerStepDur ? ' ⏱' : '';
    const loopIcon = seqLoop ? ' 🔄' : '';
    
    return `
      <div class="controlxy-preset-item" data-sequence="${name}">
        <span class="controlxy-preset-name">${name}${loopIcon}${nestedIcon}${durIcon} <small>(${stepCount})</small></span>
        <div class="controlxy-preset-actions">
          <button class="controlxy-edit-seq-btn" title="Edit sequence">✏️</button>
          <button class="controlxy-play-seq-btn" title="Play sequence">▶</button>
          <button class="controlxy-delete-seq-btn" title="Delete sequence">🗑</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Bind edit buttons
  list.querySelectorAll('.controlxy-edit-seq-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.sequence;
      loadSequenceToEditor(name);
    });
  });
  
  // Bind play buttons
  list.querySelectorAll('.controlxy-play-seq-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.sequence;
      const speed = parseFloat(panelElement.querySelector('#controlxy-seq-speed').value) || 1;
      const dur = parseFloat(panelElement.querySelector('#controlxy-seq-dur').value) || 1;
      const ease = panelElement.querySelector('#controlxy-seq-ease').value;
      
      window.controlXYPresets?.playSequence(name, { speed, dur, ease });
      updateSequenceStatus(`Playing: ${name}`);
    });
  });
  
  // Bind delete buttons
  list.querySelectorAll('.controlxy-delete-seq-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.sequence;
      if (confirm(`Delete sequence "${name}"?`)) {
        // Use the shared module API
        const shared = window.controlXYPresets?._shared;
        if (shared) {
          shared.deleteSequence(name);
          refreshSequenceList();
        }
      }
    });
  });
}

// ============================================================================
// SCENE LIST
// ============================================================================

function refreshSceneList() {
  const list = panelElement?.querySelector('#controlxy-scene-list');
  if (!list) return;
  
  const scenes = window.controlXYPresets?.listScenes() || [];
  
  if (scenes.length === 0) {
    list.innerHTML = '<div class="controlxy-empty">No scenes saved</div>';
    return;
  }
  
  list.innerHTML = scenes.map(name => {
    return `
      <div class="controlxy-scene-item" data-scene="${name}">
        <span class="controlxy-scene-name">${name}</span>
        <div class="controlxy-scene-actions">
          <button class="controlxy-recall-scene-btn" title="Recall scene">▶</button>
          <button class="controlxy-delete-scene-btn" title="Delete scene">🗑</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Bind recall buttons
  list.querySelectorAll('.controlxy-recall-scene-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-scene-item').dataset.scene;
      const dur = parseFloat(panelElement.querySelector('#controlxy-recall-dur').value) || 0;
      const ease = panelElement.querySelector('#controlxy-recall-ease').value;
      
      window.controlXYPresets?.recallScene(name, { dur, ease });
    });
  });
  
  // Bind delete buttons
  list.querySelectorAll('.controlxy-delete-scene-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-scene-item').dataset.scene;
      if (confirm(`Delete scene "${name}"?`)) {
        window.controlXYPresets?.deleteScene(name);
        refreshSceneList();
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
// AUTO-REFRESH ON SAVE/LOAD EVENTS
// ============================================================================

// Refresh UI when presets are loaded from server
window.addEventListener('controlxy:loaded', () => {
  console.log("[controlXYPresetUI] Presets loaded, refreshing lists");
  if (panelVisible) {
    refreshPresetList();
    refreshSequenceList();
  }
});

// Refresh UI when presets are saved
window.addEventListener('controlxy:saved', () => {
  console.log("[controlXYPresetUI] Presets saved, refreshing lists");
  if (panelVisible) {
    refreshPresetList();
    refreshSequenceList();
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

console.log("[controlXYPresetUI] Module loaded (light theme). Toggle with Alt+Shift+P or window.controlXYPresetUI.toggle()");
