/*!
 * oscillaSystemRehearsal.js — Rehearsal Marks Popup
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

// ===========================
// Rehearsal Marks Popup
// ===========================

/**
 * Open the rehearsal marks popup
 */
export function openRehearsalPopup() {
  const popup = document.getElementById("rehearsal-popup");
  if (!popup || (window.sortedMarks?.length || 0) === 0) return;
  
  popup.classList.remove("hidden");
  popup.style.display = "flex";
}

/**
 * Close the rehearsal marks popup
 */
export function closeRehearsalPopup() {
  const popup = document.getElementById("rehearsal-popup");
  popup?.classList.add("hidden");
}

/**
 * Toggle the rehearsal marks popup visibility
 */
export function toggleRehearsalPopup() {
  const popup = document.getElementById("rehearsal-popup");
  if (!popup) return;
  
  if (popup.classList.contains("hidden")) {
    openRehearsalPopup();
  } else {
    closeRehearsalPopup();
  }
}

/**
 * Initialize rehearsal marks button handler
 */
export function initRehearsalButton() {
  const rehearsalMarksButton = document.getElementById('rehearsal-marks-button');
  rehearsalMarksButton?.addEventListener('click', toggleRehearsalPopup);
}

// ===========================
// Window Bindings
// ===========================

// Expose to window for legacy compatibility
window.closeRehearsalPopup = closeRehearsalPopup;
window.openRehearsalPopup = openRehearsalPopup;
