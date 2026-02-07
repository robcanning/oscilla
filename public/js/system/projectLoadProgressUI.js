// ============================================================
// OSCILLA LOADING INDICATOR — oscillaLoader.js
// ============================================================
// Shows a loading state in the splash screen area with:
// - Progress bar
// - Staged message log
// Appears after splash is dismissed, hides when project is ready.
//
// Usage:
//   showLoader("MyProject");
//   updateLoader("Loading preferences...");
//   updateLoader("Parsing score...");
//   hideLoader();
// ============================================================

let loaderElement = null;
let progressBarElement = null;
let messageLogElement = null;
let projectNameElement = null;
let isVisible = false;
let messageCount = 0;
const MAX_MESSAGES = 5;

/**
 * Create the loader DOM elements (called once)
 */
function ensureLoaderExists() {
  if (loaderElement) return;

  loaderElement = document.createElement("div");
  loaderElement.id = "oscilla-loader";
  loaderElement.className = "oscilla-loader";
  loaderElement.innerHTML = `
    <div class="oscilla-loader-card">
      <div class="oscilla-loader-header">
        <div class="oscilla-loader-spinner"></div>
        <span class="oscilla-loader-project">Loading...</span>
      </div>
      <div class="oscilla-loader-progress">
        <div class="oscilla-loader-progress-bar"></div>
      </div>
      <div class="oscilla-loader-messages"></div>
    </div>
  `;

  document.body.appendChild(loaderElement);

  projectNameElement = loaderElement.querySelector(".oscilla-loader-project");
  progressBarElement = loaderElement.querySelector(".oscilla-loader-progress-bar");
  messageLogElement = loaderElement.querySelector(".oscilla-loader-messages");

  // Inject styles
  if (!document.getElementById("oscilla-loader-styles")) {
    const style = document.createElement("style");
    style.id = "oscilla-loader-styles";
    style.textContent = `
      .oscilla-loader {
        position: fixed;
        inset: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(8px);
        z-index: 999998;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.25s ease, visibility 0.25s ease;
      }

      .oscilla-loader.visible {
        opacity: 1;
        visibility: visible;
      }

      .oscilla-loader-card {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
        padding: 24px 32px;
        min-width: 320px;
        max-width: 400px;
      }

      .oscilla-loader-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .oscilla-loader-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(88, 166, 255, 0.2);
        border-top-color: #58a6ff;
        border-radius: 50%;
        animation: oscilla-spin 0.7s linear infinite;
      }

      @keyframes oscilla-spin {
        to { transform: rotate(360deg); }
      }

      .oscilla-loader-project {
        font-size: 15px;
        font-weight: 600;
        color: #333;
      }

      .oscilla-loader-progress {
        height: 4px;
        background: rgba(0, 0, 0, 0.08);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 16px;
      }

      .oscilla-loader-progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #58a6ff, #a855f7);
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .oscilla-loader-messages {
        font-family: 'Iosevka Term', 'SF Mono', Consolas, monospace;
        font-size: 11px;
        line-height: 1.6;
        color: #666;
        max-height: 100px;
        overflow: hidden;
      }

      .oscilla-loader-messages .msg {
        opacity: 0;
        transform: translateY(-4px);
        animation: oscilla-msg-in 0.2s ease forwards;
      }

      .oscilla-loader-messages .msg.done {
        color: #22c55e;
      }

      .oscilla-loader-messages .msg.done::before {
        content: "✓ ";
      }

      .oscilla-loader-messages .msg.active::before {
        content: "› ";
        color: #58a6ff;
      }

      @keyframes oscilla-msg-in {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Dark mode support */
      body.dark-mode .oscilla-loader {
        background: rgba(15, 15, 20, 0.9);
      }

      body.dark-mode .oscilla-loader-card {
        background: #1a1a24;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      }

      body.dark-mode .oscilla-loader-project {
        color: #e5e5e5;
      }

      body.dark-mode .oscilla-loader-progress {
        background: rgba(255, 255, 255, 0.1);
      }

      body.dark-mode .oscilla-loader-messages {
        color: #999;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Show the loading indicator
 * @param {string} projectName - Name of project being loaded
 */
export function showLoader(projectName = "project") {
  ensureLoaderExists();

  projectNameElement.textContent = `Loading "${projectName}"`;
  progressBarElement.style.width = "0%";
  messageLogElement.innerHTML = "";
  messageCount = 0;

  loaderElement.classList.add("visible");
  isVisible = true;

  console.log(`[Loader] 🔄 Loading "${projectName}"`);
}

/**
 * Update the loader with a new message and optional progress
 * @param {string} message - Status message
 * @param {number} [progress] - Progress percentage (0-100)
 */
export function updateLoader(message, progress) {
  if (!loaderElement || !isVisible) return;

  // Update progress bar
  if (typeof progress === "number") {
    progressBarElement.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }

  if (!message) return;

  // Mark previous message as done
  const prevActive = messageLogElement.querySelector(".msg.active");
  if (prevActive) {
    prevActive.classList.remove("active");
    prevActive.classList.add("done");
  }

  // Add new message
  const msgEl = document.createElement("div");
  msgEl.className = "msg active";
  msgEl.textContent = message;
  messageLogElement.appendChild(msgEl);
  messageCount++;

  // Remove old messages if too many
  while (messageLogElement.children.length > MAX_MESSAGES) {
    messageLogElement.removeChild(messageLogElement.firstChild);
  }

  console.log(`[Loader] ${progress != null ? `(${progress}%)` : "›"} ${message}`);
}

/**
 * Hide the loading indicator
 */
export function hideLoader() {
  if (!loaderElement || !isVisible) return;

  // Mark last message as done
  const lastActive = messageLogElement.querySelector(".msg.active");
  if (lastActive) {
    lastActive.classList.remove("active");
    lastActive.classList.add("done");
  }

  // Small delay so user sees "Ready" state
  setTimeout(() => {
    loaderElement.classList.remove("visible");
    isVisible = false;
    console.log("[Loader] ✅ Complete");
  }, 300);
}

/**
 * Check if loader is currently visible
 */
export function isLoaderVisible() {
  return isVisible;
}

// Expose globally for non-module usage
window.showLoader = showLoader;
window.updateLoader = updateLoader;
window.hideLoader = hideLoader;