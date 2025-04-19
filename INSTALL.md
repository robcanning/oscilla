# INSTALL.md

## Installing the Development Environment

This document outlines the steps to set up the development environment for the **Interactive Scrolling Score** project on **Linux (Debian-based)**, **Windows**, and **macOS**.

---

## Prerequisites

### General Requirements
- **Node.js**: Required to run the WebSocket server and serve static files.
- **Git**: Used for version control and project management.
- **A modern browser**: Recommended: Google Chrome, Mozilla Firefox, or Microsoft Edge.

---

## Installation Steps

### 1. Install Node.js and npm
Node.js is required to run the server. It includes `npm` (Node Package Manager).

#### Linux (Debian-based)
1. Open a terminal.
2. Update your package list:
   ```bash
   sudo apt update
   ```
3. Install Node.js and npm from the official Debian repository:
   ```bash
   sudo apt install -y nodejs npm
   ```
   Alternatively, install a more recent version using NodeSource:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
4. Verify the installation:
   ```bash
   node -v
   npm -v
   ```

#### Windows
1. Download the Node.js installer from [Node.js official website](https://nodejs.org/).
2. Run the installer and follow the prompts.
3. Verify the installation:
   - Open **Command Prompt** or **PowerShell**.
   - Run:
     ```cmd
     node -v
     npm -v
     ```

#### macOS
1. Install Homebrew if not already installed:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. Install Node.js:
   ```bash
   brew install node
   ```
3. Verify the installation:
   ```bash
   node -v
   npm -v
   ```

---

### 2. Install Git
Git is used to clone the project repository.

#### Linux (Debian-based)
1. Open a terminal.
2. Install Git:
   ```bash
   sudo apt update
   sudo apt install -y git
   ```
3. Verify the installation:
   ```bash
   git --version
   ```

#### Windows
1. Download Git for Windows from [Git official website](https://git-scm.com/).
2. Run the installer and follow the prompts.
3. Verify the installation:
   - Open **Command Prompt** or **PowerShell**.
   - Run:
     ```cmd
     git --version
     ```

#### macOS
1. Install Git using Homebrew:
   ```bash
   brew install git
   ```
2. Verify the installation:
   ```bash
   git --version
   ```

---

### 3. Clone the Repository
1. Open a terminal (Linux/macOS) or Command Prompt/PowerShell (Windows).
2. Clone the repository:
   ```bash
   git clone https://git.kompot.si/rob/ponysays.git
   ```
3. Navigate to the project directory:
   ```bash
   cd ponysays
   ```

---

### 4. Install Project Dependencies
1. In the project directory, install the required Node.js packages:
   ```bash
   npm install
   ```

---

### 5. Run the Development Server
1. Start the WebSocket and HTTP server:
   ```bash
   node server.js
   ```
2. Open a browser and navigate to:
   ```
   http://localhost:8001
   ```

---

## Additional Notes

### On Linux (Debian-based)
- If `nodejs` and `npm` are not available in your system repositories or are outdated, install the latest version using the **NodeSource** repository:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

### On Windows
- For ease of development, consider using **Windows Subsystem for Linux (WSL)** to run Linux commands natively on Windows. Follow [Microsoft's WSL installation guide](https://docs.microsoft.com/en-us/windows/wsl/install) to set it up.

### On macOS
- Ensure **Homebrew** is up to date before installing Node.js or Git:
  ```bash
  brew update
  ```

---

## Troubleshooting

### Common Errors
1. **"Command not found" errors**:
   - Ensure that `node`, `npm`, and `git` are installed and available in your system's PATH.

2. **"EACCES" or permission errors on Linux/macOS**:
   - Use `sudo` if necessary:
     ```bash
     sudo npm install
     ```
   - Alternatively, configure npm to avoid global permissions issues:
     ```bash
     mkdir ~/.npm-global
     npm config set prefix '~/.npm-global'
     export PATH=~/.npm-global/bin:$PATH
     ```

3. **"Cannot connect to WebSocket server" error**:
   - Ensure the server is running.
   - Check that no firewall or antivirus is blocking the connection.

---

Congratulations! You have successfully set up the development environment for the **Interactive Scrolling Score** project.
