/*!
 * o2pLauncher.js -- Launcher Bar for o2p Touch-Mode Fader Groups
 * Part of oscillaScore control plane
 * (c) 2025 Rob Canning -- GPLv3
 *
 * Creates one launcher bar per o2p group, positioned below the group's
 * bounding box in SVG space. Same DOM structure as controlXY launchers
 * with `o2p-launcher` modifier class for color differentiation.
 *
 * Persistence: kind "o2pLauncher" via controlShared generic helpers.
 */

import * as shared from "./controlShared.js";

const LAUNCHER_KIND = "o2pLauncher";

// Track which groups already have a launcher
const createdLaunchers = new Set();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create a launcher bar for an o2p group.
 * Called from o2p.js after group registration.
 *
 * @param {string} groupId   - The group ID (e.g. "mixerA")
 * @param {SVGRect} bbox     - Bounding box to position below
 * @param {SVGElement} parent - SVG parent to append the foreignObject into
 * @param {Object} [opts]    - Optional overrides
 * @param {number} [opts.slots=6]  - Number of launcher slots
 * @param {number} [opts.banks=4]  - Number of banks
 */
export function createO2PLauncher(groupId, bbox, parent, opts = {}) {
  if (createdLaunchers.has(groupId)) {
    console.log(`[o2pLauncher] Launcher already exists for group "${groupId}"`);
    return null;
  }

  const slots = opts.slots ?? 6;
  const totalBanks = opts.banks ?? 4;

  const buttonHeight = 44;
  const buttonSpacing = 5;
  const bankBarHeight = 34;
  const padding = 8;
  const totalHeight = buttonHeight + buttonSpacing + bankBarHeight + padding;

  const launcherY = bbox.y + bbox.height + 8;

  // -- foreignObject container --
  const minLauncherWidth = 360;
  const launcherWidth = Math.max(minLauncherWidth, bbox.width);

  const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
  fo.setAttribute("x", bbox.x);
  fo.setAttribute("y", launcherY);
  fo.setAttribute("width", launcherWidth);
  fo.setAttribute("height", totalHeight);
  fo.classList.add("controlxy-launcher-container");
  fo.style.overflow = "visible";

  // -- HTML container --
  const container = document.createElement("div");
  container.className = "controlxy-launcher o2p-launcher";
  container.dataset.uid = groupId;
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.overflow = "visible";
  container.style.boxSizing = "border-box";

  // -- Button row --
  const buttonRow = document.createElement("div");
  buttonRow.className = "controlxy-launcher-buttons";

  for (let i = 0; i < slots; i++) {
    const btn = document.createElement("button");
    btn.className = "controlxy-launcher-slot";
    btn.dataset.slot = i;
    btn.innerHTML = `<span class="slot-number">${i + 1}</span><span class="slot-label">Empty</span>`;
    btn.title = "Left-click: Recall | Long-press: Store current";
    buttonRow.appendChild(btn);
  }

  container.appendChild(buttonRow);

  // -- Bank bar with transport --
  const bankBar = document.createElement("div");
  bankBar.className = "controlxy-launcher-bank-bar";
  bankBar.innerHTML = `
    <button class="controlxy-launcher-seq-play" data-action="seq-play" title="Play Sequence">&#9654;</button>
    <button class="controlxy-launcher-seq-stop" data-action="seq-stop" title="Stop Sequence">&#9632;</button>
    <span class="controlxy-launcher-seq-status"></span>
    <span class="controlxy-launcher-spacer"></span>
    <button class="controlxy-launcher-bank-btn" data-action="prev" title="Previous Bank">&#8592;</button>
    <span class="controlxy-launcher-bank-label">
      <span class="bank-name">Bank 1</span>
      <span class="bank-count">(1/${totalBanks})</span>
    </span>
    <button class="controlxy-launcher-bank-btn" data-action="next" title="Next Bank">&#8594;</button>
    <button class="controlxy-launcher-mode-btn" data-mode="preset" title="Toggle Preset/Sequence Mode">P</button>
    <button class="controlxy-launcher-tween-btn active" data-tween="true" title="Toggle Tween/Jump">~</button>
    <button class="controlxy-launcher-settings-btn" title="Open o2p Preset Manager">&#9881;</button>
  `;
  container.appendChild(bankBar);

  fo.appendChild(container);
  parent.appendChild(fo);

  createdLaunchers.add(groupId);

  initializeLauncher(groupId, container, slots, totalBanks);

  // -- Toggle circle: small clickable dot at bottom-right of group bbox --
  const circleR = 7.5;
  const circleX = bbox.x + bbox.width + 30;
  const circleY = bbox.y + bbox.height - circleR;

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", circleX);
  circle.setAttribute("cy", circleY);
  circle.setAttribute("r", circleR);
  circle.setAttribute("fill", "rgba(232, 152, 48, 0.15)");
  circle.setAttribute("stroke", "#e89830");
  circle.setAttribute("stroke-width", "2");
  circle.setAttribute("cursor", "pointer");
  circle.classList.add("controlxy-hideshow-circle");
  circle.style.pointerEvents = "all";

  circle.addEventListener("click", (e) => {
    e.stopPropagation();
    const visible = fo.style.display !== "none";
    fo.style.display = visible ? "none" : "";
  });

  parent.appendChild(circle);

  console.log(`[o2pLauncher] Created launcher for group "${groupId}"`);
  return fo;
}

