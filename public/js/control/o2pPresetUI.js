/*!
 * o2pPresetUI.js -- Preset Management UI for o2p Touch-Mode Fader Groups
 * Part of oscillaScore control plane
 * (c) 2025 Rob Canning -- GPLv3
 *
 * Floating panel for managing o2p presets and sequences.
 * Two tabs: Presets, Sequences (no generators -- o2p is 1D not 2D).
 *
 * Adapted from controlXYPresetUI.js:
 *   - Calls window.o2pPresets API instead of window.controlXYPresets
 *   - Panel ID: o2p-preset-panel
 *   - Keyboard: Alt+Shift+O
 *   - Reuses all controlxy-panel-* / controlxy-tab* / controlxy-section* CSS
 *   - Launcher slot assignment uses kind "o2pLauncher"
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
  panelElement.id = 'o2p-preset-panel';
  panelElement.innerHTML = `
    <div class="controlxy-panel-header">
      <span class="controlxy-panel-title">o2p Control</span>
      <button class="controlxy-panel-close" title="Close">\u00d7</button>
    </div>
    
    <!-- Tab Navigation -->
    <div class="controlxy-tabs">
      <button class="controlxy-tab active" data-tab="presets">Presets</button>
      <button class="controlxy-tab" data-tab="sequences">Sequences</button>
    </div>
    
    <div class="controlxy-panel-body">
      
      <!-- ========== TAB 1: PRESETS ========== -->
      <div class="controlxy-tab-content active" data-tab="presets">
        
        <!-- Save Preset -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">Save Preset</div>
          <div class="controlxy-input-row">
            <input type="text" id="o2p-save-name" placeholder="Preset name..." />
            <button id="o2p-save-btn" title="Save current positions">Save</button>
          </div>
        </div>
        
        <!-- Presets List with Slot Assignment -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">Saved Presets</div>
          <div id="o2p-preset-list" class="controlxy-preset-list">
            <div class="controlxy-empty">No presets saved</div>
          </div>
        </div>
        
        <!-- Recall Options -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">Recall Options</div>
          <div class="controlxy-options-grid">
            <label>
              <span>Duration</span>
              <input type="number" id="o2p-recall-dur" value="0" min="0" max="30" step="0.1" />
              <span class="unit">s</span>
            </label>
            <label>
              <span>Easing</span>
              <select id="o2p-recall-ease">
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
        
        <!-- Sequence Editor -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">Sequence Editor</div>
          <div class="controlxy-input-row">
            <input type="text" id="o2p-seq-name" placeholder="Sequence name..." />
            <label class="controlxy-checkbox controlxy-loop-editor">
              <input type="checkbox" id="o2p-seq-loop-editor" />
              <span>Loop</span>
            </label>
            <button id="o2p-seq-create-btn" title="Create/Update">Save</button>
          </div>
          
          <!-- Step Editor -->
          <div id="o2p-step-editor" class="controlxy-step-editor">
            <div class="controlxy-step-header">
              <span class="step-col-preset">Preset</span>
              <span class="step-col-dur">Duration</span>
              <span class="step-col-ease">Ease</span>
              <span class="step-col-actions"></span>
            </div>
            <div id="o2p-step-list" class="controlxy-step-list">
              <!-- Steps added dynamically -->
            </div>
            <div class="controlxy-step-actions">
              <button id="o2p-add-step-btn" title="Add step">+ Add Step</button>
              <select id="o2p-add-preset-select">
                <option value="">Select preset...</option>
              </select>
            </div>
          </div>
        </div>
        
        <!-- Sequences List -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">Saved Sequences</div>
          <div id="o2p-sequence-list" class="controlxy-preset-list">
            <div class="controlxy-empty">No sequences defined</div>
          </div>
        </div>
        
        <!-- Sequence Playback -->
        <div class="controlxy-section">
          <div class="controlxy-section-title">Playback</div>
          <div class="controlxy-options-grid">
            <label>
              <span>Default Dur</span>
              <input type="number" id="o2p-seq-dur" value="1" min="0.01" max="30" step="0.1" />
              <span class="unit">s</span>
            </label>
            <label>
              <span>Easing</span>
              <select id="o2p-seq-ease">
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
            <button id="o2p-seq-stop" title="Stop sequence">Stop</button>
          </div>
          <div id="o2p-seq-status" class="controlxy-seq-status"></div>
        </div>
        
      </div>
      
      <!-- ========== IMPORT/EXPORT (Always Visible) ========== -->
      <div class="controlxy-section controlxy-always-show">
        <div class="controlxy-section-title">Import / Export</div>
        <div class="controlxy-button-row">
          <button id="o2p-export-btn">Export</button>
          <button id="o2p-import-btn">Import</button>
        </div>
        <input type="file" id="o2p-import-file" accept=".json" style="display:none" />
      </div>
      
    </div>
  `;
  
  document.body.appendChild(panelElement);
  
  // Bind events
  bindUIEvents();
  bindTabSwitching();
  
  // Initial refresh
  refreshPresetList();
  refreshSequenceList();
  
  // Listen for changes
  window.addEventListener('o2p:presetSaved', refreshPresetList);
  window.addEventListener('o2p:presetDeleted', refreshPresetList);
  
  console.log("[o2pPresetUI] Panel created");
  
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

function bindUIEvents() {
  // Close button
  panelElement.querySelector('.controlxy-panel-close').addEventListener('click', hidePresetUI);
  
  // Save button
  panelElement.querySelector('#o2p-save-btn').addEventListener('click', () => {
    const nameInput = panelElement.querySelector('#o2p-save-name');
    const name = nameInput.value.trim();
    
    if (!name) {
      nameInput.classList.add('controlxy-input-error');
      setTimeout(() => nameInput.classList.remove('controlxy-input-error'), 500);
      return;
    }
    
    window.o2pPresets?.save(name);
    nameInput.value = '';
    refreshPresetList();
  });
  
  // Enter key in save input
  panelElement.querySelector('#o2p-save-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      panelElement.querySelector('#o2p-save-btn').click();
    }
  });
  
  // Sequence creation from step editor
  panelElement.querySelector('#o2p-seq-create-btn').addEventListener('click', () => {
    const nameInput = panelElement.querySelector('#o2p-seq-name');
    const loopCheckbox = panelElement.querySelector('#o2p-seq-loop-editor');
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
    
    window.o2pPresets?.defineSequence(name, steps, { loop });
    
    nameInput.value = '';
    loopCheckbox.checked = false;
    clearStepEditor();
    refreshSequenceList();
    refreshPresetDropdown();
  });
  
  // Add step button
  panelElement.querySelector('#o2p-add-step-btn').addEventListener('click', () => {
    const presetSelect = panelElement.querySelector('#o2p-add-preset-select');
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
  panelElement.querySelector('#o2p-seq-stop').addEventListener('click', () => {
    window.o2pPresets?.stopSequence();
    updateSequenceStatus('Stopped');
  });
  
  // Listen for sequence events
  window.addEventListener('o2p:sequenceStarted', (e) => {
    updateSequenceStatus('Playing: ' + e.detail.name);
  });
  
  window.addEventListener('o2p:sequenceStopped', () => {
    updateSequenceStatus('Stopped');
  });
  
  window.addEventListener('o2p:sequenceComplete', (e) => {
    updateSequenceStatus('Complete: ' + e.detail.name);
  });
  
  window.addEventListener('controlxy:saved', () => {
    showSaveIndicator();
  });
  
  window.addEventListener('controlxy:loaded', () => {
    refreshPresetList();
    refreshSequenceList();
    refreshPresetDropdown();
  });
  
  // Export
  panelElement.querySelector('#o2p-export-btn').addEventListener('click', exportPresets);
  
  // Import
  panelElement.querySelector('#o2p-import-btn').addEventListener('click', () => {
    panelElement.querySelector('#o2p-import-file').click();
  });
  
  panelElement.querySelector('#o2p-import-file').addEventListener('change', importPresets);
  
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
  const seqData = window.o2pPresets?.getSequence(name);
  
  if (!seqData) {
    console.warn('[o2pPresetUI] Sequence "' + name + '" not found');
    return;
  }
  
  // Ensure the panel exists and is visible
  if (!panelElement) {
    createPresetUI();
  }
  
  panelElement.classList.add('controlxy-panel-visible');
  panelVisible = true;
  
  const isLegacy = Array.isArray(seqData);
  const seq = isLegacy ? seqData : (seqData.steps || seqData);
  const seqLoop = isLegacy ? false : (seqData.loop ?? false);
  
  if (!seq || !Array.isArray(seq)) {
    console.warn('[o2pPresetUI] Invalid sequence data for "' + name + '"', seqData);
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
  const nameInput = panelElement.querySelector('#o2p-seq-name');
  const loopCheckbox = panelElement.querySelector('#o2p-seq-loop-editor');
  
  if (nameInput) nameInput.value = name;
  if (loopCheckbox) loopCheckbox.checked = seqLoop;
  
  renderStepEditor();
  
  // Switch to sequences tab
  const seqTab = panelElement.querySelector('[data-tab="sequences"]');
  if (seqTab) {
    seqTab.click();
  }
  
  console.log('[o2pPresetUI] Loaded sequence "' + name + '" to editor (' + editorSteps.length + ' steps)');
}

function renderStepEditor() {
  const list = panelElement?.querySelector('#o2p-step-list');
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
        <button class="step-up" title="Move up" ${i === 0 ? 'disabled' : ''}>\u2191</button>
        <button class="step-down" title="Move down" ${i === editorSteps.length - 1 ? 'disabled' : ''}>\u2193</button>
        <button class="step-delete" title="Remove">\u00d7</button>
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
  const select = panelElement?.querySelector('#o2p-add-preset-select');
  if (!select) return;
  
  const presets = window.o2pPresets?.list() || [];
  const sequences = window.o2pPresets?.listSequences() || [];
  
  select.innerHTML = '<option value="">Select preset...</option>';
  
  if (presets.length > 0) {
    select.innerHTML += '<optgroup label="Presets">' + 
      presets.map(p => '<option value="' + p + '">' + p + '</option>').join('') +
      '</optgroup>';
  }
  
  if (sequences.length > 0) {
    select.innerHTML += '<optgroup label="Sequences (nested)">' + 
      sequences.map(s => '<option value="seq:' + s + '">seq:' + s + '</option>').join('') +
      '</optgroup>';
  }
}

function updateSequenceStatus(text) {
  const status = panelElement?.querySelector('#o2p-seq-status');
  if (status) {
    status.textContent = text;
    status.classList.add('active');
    setTimeout(() => status.classList.remove('active'), 2000);
  }
}

function showSaveIndicator(msg) {
  const title = panelElement?.querySelector('.controlxy-panel-title');
  if (title) {
    const original = title.textContent;
    title.textContent = msg || 'Saved!';
    setTimeout(() => { title.textContent = original; }, 1000);
  }
}

// ============================================================================
// PRESET LIST WITH SLOT ASSIGNMENT
// ============================================================================

/**
 * Get all o2pLauncher UIDs and their bank/slot configurations
 */
