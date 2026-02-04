/*!
 * oscillaSystemClients.js — Multiplayer Presence & Audio Master State
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 * 
 * UPGRADED: Compact colored square indicators with tooltips
 * - Small colored squares instead of text names
 * - Hover/tap shows name tooltip
 * - Double-tap own indicator to edit name and color
 */

import { sendClientNameUpdate } from './socket.js';
import { 
    MARKER_COLORS, 
    DEFAULT_MARKER_COLOR,
    getPresetColors, 
    darkenColor 
} from '../interaction/colorPicker.js';

// ===========================
// Module State
// ===========================
let isAudioMaster = false;
let localClientColor = null;  // Will be loaded from localStorage or assigned

// Client colors - derived from MARKER_COLORS for consistency
// When a client drops a marker, it uses DEFAULT_MARKER_COLOR which matches their client indicator
const CLIENT_COLORS = Object.values(MARKER_COLORS).map(c => c.hex);

// ===========================
// Color Management
// ===========================

/**
 * Get or assign a color for the local client
 * Defaults to DEFAULT_MARKER_COLOR, but will pick a unique color if others are connected
 */
function getLocalClientColor() {
  if (localClientColor) return localClientColor;
  
  // Try to load from localStorage
  const stored = localStorage.getItem("clientColor");
  if (stored) {
    localClientColor = stored;
    return localClientColor;
  }
  
  // Default to DEFAULT_MARKER_COLOR (pale red) - matches marker drop color
  localClientColor = DEFAULT_MARKER_COLOR;
  localStorage.setItem("clientColor", localClientColor);
  return localClientColor;
}

/**
 * Assign a unique color that isn't already used by other connected clients
 * Called when client first connects and receives the client list
 * @param {Array} otherClients - Array of other client objects with colors
 */
function assignUniqueColor(otherClients = []) {
  // If user already has a stored color preference, respect it
  const stored = localStorage.getItem("clientColor");
  if (stored) {
    localClientColor = stored;
    return localClientColor;
  }
  
  // Collect colors already in use by other clients
  const usedColors = new Set();
  otherClients.forEach(client => {
    if (client.color) {
      usedColors.add(client.color.toLowerCase());
    }
  });
  
  // Find first available color from CLIENT_COLORS
  let assignedColor = null;
  for (const color of CLIENT_COLORS) {
    if (!usedColors.has(color.toLowerCase())) {
      assignedColor = color;
      break;
    }
  }
  
  // If all colors are taken, pick one based on client count to spread distribution
  if (!assignedColor) {
    const index = otherClients.length % CLIENT_COLORS.length;
    assignedColor = CLIENT_COLORS[index];
  }
  
  localClientColor = assignedColor;
  localStorage.setItem("clientColor", localClientColor);
  
  console.log("[clients] Assigned unique color:", assignedColor);
  return assignedColor;
}

/**
 * Set client color and persist
 */
function setLocalClientColor(color) {
  localClientColor = color;
  localStorage.setItem("clientColor", color);
  // Trigger UI update
  if (window.clients) {
    updateClientList(window.clients);
  }
}

// ===========================
// Client Management
// ===========================

/**
 * Initialise client UI and event handlers
 */
export function initClientUI() {
  // Load stored client name
  window.localClientName = localStorage.getItem("clientName") || "";
  
  // Initialize color
  getLocalClientColor();

  // Audio master button handler
  document.getElementById("audio-master-button")?.addEventListener("click", toggleAudioMaster);
  
  // Inject CSS for client indicators
  injectClientIndicatorStyles();
}

/**
 * Inject CSS styles for the client indicator system
 */
