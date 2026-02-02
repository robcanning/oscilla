# New Project Flow - Developer Documentation

## Overview

This document explains how Oscilla's new project creation flow works, from the splash screen through project initialization. It covers the interaction between client-side UI, server API, and the project loading system.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Splash Screen System](#splash-screen-system)
3. [New Project Creation Flow](#new-project-creation-flow)
4. [Project Browser Flow](#project-browser-flow)
5. [Preferences System](#preferences-system)
6. [Pin State Management](#pin-state-management)
7. [File Locations](#file-locations)
8. [API Endpoints](#api-endpoints)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SPLASH SCREEN                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │   New    │  │  Browse  │  │   Help   │                       │
│  │ Project  │  │ Projects │  │ Tutorial │                       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                       │
└───────┼─────────────┼─────────────┼────────────────────────────┘
        │             │             │
        ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌──────────────┐
   │ Prompt  │  │ Fetch   │  │ Load helper- │
   │ for     │  │ Projects│  │ score project│
   │ Name    │  │ List    │  └──────────────┘
   └────┬────┘  └────┬────┘
        │            │
        ▼            ▼
   ┌─────────────────────────┐  ┌──────────────────┐
   │ POST /api/project/new   │  │  Project Modal   │
   │ {name: "my-project"}    │  │  (sorted by date)│
   └────┬────────────────────┘  └────┬─────────────┘
        │                            │
        ▼                            ▼
   ┌─────────────────────────────────────────┐
   │ Server: Copy template → new project     │
   │ Returns: {ok: true}                     │
   └────┬────────────────────────────────────┘
        │
        ▼
   ┌─────────────────────────────────────────┐
   │ Redirect: /?project=my-project          │
   └────┬────────────────────────────────────┘
        │
        ▼
   ┌─────────────────────────────────────────┐
   │ projectLoader.js: loadProject()         │
   │ • Load preferences.json                 │
   │ • Apply preferences (pins, colors, etc) │
   │ • Load score.svg                        │
   │ • Initialize UI                         │
   │ • Show Inkscape hint (if enabled)       │
   └─────────────────────────────────────────┘
```

---

## Splash Screen System

### Location
- **HTML:** `public/index.html` (lines 22-59)
- **CSS:** `public/css/oscillaSplash.css`
- **JavaScript:** `public/js/projectLoader.js` (wireSplashActions)

### Visual Design

**Modal Behavior:**
- Dark semi-transparent backdrop: `rgba(40, 40, 40, 0.95)`
- Blur effect: `backdrop-filter: blur(6px)`
- Blocks all interaction with background (`pointer-events: all`)
- White container with prominent shadow for visual separation

**Three Action Buttons:**

```html
<!-- Order: New → Browse → Help -->
<button id="new-project-btn">
  <svg><!-- Plus icon --></svg>
  <span>New</span>
</button>

<button id="browse-projects-btn">
  <svg><!-- Folder icon --></svg>
  <span>Browse</span>
</button>

<button id="open-tutorial-btn">
  <svg><!-- Help icon --></svg>
  <span>Help</span>
</button>
```

### When Splash Appears

The splash screen appears when:
1. User visits Oscilla without a `?project=` URL parameter
2. No project has been loaded yet in the session

Code location: `projectLoader.js` (bottom of file)
```javascript
const projectFromURL = urlParams.get("project");
if (projectFromURL) {
  loadProject(projectFromURL);
} else {
  window.showSplashScreen();
}
```

### Hiding the Splash

The splash is hidden when a project loads:
```javascript
// In loadProject() function
showLoader(projectName); // This hides splash via z-index layering

// Later, after load completes:
hideLoader();
setSplashVisibility(false);
```

---

## New Project Creation Flow

### Step-by-Step Process

#### 1. User Clicks "New" Button

**File:** `projectLoader.js` → `wireSplashActions()`

```javascript
newProjectBtn.onclick = async () => {
  console.log("[Splash] Creating new project");
  
  // Step 1: Prompt for name
  const name = prompt("New project name:");
  if (!name) return;

  try {
    // Step 2: Call server API
    const res = await fetch("/api/project/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    const data = await res.json();
    if (!data.ok) {
      alert(data.error);
      return;
    }

    // Step 3: Set hint for post-load guidance
    sessionStorage.setItem("oscilla.showInkscapeHint", name);
    
    // Step 4: Navigate to new project
    window.location.href = `/?project=${encodeURIComponent(name)}`;
    
  } catch (err) {
    console.error("[Splash] Failed to create project:", err);
    alert("Failed to create project. Please try again.");
  }
};
```

#### 2. Server Creates Project

**File:** `server.js` → `/api/project/new` endpoint

The server:
1. Receives project name
2. Validates name (no slashes, dots, etc.)
3. Checks if project already exists
4. Copies `template` directory to new project
5. Returns success/error response

**Template Location:**
```
public/scores/template/
├── score.svg           # Blank SVG template
├── preferences.json    # Default preferences
├── audio/              # Empty audio directory
├── pages/              # Empty pages directory
└── videos/             # Empty videos directory
```

#### 3. Browser Redirects

After successful creation, the browser navigates to:
```
/?project=my-new-project
```

This triggers the project loading flow.

#### 4. Project Loads

**File:** `projectLoader.js` → `loadProject(projectName)`

```javascript
async function loadProject(projectName, options = {}) {
  // 1. Show loader (hides splash)
  showLoader(projectName);
  
  // 2. Set paths
  window.projectBase = `scores/${projectName}/`;
  window.currentProject = projectName;
  
  // 3. Load preferences
  const prefs = await loadPreferences(window.projectBase);
  applyPreferences(prefs);
  
  // 4. Load score.svg
  const svgUrl = `${window.projectBase}score.svg`;
  // ... load and initialize SVG
  
  // 5. Hide loader
  hideLoader();
  
  // 6. Show Inkscape hint if new project
  const hintProject = sessionStorage.getItem("oscilla.showInkscapeHint");
  if (hintProject === projectName) {
    sessionStorage.removeItem("oscilla.showInkscapeHint");
    showInkscapeHint(projectName);
  }
}
```

#### 5. Inkscape Hint Appears

**File:** `projectScoreSetup.js` → `showInkscapeHint()`

A modal dialog appears explaining:
- How to edit the score in Inkscape
- Where the score.svg file is located
- Next steps for the user

The user can dismiss this dialog, and there's a checkbox to "Don't show again" which stores the preference in `localStorage`.

---

## Project Browser Flow

### When User Clicks "Browse"

#### 1. Fetch Projects from Server

**Client:** `projectLoader.js` → `browseBtn.onclick`
```javascript
browseBtn.onclick = async () => {
  const projects = await fetchProjects();
  openProjectModal(projects);
};
```

**API Call:**
```javascript
async function fetchProjects() {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}
```

#### 2. Server Returns Project List with Metadata

**Server:** `server.js` → `/api/projects` endpoint

Returns JSON array:
```json
[
  {
    "name": "my-project",
    "modified": "2025-02-02T10:30:00.000Z"
  },
  {
    "name": "another-project",
    "modified": "2025-02-01T15:20:00.000Z"
  }
]
```

**Server Implementation:**
```javascript
app.get("/api/projects", (req, res) => {
  const scoresDir = path.join(WRITE_DIR, "public", "scores");
  
  fs.readdir(scoresDir, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json([]);
    
    const projects = entries
      .filter(e => e.isDirectory())
      .filter(e => !e.name.startsWith("."))
      .map(e => {
        const projectPath = path.join(scoresDir, e.name);
        const stats = fs.statSync(projectPath);
        return {
          name: e.name,
          modified: stats.mtime.toISOString()
        };
      });
    
    res.json(projects);
  });
});
```

#### 3. Display Modal with Sorted List

**Client:** `projectLoader.js` → `openProjectModal()`

```javascript
async function openProjectModal(projects) {
  const modal = document.getElementById("project-modal");
  const list = document.getElementById("project-list");
  
  // Normalize data
  projects = projects.map(p => 
    typeof p === 'string' ? { name: p } : p
  );
  
  // Sort by date (newest first)
  projects.sort((a, b) => {
    if (a.modified && b.modified) {
      return new Date(b.modified) - new Date(a.modified);
    }
    return (a.name || '').localeCompare(b.name || '');
  });
  
  // Create list items
  projects.forEach(project => {
    list.appendChild(makeProjectListItem(project));
  });
  
  modal.classList.remove("hidden");
}
```

#### 4. Format Timestamps

**Client:** `projectLoader.js` → `makeProjectListItem()`

Timestamps are formatted as:
- "today" - modified today
- "yesterday" - modified yesterday
- "3d ago" - modified 3 days ago
- "Jan 15" - modified earlier (with year if different)

```javascript
function makeProjectListItem(project) {
  const item = document.createElement("div");
  item.className = "project-item";
  
  // Format timestamp
  if (project.modified) {
    const date = new Date(project.modified);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) meta.textContent = "today";
    else if (diffDays === 1) meta.textContent = "yesterday";
    else if (diffDays < 7) meta.textContent = `${diffDays}d ago`;
    else meta.textContent = date.toLocaleDateString(/* ... */);
  }
  
  // Click handler
  item.onclick = () => {
    window.loadProject(project.name, { resetOnLoad: true });
    closeProjectModal();
  };
  
  return item;
}
```

---

## Preferences System

### File Structure

Each project has a `preferences.json` file:
```
public/scores/my-project/
└── preferences.json
```

### Default Preferences

**Location:** `projectLoader.js` → `loadPreferences()`

```json
{
  "darkMode": false,
  "defaultPlaybackSpeed": 1.0,
  "defaultViewMode": "scroll",
  "pinControls": true,
  "pinTopbar": true
}
```

### Loading Preferences

When a project loads:

```javascript
async function loadPreferences(basePath) {
  const prefsPath = `${basePath}preferences.json`;
  try {
    const res = await fetch(prefsPath);
    if (!res.ok) throw new Error("No preferences.json found");
    return await res.json();
  } catch (err) {
    // Return defaults
    return {
      darkMode: false,
      defaultPlaybackSpeed: 1.0,
      defaultViewMode: "scroll",
      pinControls: true,
      pinTopbar: true,
    };
  }
}
```

### Applying Preferences

**Location:** `projectLoader.js` → `applyPreferences(prefs)`

```javascript
window.applyPreferences = function applyPreferences(prefs) {
  // 1. Dark mode
  applyDarkMode?.(!!prefs.darkMode);

  // 2. Duration
  if (prefs.duration_minutes > 0) {
    window.duration = prefs.duration_minutes * 60 * 1000;
  }

  // 3. Pin states (NEW)
  if (prefs.pinControls !== undefined) {
    window.oscillaControlsPinned = prefs.pinControls;
  } else {
    window.oscillaControlsPinned = true; // Default pinned
  }
  
  if (prefs.pinTopbar !== undefined) {
    window.oscillaTopbarPinned = prefs.pinTopbar;
  } else {
    window.oscillaTopbarPinned = true; // Default pinned
  }

  // 4. Visual preferences
  const playhead = document.getElementById("playhead");
  if (playhead && prefs.playheadColor) {
    playhead.style.backgroundColor = prefs.playheadColor;
  }
  // ... etc
};
```

### User-Facing Preferences Dialog

**Location:** `oscillaPreferences.js` → `openPreferencesDialog()`

Users can access via: **Menu → Preferences**

The dialog includes:
- Project metadata (title, author, description)
- Visual preferences (colors, dark mode)
- **Pin Controls** checkbox (default: true)
- **Pin Top Bar** checkbox (default: true)
- Playback settings
- Touch/interaction settings

When saved, preferences are POST'd to:
```
/save-preferences/:projectName
```

Server writes to `preferences.json` in the project directory.

---

## Pin State Management

### How Pinning Works

**Pin State Variables:**
```javascript
// Set from preferences (default: true)
window.oscillaControlsPinned = true;
window.oscillaTopbarPinned = true;

// Used by transport system
window.controlsPinned = window.oscillaControlsPinned ?? true;
window.topbarPinned = window.oscillaTopbarPinned ?? true;
```

### Initialization Flow

#### 1. Preferences Load First

**File:** `projectLoader.js` → `loadProject()`
```javascript
// Load preferences early in project load
const prefs = await loadPreferences(window.projectBase);
applyPreferences(prefs); // Sets window.oscillaControlsPinned/Topbar
```

#### 2. Transport Reads Preference

**File:** `oscillaTransport.js` (top-level)
```javascript
// Read from preference, default to true
window.controlsPinned = window.oscillaControlsPinned ?? true;
window.topbarPinned = window.oscillaTopbarPinned ?? true;
```

#### 3. UI Initializes

**File:** `oscillaTransport.js` → `initializeControlsPin()`
```javascript
export function initializeControlsPin() {
  const pinButton = document.getElementById("pin-controls");
  
  // Set initial visual state based on preference
  pinButton.classList.toggle("active", window.controlsPinned);
  
  // Wire toggle handler
  pinButton.addEventListener("click", () => {
    window.controlsPinned = !window.controlsPinned;
    pinButton.classList.toggle("active", window.controlsPinned);
    
    if (window.controlsPinned) {
      controls?.classList.remove('dismissed');
    } else {
      window.hideControlsLater();
    }
  });
}
```

### Visual Feedback

**CSS:**
```css
/* Pin button shows "active" state when pinned */
.gui-button.active {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}
```

When pinned:
- Button has "active" class
- Controls/topbar stay visible
- Auto-hide is disabled

When unpinned:
- Button loses "active" class
- Controls/topbar auto-hide after inactivity
- User must move mouse to reveal

---

## File Locations

### Client-Side Files

```
public/
├── index.html                    # Main HTML (splash screen structure)
├── css/
│   └── oscillaSplash.css        # Splash screen styles
└── js/
    ├── projectLoader.js         # Project loading, splash wiring
    ├── oscillaTransport.js      # Transport controls, pin logic
    ├── oscillaPreferences.js    # Preferences dialog
    └── projectScoreSetup.js     # Score setup, Inkscape hint
```

### Server-Side Files

```
server.js                        # Main server (API endpoints)
serverUtils.js                   # Project creation utilities
```

### Project Template

```
public/scores/template/
├── score.svg                    # Blank SVG template
├── preferences.json             # Default preferences with pins=true
├── audio/
├── pages/
└── videos/
```

### User Projects

```
public/scores/my-project/
├── score.svg                    # User's score
├── preferences.json             # User's preferences
├── audio/                       # User's audio files
├── pages/                       # User's page overlays
└── videos/                      # User's videos
```

---

## API Endpoints

### GET `/api/projects`

**Returns:** List of projects with metadata

**Response:**
```json
[
  {
    "name": "my-project",
    "modified": "2025-02-02T10:30:00.000Z"
  }
]
```

**Server Implementation:**
- Reads `public/scores/` directory
- Filters out hidden directories (starting with `.`)
- Uses `fs.statSync()` to get modification time
- Returns sorted array of project objects

---

### POST `/api/project/new`

**Purpose:** Create new project from template

**Request Body:**
```json
{
  "name": "my-new-project"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Or on error:**
```json
{
  "ok": false,
  "error": "Project already exists"
}
```

**Server Logic:**
1. Validate project name
2. Check if project exists
3. Copy `template` directory to `scores/my-new-project/`
4. Return success/failure

**Implementation:** `serverUtils.js` → `createNewProject(name)`

---

### POST `/save-preferences/:project`

**Purpose:** Save project preferences

**Request Body:**
```json
{
  "darkMode": true,
  "pinControls": true,
  "pinTopbar": false,
  "playheadColor": "#ff0000"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Server Logic:**
1. Validate project exists
2. Write JSON to `scores/:project/preferences.json`
3. Return success/failure

---

## Development Tips

### Testing New Project Flow

1. **Clear localStorage/sessionStorage** to test first-run experience:
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   ```

2. **Test without URL params** to see splash screen:
   ```
   http://localhost:8001/
   ```

3. **Test with URL params** to bypass splash:
   ```
   http://localhost:8001/?project=test-project
   ```

### Debugging Pin State

Check console for these messages:
```
[Prefs] applyPreferences() called: {...}
[UI] Controls pin initialized.
[UI] Topbar pin initialized.
[UI] Controls pinned — will stay visible.
```

Check window variables in console:
```javascript
console.log('oscillaControlsPinned:', window.oscillaControlsPinned);
console.log('controlsPinned:', window.controlsPinned);
console.log('topbarPinned:', window.topbarPinned);
```

### Modifying Default Preferences

To change defaults for all new projects:

1. Edit `template/preferences.json`
2. Edit `projectLoader.js` → `loadPreferences()` defaults object
3. Edit `oscillaPreferences.js` → field definitions defaults

### Common Issues

**Issue:** Splash blocks clicks after hiding
- **Cause:** `pointer-events` CSS still blocking
- **Fix:** Ensure splash has `.hidden` class or `display: none`

**Issue:** Pins don't persist after reload
- **Cause:** Preferences not being saved
- **Fix:** Check `/save-preferences` endpoint is working

**Issue:** Project modal shows wrong dates
- **Cause:** Server not returning `modified` field
- **Fix:** Check `/api/projects` endpoint implementation

---

## Summary

The new project flow creates a seamless experience:

1. **Splash screen** appears as modal blocker (must choose action)
2. **"New" button** prompts for name → creates project → redirects
3. **Server** copies template → returns success
4. **Client** loads project → applies preferences (pins defaulted to true)
5. **Inkscape hint** shows for new projects (dismissible, rememberable)
6. **User** starts working immediately with pinned controls

The system is designed to be:
- **Modal:** Forces deliberate choice (no accidental clicks)
- **Fast:** Minimal steps from idea to working
- **Configurable:** Preferences system allows customization
- **Developer-friendly:** Clear separation of concerns, documented APIs

---

*Last Updated: 2025-02-02*  
*Oscilla Version: 0.4.2*
