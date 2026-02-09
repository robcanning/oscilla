/*!
 * oscillaSystemRehearsal.js — Rehearsal Marks Popup
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

import { getSortedMarkerNavPoints } from "../interaction/markers.js";

// ===========================
// Rehearsal Marks Popup
// ===========================

/**
 * Open the rehearsal marks popup and populate with rehearsal marks + user markers
 */
export function openRehearsalPopup() {
  const popup = document.getElementById("rehearsal-popup");
  if (!popup) return;
  
  const hasRehearsalMarks = (window.sortedMarks?.length || 0) > 0;
  const markerNavPoints = getSortedMarkerNavPoints();
  const hasMarkers = markerNavPoints.length > 0;
  
  // Don't open if nothing to show
  if (!hasRehearsalMarks && !hasMarkers) return;
  
  // Rebuild the popup content
  rebuildRehearsalPopupContent(popup, markerNavPoints);
  
  popup.classList.remove("hidden");
  popup.style.display = "flex";
}

/**
 * Rebuild the popup content with rehearsal marks and user markers
 */
function rebuildRehearsalPopupContent(popup, markerNavPoints) {
  // Find or create the list container
  let listContainer = popup.querySelector(".rehearsal-popup-list");
  if (!listContainer) {
    // If the popup doesn't have a list container, find the existing buttons
    // and wrap them or just append the marker section
    listContainer = popup;
  }
  
  // Remove any previous marker section
  const existingMarkerSection = popup.querySelector(".marker-nav-section");
  if (existingMarkerSection) existingMarkerSection.remove();
  
  // Add marker section if there are named markers
  if (markerNavPoints.length > 0) {
    const section = document.createElement("div");
    section.className = "marker-nav-section";
    
    const heading = document.createElement("div");
    heading.className = "marker-nav-heading";
    heading.textContent = "Markers";
    section.appendChild(heading);
    
    for (const point of markerNavPoints) {
      const btn = document.createElement("button");
      btn.className = "rehearsal-popup-btn marker-nav-btn";
      btn.textContent = point.name;
      btn.title = `Jump to marker "${point.name}"`;
      btn.addEventListener("click", () => {
        window.jumpToRehearsalMark?.(point.name);
        closeRehearsalPopup();
      });
      section.appendChild(btn);
    }
    
    popup.appendChild(section);
  }
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