function injectClientIndicatorStyles() {
  if (document.getElementById('client-indicator-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'client-indicator-styles';
  style.textContent = `
    /* Client List Container */
    #client-list {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      min-width: 40px;
    }
    
    /* Individual client indicator */
    .client-indicator {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      cursor: pointer;
      position: relative;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      flex-shrink: 0;
    }
    
    .client-indicator:hover {
      transform: scale(1.2);
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.4);
    }
    
    /* Local client has a white border */
    .client-indicator.local {
      border: 2px solid rgba(255, 255, 255, 0.9);
      box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
    }
    
    .client-indicator.local:hover {
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.6);
    }
    
    /* Tooltip - positioned below and to the right */
    .client-indicator .client-tooltip {
      position: absolute !important;
      top: calc(100% + 8px) !important;
      left: 0 !important;
      background: rgba(0, 0, 0, 0.95) !important;
      color: #ffffff !important;
      padding: 4px 8px !important;
      border-radius: 4px !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      white-space: nowrap !important;
      pointer-events: none !important;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 10001 !important;
    }
    
    .client-indicator .client-tooltip::after {
      content: '';
      position: absolute;
      bottom: 100%;
      left: 8px;
      border: 5px solid transparent;
      border-bottom-color: rgba(0, 0, 0, 0.95);
    }
    
    .client-indicator:hover .client-tooltip,
    .client-indicator.tooltip-visible .client-tooltip {
      opacity: 1 !important;
    }
    
    /* Edit modal */
    .client-edit-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(30, 30, 30, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 20px;
      z-index: 100000;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    
    .client-edit-modal h3 {
      margin: 0 0 16px 0;
      color: white;
      font-size: 14px;
      font-weight: 600;
    }
    
    .client-edit-modal .edit-section {
      margin-bottom: 16px;
    }
    
    .client-edit-modal label {
      display: block;
      color: rgba(255, 255, 255, 0.7);
      font-size: 11px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .client-edit-modal input[type="text"] {
      width: 100%;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      padding: 10px 12px;
      color: white;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
    }
    
    .client-edit-modal input[type="text"]:focus {
      border-color: rgba(255, 255, 255, 0.4);
    }
    
    .client-edit-modal .color-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
    }
    
    .client-edit-modal .color-swatch {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: transform 0.15s, border-color 0.15s;
    }
    
    .client-edit-modal .color-swatch:hover {
      transform: scale(1.1);
    }
    
    .client-edit-modal .color-swatch.selected {
      border-color: white;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
    }
    
    .client-edit-modal .button-row {
      display: flex;
      gap: 8px;
      margin-top: 20px;
    }
    
    .client-edit-modal button {
      flex: 1;
      padding: 10px 16px;
      border-radius: 6px;
      border: none;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    
    .client-edit-modal button.primary {
      background: #4CAF50;
      color: white;
    }
    
    .client-edit-modal button.primary:hover {
      background: #45a049;
    }
    
    .client-edit-modal button.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
    
    .client-edit-modal button.secondary:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .client-edit-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 99999;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Update the client list display with colored squares
 * @param {Array} clientArray - Array of client objects or names
 */
export function updateClientList(clientArray) {
  window.clients = clientArray;
  const el = document.getElementById("client-list");
  if (!el) return;

  // Clear existing content
  el.innerHTML = '';
  
  // Handle both array of names (strings) and array of objects
  const clients = clientArray.map(c => {
    if (typeof c === 'string') {
      return { name: c, color: null };
    }
    return c;
  });
  
  // If local client doesn't have a color assigned yet, pick a unique one
  // based on what other clients are using
  if (!localStorage.getItem("clientColor")) {
    const otherClients = clients.filter(c => c.name !== window.localClientName);
    assignUniqueColor(otherClients);
  }

  clients.forEach((client, index) => {
    const name = client.name || client;
    const isLocal = name === window.localClientName;
    
    // Use client's color if available, otherwise assign based on index
    let color;
    if (isLocal) {
      color = getLocalClientColor();
    } else if (client.color) {
      color = client.color;
    } else {
      // Fallback: assign color based on index for clients without color data
      color = CLIENT_COLORS[index % CLIENT_COLORS.length];
    }
    
    // Create indicator element
    const indicator = document.createElement('div');
    indicator.className = `client-indicator${isLocal ? ' local' : ''}`;
    indicator.style.backgroundColor = color;
    indicator.dataset.clientName = name;
    indicator.dataset.isLocal = isLocal;
    
    // Create tooltip
    const tooltip = document.createElement('span');
    tooltip.className = 'client-tooltip';
    tooltip.textContent = isLocal ? `${name} (you)` : name;
    indicator.appendChild(tooltip);
    
    // Touch/click handling for mobile tooltips
    let touchTimeout = null;
    let lastTap = 0;
    
    indicator.addEventListener('touchstart', (e) => {
      const now = Date.now();
      const timeSinceLastTap = now - lastTap;
      
      if (timeSinceLastTap < 300 && isLocal) {
        // Double tap on local indicator - open edit modal
        e.preventDefault();
        openClientEditModal();
      } else {
        // Single tap - show tooltip
        indicator.classList.add('tooltip-visible');
        clearTimeout(touchTimeout);
        touchTimeout = setTimeout(() => {
          indicator.classList.remove('tooltip-visible');
        }, 2000);
      }
      
      lastTap = now;
    });
    
    // Desktop double-click for local client
    if (isLocal) {
      indicator.addEventListener('dblclick', (e) => {
        e.preventDefault();
        openClientEditModal();
      });
    }
    
    el.appendChild(indicator);
  });

  // Auto-assign audio master if sole client
  isAudioMaster = clientArray.length === 1 && 
    (clientArray[0] === window.localClientName || clientArray[0]?.name === window.localClientName);
  updateAudioMasterUI();
}

/**
 * Open the client edit modal (name + color)
 */
function openClientEditModal() {
  // Remove any existing modal
  closeClientEditModal();
  
  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'client-edit-backdrop';
  backdrop.id = 'client-edit-backdrop';
  backdrop.addEventListener('click', closeClientEditModal);
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'client-edit-modal';
  modal.id = 'client-edit-modal';
  
  const currentName = window.localClientName || '';
  const currentColor = getLocalClientColor();
  
  modal.innerHTML = `
    <h3>Edit Your Identity</h3>
    
    <div class="edit-section">
      <label>Display Name</label>
      <input type="text" id="client-name-input" value="${currentName}" placeholder="Enter your name…">
    </div>
    
    <div class="edit-section">
      <label>Color</label>
      <div class="color-grid" id="client-color-grid"></div>
    </div>
    
    <div class="button-row">
      <button class="secondary" id="client-edit-cancel">Cancel</button>
      <button class="primary" id="client-edit-save">Save</button>
    </div>
  `;
  
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  
  // Populate color grid
  const colorGrid = modal.querySelector('#client-color-grid');
  CLIENT_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch${color === currentColor ? ' selected' : ''}`;
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;
    
    swatch.addEventListener('click', () => {
      colorGrid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
    
    colorGrid.appendChild(swatch);
  });
  
  // Focus input
  const nameInput = modal.querySelector('#client-name-input');
  nameInput.focus();
  nameInput.select();
  
  // Handle Enter key
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveClientEdit();
    } else if (e.key === 'Escape') {
      closeClientEditModal();
    }
  });
  
  // Button handlers
  modal.querySelector('#client-edit-cancel').addEventListener('click', closeClientEditModal);
  modal.querySelector('#client-edit-save').addEventListener('click', saveClientEdit);
}