function getLauncherSlotOptions() {
  const shared = window.o2pPresets?._shared;
  if (!shared) return [{ value: '', label: 'No slot' }];
  
  const bucket = 'o2pLaunchers';
  const launcherMap = shared.state?.[bucket] || {};
  const launcherUids = Object.keys(launcherMap);
  const options = [];
  
  // Add "unassigned" option
  options.push({ value: '', label: 'No slot' });
  
  for (const uid of launcherUids) {
    const launcherItem = launcherMap[uid];
    const launcher = launcherItem?.data || launcherItem || {};
    const banks = launcher.banks || [];
    const slotsPerBank = banks[0]?.slots?.length || 6;
    
    for (let bankIdx = 0; bankIdx < banks.length; bankIdx++) {
      for (let slotIdx = 0; slotIdx < slotsPerBank; slotIdx++) {
        const slotKey = uid + ':' + bankIdx + ':' + slotIdx;
        const label = uid + ' B' + (bankIdx + 1) + '-' + (slotIdx + 1);
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
  const shared = window.o2pPresets?._shared;
  if (!shared) return null;
  
  const bucket = 'o2pLaunchers';
  const launcherMap = shared.state?.[bucket] || {};
  
  for (const uid of Object.keys(launcherMap)) {
    const launcherItem = launcherMap[uid];
    const launcher = launcherItem?.data || launcherItem || {};
    const banks = launcher.banks || [];
    
    for (let bankIdx = 0; bankIdx < banks.length; bankIdx++) {
      const slots = banks[bankIdx]?.slots || [];
      for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
        const slot = slots[slotIdx];
        if (slot && slot.type === 'preset' && slot.name === presetName) {
          return { uid, bankIdx, slotIdx, key: uid + ':' + bankIdx + ':' + slotIdx };
        }
      }
    }
  }
  
  return null;
}

/**
 * Assign a preset to an o2pLauncher slot
 */
function assignPresetToSlot(presetName, slotKey) {
  const shared = window.o2pPresets?._shared;
  if (!shared) return;
  
  const bucket = 'o2pLaunchers';
  
  // First, remove preset from any existing slot
  const existing = findPresetSlot(presetName);
  if (existing) {
    const { uid, bankIdx, slotIdx } = existing;
    const launcherItem = shared.state?.[bucket]?.[uid];
    const launcherData = launcherItem?.data || launcherItem;
    if (launcherData?.banks?.[bankIdx]?.slots) {
      launcherData.banks[bankIdx].slots[slotIdx] = null;
      shared.saveLauncherByKind('o2pLauncher', uid, launcherData);
    }
  }
  
  // If no slot key provided, just unassign
  if (!slotKey) {
    shared.save?.();
    refreshLauncherUI();
    return;
  }
  
  // Parse the slot key
  const parts = slotKey.split(':');
  const uid = parts[0];
  const bankIdx = parseInt(parts[1]);
  const slotIdx = parseInt(parts[2]);
  
  // Get or create launcher
  const launcherData = shared.getOrCreateLauncherByKind('o2pLauncher', uid, {
    currentBank: 0,
    mode: 'preset',
    tween: true,
    visible: true,
    banks: []
  }) || { banks: [] };
  
  // Ensure bank exists
  while (launcherData.banks.length <= bankIdx) {
    launcherData.banks.push({
      name: 'Bank ' + (launcherData.banks.length + 1),
      slots: Array(6).fill(null)
    });
  }
  
  // Assign the preset
  launcherData.banks[bankIdx].slots[slotIdx] = {
    type: 'preset',
    name: presetName
  };
  
  // Save and refresh UI
  shared.saveLauncherByKind('o2pLauncher', uid, launcherData);
  shared.save?.();
  refreshLauncherUI();
}

/**
 * Refresh launcher UI to reflect current slot assignments
 */
function refreshLauncherUI() {
  // Trigger a re-render of any visible o2p launchers
  document.querySelectorAll('.controlxy-launcher.o2p-launcher').forEach(launcher => {
    const uid = launcher.dataset.uid;
    if (uid) {
      window.dispatchEvent(new CustomEvent('o2p:launcherRefresh', { detail: { uid } }));
    }
  });
}

function refreshPresetList() {
  const list = panelElement?.querySelector('#o2p-preset-list');
  if (!list) return;
  
  const presets = window.o2pPresets?.list() || [];
  const slotOptions = getLauncherSlotOptions();
  
  if (presets.length === 0) {
    list.innerHTML = '<div class="controlxy-empty">No presets saved</div>';
    return;
  }
  
  list.innerHTML = presets.map(name => {
    const slot = findPresetSlot(name);
    const slotBadge = slot 
      ? '<span class="controlxy-preset-slot-badge">B' + (slot.bankIdx + 1) + '-' + (slot.slotIdx + 1) + '</span>'
      : '<span class="controlxy-preset-slot-badge unassigned">\u2014</span>';
    
    const selectOptions = slotOptions.map(opt => {
      const selected = (slot?.key === opt.value) ? 'selected' : '';
      return '<option value="' + opt.value + '" ' + selected + '>' + opt.label + '</option>';
    }).join('');
    
    return `
      <div class="controlxy-preset-item" data-preset="${name}">
        <span class="controlxy-preset-name">${name}</span>
        ${slotBadge}
        <select class="controlxy-preset-slot-select" title="Assign to launcher slot">
          ${selectOptions}
        </select>
        <div class="controlxy-preset-actions">
          <button class="controlxy-recall-btn" title="Recall preset">\u25b6</button>
          <button class="controlxy-delete-btn" title="Delete preset">\u00d7</button>
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
      const dur = parseFloat(panelElement.querySelector('#o2p-recall-dur').value) || 0;
      const ease = panelElement.querySelector('#o2p-recall-ease').value;
      
      window.o2pPresets?.recall(name, { dur, ease });
    });
  });
  
  // Bind delete buttons
  list.querySelectorAll('.controlxy-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.preset;
      if (confirm('Delete preset "' + name + '"?')) {
        // Also remove from any slot assignment
        assignPresetToSlot(name, '');
        window.o2pPresets?.delete(name);
        refreshPresetList();
      }
    });
  });
}

// ============================================================================
// SEQUENCE LIST
// ============================================================================

function refreshSequenceList() {
  const list = panelElement?.querySelector('#o2p-sequence-list');
  if (!list) return;
  
  const sequences = window.o2pPresets?.listSequences() || [];
  
  refreshPresetDropdown();
  
  if (sequences.length === 0) {
    list.innerHTML = '<div class="controlxy-empty">No sequences defined</div>';
    return;
  }
  
  list.innerHTML = sequences.map(name => {
    const seqData = window.o2pPresets?.getSequence(name);
    
    const isLegacy = Array.isArray(seqData);
    const seq = isLegacy ? seqData : (seqData?.steps || seqData);
    const seqLoop = isLegacy ? false : (seqData?.loop ?? false);
    const stepCount = Array.isArray(seq) ? seq.length : 0;
    
    const hasPerStepDur = Array.isArray(seq) && seq.some(step => 
      typeof step === 'object' && step.dur !== undefined
    );
    
    const durIcon = hasPerStepDur ? ' [dur]' : '';
    const loopIcon = seqLoop ? ' [loop]' : '';
    
    return `
      <div class="controlxy-preset-item" data-sequence="${name}">
        <span class="controlxy-preset-name">${name}${loopIcon}${durIcon} <small>(${stepCount})</small></span>
        <div class="controlxy-preset-actions">
          <button class="controlxy-edit-seq-btn" title="Edit sequence">Edit</button>
          <button class="controlxy-play-seq-btn" title="Play sequence">\u25b6</button>
          <button class="controlxy-delete-seq-btn" title="Delete sequence">\u00d7</button>
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
      const dur = parseFloat(panelElement.querySelector('#o2p-seq-dur').value) || 1;
      const ease = panelElement.querySelector('#o2p-seq-ease').value;
      
      window.o2pPresets?.playSequence(name, { dur, ease });
      updateSequenceStatus('Playing: ' + name);
    });
  });
  
  // Bind delete buttons
  list.querySelectorAll('.controlxy-delete-seq-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.controlxy-preset-item').dataset.sequence;
      if (confirm('Delete sequence "' + name + '"?')) {
        // Use the shared module API
        const shared = window.o2pPresets?._shared;
        if (shared) {
          shared.deleteByKind('o2pSequence', name);
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
  const shared = window.o2pPresets?._shared;
  if (!shared) return;
  
  // Filter items to only o2p kinds
  const o2pItems = (shared.state?.items || []).filter(item => {
    return item.kind && item.kind.startsWith('o2p');
  });
  
  const exportData = {
    version: 1,
    exportedAt: Date.now(),
    project: shared.state?.project,
    type: 'o2p',
    items: o2pItems
  };
  
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'o2p-presets-' + Date.now() + '.json';
  a.click();
  
  URL.revokeObjectURL(url);
  console.log("[o2pPresetUI] Presets exported");
}

function importPresets(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      
      if (!data || !Array.isArray(data.items)) {
        alert("Invalid import file: no items array found");
        return;
      }
      
      const merge = confirm("Merge with existing presets?\n\nOK = Merge\nCancel = Replace all o2p data");
      
      const shared = window.o2pPresets?._shared;
      if (!shared) {
        alert("o2pPresets not initialized");
        return;
      }
      
      if (!merge) {
        // Remove existing o2p items
        const toRemove = (shared.state?.items || [])
          .filter(item => item.kind && item.kind.startsWith('o2p'))
          .map(item => item.id);
        
        for (const id of toRemove) {
          shared.deleteItem(id);
        }
      }
      
      // Add imported items
      for (const item of data.items) {
        if (!item.kind || !item.kind.startsWith('o2p')) continue;
        
        // Check for existing by kind + name/uid
        const exists = (shared.state?.items || []).some(x => 
          x.kind === item.kind && (x.name === item.name || x.uid === item.uid)
        );
        
        if (!exists || !merge) {
          shared.addItem({
            ...item,
            id: undefined, // let addItem generate new id
            createdAt: undefined,
            updatedAt: undefined
          });
        }
      }
      
      refreshPresetList();
      refreshSequenceList();
      
      console.log("[o2pPresetUI] Imported " + data.items.length + " items");
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
  // Alt + Shift + O = Toggle o2p preset panel
  if (e.altKey && e.shiftKey && e.key === 'O') {
    e.preventDefault();
    togglePresetUI();
  }
});

// ============================================================================
// AUTO-REFRESH ON SAVE/LOAD EVENTS
// ============================================================================

window.addEventListener('controlxy:loaded', () => {
  console.log("[o2pPresetUI] Data loaded, refreshing lists");
  if (panelVisible) {
    refreshPresetList();
    refreshSequenceList();
  }
});

window.addEventListener('controlxy:saved', () => {
  if (panelVisible) {
    refreshPresetList();
    refreshSequenceList();
  }
});

// ============================================================================
// GLOBAL API
// ============================================================================

window.o2pPresetUI = {
  show: showPresetUI,
  hide: hidePresetUI,
  toggle: togglePresetUI,
  refresh: () => {
    refreshPresetList();
    refreshSequenceList();
  }
};

console.log("[o2pPresetUI] Module loaded. Toggle with Alt+Shift+O or window.o2pPresetUI.toggle()");