// ============================================================================
// REPOSITION (call when new faders register and bbox grows)
// ============================================================================

/**
 * Reposition an existing launcher below an updated bounding box.
 */
export function repositionLauncher(groupId, bbox) {
  const fo = document.querySelector(
    `foreignObject.controlxy-launcher-container .controlxy-launcher.o2p-launcher[data-uid="${groupId}"]`
  )?.closest("foreignObject");

  if (!fo) return;

  fo.setAttribute("x", bbox.x);
  fo.setAttribute("y", bbox.y + bbox.height + 8);
  fo.setAttribute("width", bbox.width);
}

// ============================================================================
// COMPUTE GROUP BOUNDING BOX
// ============================================================================

/**
 * Compute a union bounding box of all fader paths in a group.
 */
export function getGroupBBox(groupId) {
  const group = window._o2pTouchGroups?.[groupId];
  if (!group) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const fader of Object.values(group.faders)) {
    const pathEl = fader.pathEl;
    if (!pathEl) continue;

    const b = pathEl.getBBox();
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  if (!isFinite(minX)) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// ============================================================================
// INITIALIZATION (state, events, persistence)
// ============================================================================

function initializeLauncher(uid, container, slots, totalBanks) {
  if (!shared.state.initialized) {
    const project = shared.getProjectName();
    if (project && project !== "unknown_project") {
      shared.init(project);
    }
  }

  const state = shared.getOrCreateLauncherByKind(LAUNCHER_KIND, uid, {
    currentBank: 0,
    mode: 'preset',
    tween: true,
    visible: true,
    banks: Array(totalBanks).fill(null).map((_, i) => ({
      name: `Bank ${i + 1}`,
      slots: Array(slots).fill(null)
    }))
  });

  // Ensure enough banks/slots
  while (state.banks.length < totalBanks) {
    state.banks.push({
      name: `Bank ${state.banks.length + 1}`,
      slots: Array(slots).fill(null)
    });
  }
  state.banks.forEach(bank => {
    while ((bank.slots?.length || 0) < slots) {
      bank.slots = bank.slots || [];
      bank.slots.push(null);
    }
  });

  container.dataset.uid = uid;

  function getSequenceList() {
    return window.o2pPresets?.listSequences() || [];
  }

  function saveLauncherState() {
    shared.saveLauncherByKind(LAUNCHER_KIND, uid, state);
  }

  // Sequence status elements
  const seqStatus = container.querySelector('.controlxy-launcher-seq-status');
  const seqPlayBtn = container.querySelector('.controlxy-launcher-seq-play');
  const seqStopBtn = container.querySelector('.controlxy-launcher-seq-stop');

  function updateSeqStatus() {
    const active = window.o2pPresets?.getActiveSequence?.();
    if (active && active.running) {
      seqStatus.textContent = '\u25B6 ' + active.name;
      seqStatus.classList.add('active');
      seqPlayBtn.classList.add('playing');
      seqStopBtn.classList.add('active');
    } else {
      seqStatus.textContent = '';
      seqStatus.classList.remove('active');
      seqPlayBtn.classList.remove('playing');
      seqStopBtn.classList.remove('active');
    }
  }

  window.addEventListener('o2p:sequenceStarted', updateSeqStatus);
  window.addEventListener('o2p:sequenceStopped', updateSeqStatus);
  window.addEventListener('o2p:sequenceStep', updateSeqStatus);
  window.addEventListener('o2p:sequenceComplete', updateSeqStatus);

  setTimeout(updateSeqStatus, 100);

  // ---------------------------------------------------------------
  // RENDER BANK
  // ---------------------------------------------------------------

  function renderBank() {
    const bank = state.banks[state.currentBank];
    const bankLabel = container.querySelector('.bank-name');
    const bankCount = container.querySelector('.bank-count');
    const buttons = container.querySelectorAll('.controlxy-launcher-slot');
    const modeBtn = container.querySelector('.controlxy-launcher-mode-btn');
    const tweenBtn = container.querySelector('.controlxy-launcher-tween-btn');

    if (state.mode === 'sequence') {
      modeBtn.textContent = 'S';
      modeBtn.classList.add('sequence-mode');
      modeBtn.title = 'Sequence Mode (click for Preset mode)';
    } else {
      modeBtn.textContent = 'P';
      modeBtn.classList.remove('sequence-mode');
      modeBtn.title = 'Preset Mode (click for Sequence mode)';
    }

    if (state.tween) {
      tweenBtn.classList.add('active');
      tweenBtn.title = 'Tween ON (click to Jump)';
    } else {
      tweenBtn.classList.remove('active');
      tweenBtn.title = 'Jump (click for Tween)';
    }

    bankLabel.textContent = bank.name;
    bankCount.textContent = `(${state.currentBank + 1}/${totalBanks})`;

    if (state.mode === 'sequence') {
      const sequences = getSequenceList();
      const startIndex = state.currentBank * slots;

      buttons.forEach((btn, i) => {
        const slotLabel = btn.querySelector('.slot-label');
        const seqIndex = startIndex + i;

        if (seqIndex < sequences.length) {
          const seqName = sequences[seqIndex];
          btn.classList.add('assigned', 'type-sequence');
          btn.classList.remove('empty');
          btn.dataset.type = 'sequence';
          btn.dataset.name = seqName;
          slotLabel.textContent = seqName;
        } else {
          btn.classList.remove('assigned', 'type-sequence');
          btn.classList.add('empty');
          slotLabel.textContent = 'Empty';
          delete btn.dataset.type;
          delete btn.dataset.name;
        }
      });
    } else {
      buttons.forEach((btn, i) => {
        const slot = bank.slots[i];
        const slotLabel = btn.querySelector('.slot-label');

        if (slot) {
          btn.classList.add('assigned');
          btn.classList.remove('empty');
          btn.dataset.type = slot.type;
          btn.dataset.name = slot.name;
          slotLabel.textContent = slot.name;

          if (slot.type === 'sequence') {
            btn.classList.add('type-sequence');
          } else {
            btn.classList.remove('type-sequence');
          }
        } else {
          btn.classList.remove('assigned', 'type-sequence');
          btn.classList.add('empty');
          slotLabel.textContent = 'Empty';
          delete btn.dataset.type;
          delete btn.dataset.name;
        }
      });
    }

    updateSeqStatus();
  }

  // ---------------------------------------------------------------
  // BANK NAVIGATION
  // ---------------------------------------------------------------

  container.querySelector('[data-action="prev"]').addEventListener('click', (e) => {
    e.stopPropagation();
    state.currentBank = (state.currentBank - 1 + totalBanks) % totalBanks;
    renderBank();
    saveLauncherState();
  });

  container.querySelector('[data-action="next"]').addEventListener('click', (e) => {
    e.stopPropagation();
    state.currentBank = (state.currentBank + 1) % totalBanks;
    renderBank();
    saveLauncherState();
  });

  // ---------------------------------------------------------------
  // SEQUENCE TRANSPORT
  // ---------------------------------------------------------------

  seqPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const sequences = getSequenceList();
    if (sequences.length > 0) {
      const seqName = sequences[0];
      window.o2pPresets?.playSequence(seqName, {
        dur: state.tween ? 1 : 0
      });
    }
    updateSeqStatus();
  });

  seqStopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.o2pPresets?.stopSequence();
    updateSeqStatus();
  });

  // ---------------------------------------------------------------
  // MODE / TWEEN / SETTINGS TOGGLES
  // ---------------------------------------------------------------

  container.querySelector('.controlxy-launcher-mode-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.mode = state.mode === 'preset' ? 'sequence' : 'preset';
    renderBank();
    saveLauncherState();
  });

  container.querySelector('.controlxy-launcher-tween-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.tween = !state.tween;
    renderBank();
    saveLauncherState();
  });

  container.querySelector('.controlxy-launcher-settings-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.o2pPresetUI?.toggle();
  });

  // ---------------------------------------------------------------
  // SLOT BUTTONS (click to recall, context-menu/long-press to save)
  // ---------------------------------------------------------------

  container.querySelectorAll('.controlxy-launcher-slot').forEach(btn => {
    // Click to recall
    btn.addEventListener('click', (e) => {
      e.stopPropagation();

      const name = btn.dataset.name;
      const type = btn.dataset.type;
      if (!name) return;

      container.querySelectorAll('.controlxy-launcher-slot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const dur = state.tween ? 1 : 0;

      if (type === 'preset') {
        window.o2pPresets?.recall(name, { dur, ease: 'easeInOutSine' });
      } else if (type === 'sequence') {
        window.o2pPresets?.playSequence(name, { dur });
      }

      setTimeout(() => btn.classList.remove('active'), 300);
      updateSeqStatus();
    });

    // Right-click to store current state
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const slotIndex = parseInt(btn.dataset.slot);
      const slotName = prompt('Save current state as:', `slot_${state.currentBank + 1}_${slotIndex + 1}`);
      if (!slotName) return;

      window.o2pPresets?.save(slotName);

      state.banks[state.currentBank].slots[slotIndex] = {
        type: 'preset',
        name: slotName
      };

      renderBank();
      saveLauncherState();
    });

    // Long-press triggers context menu
    let pressTimer;
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pressTimer = setTimeout(() => {
        btn.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, view: window
        }));
      }, 500);
    });
    btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
    btn.addEventListener('pointercancel', () => clearTimeout(pressTimer));
  });

  renderBank();

  // ---------------------------------------------------------------
  // REFRESH HANDLERS (persistence reload)
  // ---------------------------------------------------------------

  const refreshHandler = (event) => {
    const { uid: targetUid } = event.detail || {};
    if (!targetUid || targetUid === uid) {
      const launcher = shared.getOrCreateLauncherByKind(LAUNCHER_KIND, uid, state);
      if (launcher) {
        state.currentBank = launcher.currentBank ?? state.currentBank;
        state.mode = launcher.mode ?? state.mode;
        state.tween = launcher.tween ?? state.tween;
        state.visible = launcher.visible ?? state.visible;
        if (launcher.banks) state.banks = launcher.banks;
      }
      renderBank();
    }
  };

  window.addEventListener('o2p:launcherRefresh', refreshHandler);

  const loadedHandler = () => {
    const launcher = shared.getOrCreateLauncherByKind(LAUNCHER_KIND, uid, state);
    if (launcher) {
      state.currentBank = launcher.currentBank ?? state.currentBank;
      state.mode = launcher.mode ?? state.mode;
      state.tween = launcher.tween ?? state.tween;
      state.visible = launcher.visible ?? state.visible;
      if (launcher.banks && launcher.banks.length > 0) {
        state.banks = launcher.banks;
        state.banks.forEach(bank => {
          while ((bank.slots?.length || 0) < slots) {
            bank.slots = bank.slots || [];
            bank.slots.push(null);
          }
        });
      }
      renderBank();
    }
  };

  window.addEventListener('controlxy:loaded', loadedHandler);
}

console.log("[o2pLauncher] Module loaded");
