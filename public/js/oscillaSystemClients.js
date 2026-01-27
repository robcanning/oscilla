/*!
 * oscillaSystemClients.js — Multiplayer Presence & Audio Master State
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

import { sendClientNameUpdate } from './oscillaSystemSocket.js';

// ===========================
// Module State
// ===========================
let isAudioMaster = false;

// ===========================
// Client Management
// ===========================

/**
 * Initialise client UI and event handlers
 */
export function initClientUI() {
  // Load stored client name
  window.localClientName = localStorage.getItem("clientName") || "";

  // Client list click handler for renaming
  document.getElementById("client-list")?.addEventListener("click", handleClientRename);

  // Audio master button handler
  document.getElementById("audio-master-button")?.addEventListener("click", toggleAudioMaster);
}

/**
 * Handle client rename via prompt
 */
function handleClientRename() {
  const newName = prompt("Enter your name:");
  if (newName?.trim()) {
    const trimmedName = newName.trim();
    localStorage.setItem("clientName", trimmedName);
    sendClientNameUpdate(trimmedName);
    window.localClientName = trimmedName;
    updateClientList(window.clients || []);
  }
}

/**
 * Update the client list display
 * @param {string[]} clientArray - Array of client names
 */
export function updateClientList(clientArray) {
  window.clients = clientArray;
  const el = document.getElementById("client-list");
  if (!el) return;

  el.innerHTML = `<strong>Online: </strong> ${clientArray.map((name, i) => {
    const isLocal = name === window.localClientName;
    const sep = i < clientArray.length - 1 ? ', ' : '';
    return `<span class="${isLocal ? 'local-client' : 'remote-client'}">${name}${sep}</span>`;
  }).join('')}`;
  
  el.style.whiteSpace = "normal";
  el.style.wordWrap = "break-word";

  // Auto-assign audio master if sole client
  isAudioMaster = clientArray.length === 1 && clientArray[0] === window.localClientName;
  updateAudioMasterUI();
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
