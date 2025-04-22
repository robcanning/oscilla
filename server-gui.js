const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let serverProcess;

function createWindow() {
  console.log("🚀 Creating Electron window...");
  mainWindow = new BrowserWindow({
  frame: false,
  autoHideMenuBar: true,
    width: 900,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'oscillaScore Server Monitor'
  });

  // Load from external HTML file
  mainWindow.loadFile('gui.html');

  
  let logBuffer = [];

  function flushLogs() {
    logBuffer.forEach(line => {
      mainWindow.webContents.send('log', line);
    });
    logBuffer = [];
  }

  function launchServer() {
    if (serverProcess) serverProcess.kill();
    serverProcess = spawn('node', ['server.js'], { cwd: __dirname });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      console.log("📥 [stdout]", output);
      logBuffer.push(output);
      if (mainWindow?.webContents?.isLoading() === false) {
        flushLogs();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      console.error("📥 [stderr]", output);
      logBuffer.push('[ERR] ' + output);
      if (mainWindow?.webContents?.isLoading() === false) {
        flushLogs();
      }
    });

    serverProcess.on('close', (code) => {
      const msg = '[SERVER EXITED] Code ' + code;
      console.warn(msg);
      logBuffer.push(msg);
      if (mainWindow?.webContents?.isLoading() === false) {
        flushLogs();
      }
    });
  }

  launchServer();

  mainWindow.webContents.on('did-finish-load', () => {
    flushLogs();
  });


  mainWindow.on('closed', () => {
    if (serverProcess) serverProcess.kill();
    mainWindow = null;
  });
}

function launchServer() {
  console.log("🚀 Launching server.js via spawn...");
  if (serverProcess) serverProcess.kill();
  serverProcess = spawn('node', ['server.js'], { cwd: __dirname });

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    console.log("📥 [stdout]", output);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('log', output);
    }
  });

  serverProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    console.error("📥 [stderr]", output);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('log', '[ERR] ' + output);
    }
  });

  serverProcess.on('close', (code) => {
    const msg = '[SERVER EXITED] Code ' + code;
    console.warn(msg);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('log', msg);
    }
  });
}

ipcMain.on('restart-server', () => {
  
  let logBuffer = [];

  function flushLogs() {
    logBuffer.forEach(line => {
      mainWindow.webContents.send('log', line);
    });
    logBuffer = [];
  }

  function launchServer() {
    if (serverProcess) serverProcess.kill();
    serverProcess = spawn('node', ['server.js'], { cwd: __dirname });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      console.log("📥 [stdout]", output);
      logBuffer.push(output);
      if (mainWindow?.webContents?.isLoading() === false) {
        flushLogs();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      console.error("📥 [stderr]", output);
      logBuffer.push('[ERR] ' + output);
      if (mainWindow?.webContents?.isLoading() === false) {
        flushLogs();
      }
    });

    serverProcess.on('close', (code) => {
      const msg = '[SERVER EXITED] Code ' + code;
      console.warn(msg);
      logBuffer.push(msg);
      if (mainWindow?.webContents?.isLoading() === false) {
        flushLogs();
      }
    });
  }

  launchServer();

  mainWindow.webContents.on('did-finish-load', () => {
    flushLogs();
  });

});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});