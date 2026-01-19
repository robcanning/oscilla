---
title: INSTALL
layout: docs_layout.njk
---

# Oscilla — Installation Guide

Oscilla is a browser‑based system for creating and performing synchronized graphic scores.
It can be run **either as a standalone desktop application** (recommended for most users)
**or** via **Node.js** for development and advanced workflows.

---

## Option 1 — Standalone Application (Recommended)

Standalone builds are available for **Linux**, **macOS (Intel & Apple Silicon)**, and **Windows**.

**No Node.js, npm, or Git required.**

### Download

Download the latest release from:

https://github.com/robcanning/oscilla/releases

Choose the build for your operating system:

- **Linux** — AppImage
- **macOS** — `.app` (Intel or Apple Silicon)
- **Windows** — `.exe`

### Run

- **Linux**: Make the AppImage executable and run it
  ```bash
  chmod +x Oscilla-*.AppImage
  ./Oscilla-*.AppImage
  ```

- **macOS**: Open the `.app`
  - You may need to right‑click → **Open** the first time

- **Windows**: Double‑click the `.exe`

Oscilla will start its local server automatically and open in your browser.

### Open Oscilla

If it does not open automatically, visit:

```
http://localhost:8001
```

### Requirements for Standalone Use

| Tool | Purpose |
|------|--------|
| **Inkscape** | Create and edit SVG‑based score projects |
| **Modern web browser** | Chrome, Firefox, Safari, or Edge |

---

## Option 2 — Node.js / npm Installation (Advanced / Development)

This option is intended for:
- contributors and developers
- users modifying Oscilla source code
- custom server integrations

### Requirements

| Tool | Purpose |
|------|--------|
| **Node.js + npm** | Run the Oscilla local server |
| **Inkscape** | Create and edit SVG score projects |
| **Modern web browser** | View and perform scores |
| **Git** (optional) | Clone and update the repository |

---

## Windows (Node.js Route)

### 1. Install Inkscape

https://inkscape.org/release/windows/

### 2. Install Node.js

https://nodejs.org/en/download

Choose the **Windows Installer (.msi)** and ensure:
- **Add to PATH** is enabled

Verify:
```powershell
node -v
npm -v
```

### 3. Get Oscilla

**Option A — Git**
```powershell
git clone https://github.com/robcanning/oscilla.git
cd oscilla
```

**Option B — ZIP**
1. Download from https://github.com/robcanning/oscilla/releases
2. Extract the ZIP
3. Open PowerShell in the extracted folder

### 4. Install & Run
```powershell
npm install
npm start
```

Open:
```
http://localhost:8001
```

---

## Linux (Node.js Route)

### 1. Install Inkscape
```bash
sudo apt update
sudo apt install inkscape
```

### 2. Install Node.js (20.x recommended)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:
```bash
node -v
npm -v
```

### 3. Get Oscilla

```bash
git clone https://github.com/robcanning/oscilla.git
cd oscilla
```

Or download and extract the ZIP from the releases page.

### 4. Install & Run
```bash
npm install
npm start
```

Open:
```
http://localhost:8001
```

---

## macOS (Node.js Route)

### 1. Install Inkscape

https://inkscape.org/release/macos/

### 2. Install Node.js

https://nodejs.org/en/download

Verify:
```bash
node -v
npm -v
```

### 3. Get Oscilla

```bash
git clone https://github.com/robcanning/oscilla.git
cd oscilla
```

Or download and extract the ZIP from the releases page.

### 4. Install & Run
```bash
npm install
npm start
```

Open:
```
http://localhost:8001
```

---

## Test the Demo Project

Once Oscilla is running:

```
http://localhost:8001/?project=helper-score
```

You should see the demo score **helper‑score**.

---

## Inkscape Extension (Optional)

Oscilla includes an optional **Inkscape extension** to assist with:
- creating score templates
- inserting cue elements
- managing IDs and layers

See the documentation for installation and usage details.

---

## Troubleshooting

| Problem | Solution |
|--------|----------|
| App does not start | Ensure port **8001** is free |
| Browser shows blank screen | Check browser console for errors |
| `npm` not found | Reinstall Node.js |
| Inkscape SVG not loading | Ensure SVG is saved as **Plain SVG** |
| Port conflict | Change port in `server.js` |

