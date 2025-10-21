# Oscilla — Installation Guide

Oscilla is a browser-based, Node.js-powered system for creating and performing synchronized graphic scores.  
It runs locally on your computer or over your local network, directly in your web browser.

---

## Requirements

Before installing Oscilla, make sure the following are installed:

| Tool | Purpose |
|------|----------|
| **Node.js + npm** | To run the Oscilla local server |
| **Git** (optional) | To clone and update the repository (or download a ZIP instead) |
| **Inkscape** | Required to create and edit SVG-based score projects |
| **Modern web browser** | Chrome, Firefox, Safari, or Edge |

---

## Windows Installation

### 1. Install Inkscape
Download and install from:  
[https://inkscape.org/release/windows/](https://inkscape.org/release/windows/)

### 2. Install Node.js and npm
Download from:  
[https://nodejs.org/en/download](https://nodejs.org/en/download)

Choose the **Windows Installer (.msi)** version.  
During setup:
- Check **Add to PATH**
- Leave default options selected

After installation, open PowerShell and verify:
```powershell
node -v
npm -v
```

### 3. Install Git (optional)
If you want to use Git for updates, install it from:  
[https://git-scm.com/download/win](https://git-scm.com/download/win)

If you prefer not to use Git, skip this step and use the ZIP download option below.

### 4. Get Oscilla

**Option A – Using Git:**
```powershell
git clone https://github.com/robcanning/oscilla.git
cd oscilla
```

**Option B – Download ZIP:**
1. Visit [https://github.com/robcanning/oscilla/releases](https://github.com/robcanning/oscilla/releases)
2. Download the latest **Source code (zip)**
3. Extract it and open PowerShell inside that folder

### 5. Install and Run
```powershell
npm install
npm start
```

Then open your browser at  
[http://localhost:8001](http://localhost:8001)

---

## Linux Installation

### 1. Install Inkscape
```bash
sudo apt update
sudo apt install inkscape
```

### 2. Install Node.js and npm
To install Node 20.x using NodeSource:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:
```bash
node -v
npm -v
```

### 3. Install Git (optional)
```bash
sudo apt install git
```
Or skip this and download the ZIP file instead.

### 4. Get Oscilla

**Option A – Git clone:**
```bash
git clone https://github.com/robcanning/oscilla.git
cd oscilla
```

**Option B – ZIP download:**
1. Go to [https://github.com/robcanning/oscilla/releases](https://github.com/robcanning/oscilla/releases)
2. Download the `.zip`
3. Extract it and open the folder in a terminal

### 5. Install and Run
```bash
npm install
npm start
```

Then visit  
[http://localhost:8001](http://localhost:8001)

---

## macOS Installation

### 1. Install Inkscape
Download and install from:  
[https://inkscape.org/release/macos/](https://inkscape.org/release/macos/)

After installing, open Inkscape from the **Applications** folder.

### 2. Install Node.js and npm
Download the macOS installer (.pkg) from:  
[https://nodejs.org/en/download](https://nodejs.org/en/download)

Double-click the installer and follow the prompts.

To verify installation:
1. Open **Terminal** (Applications → Utilities → Terminal)
2. Type:
   ```bash
   node -v
   npm -v
   ```

Both should display version numbers.

### 3. Install Git (optional)
If you want to use Git, download it from:  
[https://git-scm.com/download/mac](https://git-scm.com/download/mac)

Alternatively, skip Git and use the ZIP download below.

### 4. Get Oscilla

**Option A – Using Git:**
```bash
git clone https://github.com/robcanning/oscilla.git
cd oscilla
```

**Option B – ZIP file:**
1. Go to [https://github.com/robcanning/oscilla/releases](https://github.com/robcanning/oscilla/releases)
2. Download the latest `.zip`
3. Double-click to extract
4. Open the **oscilla** folder

### 5. Install and Run
1. Open **Terminal**
2. Drag the extracted folder into the Terminal window and press Enter
3. Type:
   ```bash
   npm install
   npm start
   ```

Then open  
[http://localhost:8001](http://localhost:8001)

---

## Test the Demo Project

Once Oscilla is running, open this in your browser:

```
http://localhost:8001/?project=helper-score
```

You should see the demo score titled *helper-score*.

---

## Troubleshooting

| Problem | Solution |
|----------|-----------|
| `npm: command not found` | Reinstall Node.js using the official installer |
| `git: command not found` | Install Git or use the ZIP download option |
| Port 8001 already in use | Close other servers or change the port in `server.js` |
| Blank screen | Check browser console (`Ctrl+Shift+I`) for missing files |
| `module not found` | Run `npm install` again inside the `oscilla` folder |
