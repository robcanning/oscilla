// js/system/uiUtils.js
//
// Shared UI utility functions for Oscilla
//

// =============================================================
// DRAGGABLE
// =============================================================

/**
 * Make an element draggable by a handle element.
 * Skips drag initiation when clicking on interactive form elements.
 * Handles elements initially positioned with `right`/`bottom` by
 * converting to `left`/`top` on first drag.
 *
 * @param {HTMLElement} el       - The element to move
 * @param {HTMLElement} handleEl - The drag handle (defaults to el itself)
 */
export function makeDraggable(el, handleEl = el) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  handleEl.addEventListener("mousedown", (e) => {
    // Don't initiate drag from interactive elements
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;

    isDragging = true;

    // Convert right/bottom positioning to left/top on first drag
    const style = el.style;
    if ((style.right && style.right !== "auto") && (!style.left || style.left === "auto")) {
      const rect = el.getBoundingClientRect();
      style.left = `${rect.left}px`;
      style.right = "auto";
    }
    if ((style.bottom && style.bottom !== "auto") && (!style.top || style.top === "auto")) {
      const rect = el.getBoundingClientRect();
      style.top = `${rect.top}px`;
      style.bottom = "auto";
    }

    offsetX = e.clientX - el.offsetLeft;
    offsetY = e.clientY - el.offsetTop;
    handleEl.style.cursor = "grabbing";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    el.style.left = `${e.clientX - offsetX}px`;
    el.style.top = `${e.clientY - offsetY}px`;
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      handleEl.style.cursor = "grab";
    }
  });
}