/**
 * Save client edit changes
 */
function saveClientEdit() {
  const modal = document.getElementById('client-edit-modal');
  if (!modal) return;
  
  const nameInput = modal.querySelector('#client-name-input');
  const selectedColor = modal.querySelector('.color-swatch.selected');
  
  const newName = nameInput.value.trim();
  const newColor = selectedColor?.dataset.color || getLocalClientColor();
  
  if (newName) {
    localStorage.setItem("clientName", newName);
    window.localClientName = newName;
    sendClientNameUpdate(newName, newColor);
  }
  
  setLocalClientColor(newColor);
  closeClientEditModal();
  
  // Update the display
  if (window.clients) {
    updateClientList(window.clients);
  }
}

/**
 * Close the client edit modal
 */
function closeClientEditModal() {
  document.getElementById('client-edit-backdrop')?.remove();
  document.getElementById('client-edit-modal')?.remove();
}

// ===========================
// Audio Master
// ===========================

/**
 * Update the audio master button UI state
 */
function updateAudioMasterUI() {
  document.getElementById("audio-master-button")?.classList.toggle("active", isAudioMaster);
}

/**
 * Toggle audio master state
 */
function toggleAudioMaster() {
  isAudioMaster = !isAudioMaster;
  updateAudioMasterUI();
}

/**
 * Set audio master state programmatically
 * @param {boolean} state - New audio master state
 */
export function setAudioMaster(state) {
  isAudioMaster = state;
  updateAudioMasterUI();
}

/**
 * Get current audio master state
 * @returns {boolean} Whether this client is audio master
 */
export function getAudioMaster() {
  return isAudioMaster;
}

// ===========================
// Window Property Definition
// ===========================

/**
 * Define window.isAudioMaster as a getter
 */
export function defineAudioMasterProperty() {
  Object.defineProperty(window, 'isAudioMaster', {
    get: () => isAudioMaster,
    configurable: true
  });
}

// ===========================
// Exports for external use
// ===========================
export { 
  getLocalClientColor, 
  setLocalClientColor,
  assignUniqueColor,
  CLIENT_COLORS 
};
