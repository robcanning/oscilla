/*!
 * playheadOffset.js — Adjustable Playhead Position
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 *
 * Allows the playhead (and playzone) to be dragged horizontally
 * to a preferred screen position, then locked in place.
 *
 * Architecture:
 *   - window.playheadOffsetRatio (0.1–0.9, default 0.5) is the
 *     single source of truth, consumed by scrollToPlayheadVisual()
 *     and ensureWindowPlayheadX().
 *   - Collision logic (getPlayheadX) already reads the DOM element
 *     position, so cue triggering follows automatically.
 *   - Offset is persisted in localStorage (per-client preference).
 */

// ============================================================
// CONSTANTS
// ============================================================

const OFFSET_MIN = 0.10;   // don't allow playhead flush left
const OFFSET_MAX = 0.90;   // don't allow playhead flush right
const OFFSET_DEFAULT = 0.5;
const STORAGE_KEY = "oscilla_playheadOffsetRatio";
const PLAYZONE_WIDTH_PERCENT = 40; // must match CSS #playzone width

// ============================================================
// STATE
// ============================================================

let isLocked = true;    // locked by default — no accidental drags
let isDragging = false;
let handleEl = null;
let lockBtn = null;

// ============================================================
// INIT
// ============================================================

/**
 * Initialise the playhead offset system.
 * Call once after DOM is ready (e.g. from app.js or UIBindings).
 */
export function initPlayheadOffset() {
  // Restore saved ratio (or use default)
  const saved = parseFloat(localStorage.getItem(STORAGE_KEY));
  window.playheadOffsetRatio =
    Number.isFinite(saved) ? clampRatio(saved) : OFFSET_DEFAULT;

  // Build the drag-handle UI inside #playhead
  buildHandleUI();

  // Apply the offset to playzone immediately
  applyPlayzonePosition();

  // Also apply on window resize
  window.addEventListener("resize", applyPlayzonePosition);

  console.log(
    `[PlayheadOffset] Initialised — ratio=${window.playheadOffsetRatio}, locked=${isLocked}`
  );
}

// ============================================================
// HANDLE UI — injected into #playhead
// ============================================================

function buildHandleUI() {
  const playhead = document.getElementById("playhead");
  if (!playhead) {
    console.warn("[PlayheadOffset] #playhead not found — skipping UI build");
    return;
  }

  // --- Container (sits at top of playhead line) ---
  handleEl = document.createElement("div");
  handleEl.id = "playhead-offset-handle";
  handleEl.innerHTML = `
    <div class="playhead-grip-dots">
      <span></span><span></span><span></span>
    </div>
    <button id="playhead-lock-btn"
            class="playhead-offset-lock"
            title="Lock / unlock playhead position">
      <svg class="lock-icon-locked" viewBox="0 0 24 24" width="14" height="14"
           fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <svg class="lock-icon-unlocked" viewBox="0 0 24 24" width="14" height="14"
           fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
      </svg>
    </button>
  `;

  playhead.appendChild(handleEl);

  lockBtn = document.getElementById("playhead-lock-btn");

  // --- Lock toggle ---
  lockBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLock();
  });

  // --- Drag behaviour (horizontal only) ---
  handleEl.addEventListener("mousedown", onDragStart);
  handleEl.addEventListener("touchstart", onDragStart, { passive: false });

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("touchmove", onDragMove, { passive: false });

  document.addEventListener("mouseup", onDragEnd);
  document.addEventListener("touchend", onDragEnd);

  // Initial visual state
  updateLockVisual();
}

// ============================================================
// LOCK / UNLOCK
// ============================================================

function toggleLock() {
  isLocked = !isLocked;
  updateLockVisual();
  console.log(`[PlayheadOffset] ${isLocked ? "Locked" : "Unlocked"}`);
}

function updateLockVisual() {
  if (!handleEl) return;
  handleEl.classList.toggle("unlocked", !isLocked);
  handleEl.classList.toggle("locked", isLocked);
}

// ============================================================
// DRAG LOGIC
// ============================================================

function onDragStart(e) {
  // Don't drag if locked or if the click was on the lock button
  if (isLocked) return;
  if (e.target.closest("#playhead-lock-btn")) return;

  isDragging = true;
  handleEl.classList.add("dragging");

  // Prevent text selection and default touch scroll
  e.preventDefault();
  document.body.style.userSelect = "none";
}

function onDragMove(e) {
  if (!isDragging) return;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const container = window.scoreContainer;
  if (!container) return;

  const viewportWidth = container.clientWidth;
  const newRatio = clampRatio(clientX / viewportWidth);

  window.playheadOffsetRatio = newRatio;

  // Live update visual position
  window.scrollToPlayheadVisual?.();
  applyPlayzonePosition();
}

function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  handleEl?.classList.remove("dragging");
  document.body.style.userSelect = "";

  // Persist
  localStorage.setItem(STORAGE_KEY, String(window.playheadOffsetRatio));

  console.log(
    `[PlayheadOffset] Set ratio=${window.playheadOffsetRatio.toFixed(3)}`
  );
}

// ============================================================
// PLAYZONE POSITIONING
// ============================================================

/**
 * Reposition #playzone so it's centered on the current offset.
 */
export function applyPlayzonePosition() {
  const playzone = document.getElementById("playzone");
  if (!playzone) return;

  const ratio = window.playheadOffsetRatio ?? OFFSET_DEFAULT;
  const halfWidth = PLAYZONE_WIDTH_PERCENT / 2;

  // Center playzone on the offset, expressed as percentage of viewport
  const leftPercent = (ratio * 100) - halfWidth;
  playzone.style.left = `${leftPercent}%`;
}

// ============================================================
// PUBLIC API — for preferences integration
// ============================================================

/**
 * Set the playhead offset ratio programmatically (e.g. from preferences).
 * @param {number} ratio — 0.1 to 0.9
 */
export function setPlayheadOffset(ratio) {
  window.playheadOffsetRatio = clampRatio(ratio);
  localStorage.setItem(STORAGE_KEY, String(window.playheadOffsetRatio));

  window.scrollToPlayheadVisual?.();
  applyPlayzonePosition();
}

/**
 * Get the current offset ratio.
 * @returns {number}
 */
export function getPlayheadOffset() {
  return window.playheadOffsetRatio ?? OFFSET_DEFAULT;
}

/**
 * Reset offset to center (default).
 */
export function resetPlayheadOffset() {
  setPlayheadOffset(OFFSET_DEFAULT);
}

// ============================================================
// UTILITY
// ============================================================

function clampRatio(v) {
  return Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, v));
}

// ============================================================
// WINDOW BINDINGS
// ============================================================

window.playheadOffsetRatio = window.playheadOffsetRatio ?? OFFSET_DEFAULT;
window.initPlayheadOffset = initPlayheadOffset;
window.setPlayheadOffset = setPlayheadOffset;
window.getPlayheadOffset = getPlayheadOffset;
window.resetPlayheadOffset = resetPlayheadOffset;
window.applyPlayzonePosition = applyPlayzonePosition;
