#!/usr/bin/env node

// ------------------------------------------------------------
// Project utilities (server-side)
// ------------------------------------------------------------

import {
  createNewProject,
  saveProjectAs,
  importProject,
  exportProject
} from "./serverUtils.js";

import { setupControlXYRoutes } from "./public/js/controlXYPresetsRoutes.mjs";

// ------------------------------------------------------------
// Node core (ESM-safe)
// ------------------------------------------------------------

import { performance } from "node:perf_hooks";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// CLI arguments (yargs, ESM-compatible)
// ------------------------------------------------------------

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv)).argv;

// ------------------------------------------------------------
// Third-party modules (ESM)
// ------------------------------------------------------------

import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import osc from "osc";
import multer from "multer";

// ------------------------------------------------------------
// Express app setup
// ------------------------------------------------------------

const app = express();

// ✅ REQUIRED for your new project APIs
app.use(express.json());

const upload = multer();

// ---------------------------------------------
// Runtime Configuration: Port & OSC Settings
// ---------------------------------------------

// WebSocket / HTTP port
// Priority: CLI arg → env var → fallback default
const port = argv.port || process.env.PORT || 8001;

// OSC settings object
const oscConfig = {
  localAddress: process.env.OSC_LOCAL_ADDRESS || "0.0.0.0",               // Listening address for OSC
  localPort: argv['osc-in'] || process.env.OSC_LOCAL_PORT || 57121,       // OSC input port
  remoteAddress: process.env.OSC_REMOTE_ADDRESS || "127.0.0.1",           // Destination address for outgoing OSC
  remotePort: argv['osc-out'] || process.env.OSC_REMOTE_PORT || 57120     // OSC output port
};

// Host and port for WebSocket clients to connect to
const websocketHost = argv['ws-host'] || process.env.WS_HOST || 'localhost';
const websocketPort = argv['ws-port'] || process.env.WS_PORT || port;     // Defaults to HTTP port if not specified




// ------------------------------------------------------------
// API
// ------------------------------------------------------------

app.get("/api/version", (req, res) => {
  res.json({ version: OSCILLA_VERSION });
});

// ------------------------------------------------------------
// Projects
// ------------------------------------------------------------

app.post("/api/project/new", (req, res) => {
  try {
    const { name } = req.body;
    createNewProject(name);
    res.json({ ok: true, project: name });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/project/save-as", (req, res) => {
  try {
    const { source, name } = req.body;
    saveProjectAs(source, name);
    res.json({ ok: true, project: name });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/project/export/:name", (req, res) => {
  try {
    exportProject(req.params.name, res, OSCILLA_VERSION);
  } catch (err) {
    res.status(400).send(err.message);
  }
});

app.post("/api/project/import", upload.single("file"), async (req, res) => {
  try {
    const { name } = req.body;

    if (!req.file || !req.file.buffer) {
      throw new Error("No .oscilla file uploaded");
    }

    await importProject(req.file.buffer, name);
    res.json({ ok: true, project: name });

  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});


app.get("/api/projects", (req, res) => {
const scoresDir = path.join(WRITE_DIR, "public", "scores");

  fs.readdir(scoresDir, { withFileTypes: true }, (err, entries) => {
    if (err) {
      console.error(err);
      return res.status(500).json([]);
    }

    const projects = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => !name.startsWith("."));

    res.json(projects);
  });
});


// ---------------------------------------------
// Log the Active Configuration (for debugging)
// ---------------------------------------------

console.log(`[CONFIG] HTTP/WebSocket Port: ${port}`);
console.log(`[CONFIG] OSC In: ${oscConfig.localAddress}:${oscConfig.localPort}`);
console.log(`[CONFIG] OSC Out: ${oscConfig.remoteAddress}:${oscConfig.remotePort}`);

// ---------------------------------------------
// API Endpoint for Client-Side Config Retrieval
// ---------------------------------------------

// Returns current WebSocket host/port config to client
app.get('/config', (req, res) => {
  res.json({
    websocketHost,
    websocketPort,
  });
});

// ---------------------------------------------
// Server Launch 
// ---------------------------------------------

/// ---------------------------------------------
// pkg-safe paths (READ vs WRITE)
// ---------------------------------------------
// READ_DIR  → bundled assets (pkg snapshot)
// WRITE_DIR → user-writable working directory

// const IS_PKG = !!process.pkg;

const IS_PKG = !!process.pkg;

// READ: bundled, immutable
const READ_DIR = __dirname;

// WRITE: user workspace (outside snapshot when pkg)
const WRITE_DIR = IS_PKG ? process.cwd() : __dirname;

console.log("[CONFIG] READ_DIR  =", READ_DIR);
console.log("[CONFIG] WRITE_DIR =", WRITE_DIR);





// ------------------------------------------------------------
// Audio filesystem API (EDITOR USE ONLY)
// Maps to: WRITE_DIR/public/scores/<project>/audio/**
// ------------------------------------------------------------

function handleAudioTree(req, res, subPath = "") {
  const project = req.params.project;

  const audioRoot = path.join(
    WRITE_DIR,
    "public",
    "scores",
    project,
    "audio"
  );

  const targetDir = path.join(audioRoot, subPath);

  // Prevent path traversal
  if (!targetDir.startsWith(audioRoot)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    if (!fs.existsSync(targetDir)) {
      return res.json({ path: subPath, directories: [], files: [] });
    }

console.log("[AUDIO TREE]", {
  project,
  audioRoot,
  exists: fs.existsSync(audioRoot)
});

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });

    res.json({
      path: subPath,
      directories: entries.filter(e => e.isDirectory()).map(e => e.name),
      files: entries
        .filter(e => e.isFile())
        .map(e => e.name)
        .filter(n => /\.(wav|aif|aiff|mp3|ogg)$/i.test(n))
    });
  } catch (err) {
    console.error("[api/audio-tree]", err);
    res.status(500).json({ error: "Failed to read audio directory" });
  }
}

// root: /api/audio-tree/:project
app.get("/api/audio-tree/:project", (req, res) => {
  handleAudioTree(req, res, "");
});

// subdirs: /api/audio-tree/:project/foo/bar
app.get("/api/audio-tree/:project/*", (req, res) => {
  handleAudioTree(req, res, req.params[0] || "");
});

// ALIAS: /api/audio-list (for compatibility with oscillaAudio.js)
app.get("/api/audio-list/:project", (req, res) => {
  handleAudioTree(req, res, "");
});

app.get("/api/audio-list/:project/*", (req, res) => {
  handleAudioTree(req, res, req.params[0] || "");
});


// ------------------------------------------------------------
// Audio Upload API
// POST /api/upload-audio/:project
// Optional query param: ?subdir=drums/kicks
// ------------------------------------------------------------

const audioUpload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    // Accept by file extension
    const allowedExtensions = /\.(wav|aif|aiff|mp3|ogg|m4a|webm)$/i;
    
    // Accept by MIME type (for browser MediaRecorder)
    const allowedMimes = [
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/aiff',
      'audio/x-aiff',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a'
    ];
    
    const extOk = allowedExtensions.test(file.originalname);
    const mimeOk = allowedMimes.includes(file.mimetype);
    
    if (extOk || mimeOk) {
      cb(null, true);
    } else {
      console.log(`[UPLOAD] Rejected file: ${file.originalname}, mime: ${file.mimetype}`);
      cb(new Error("Invalid audio file type"));
    }
  }
});

app.post("/api/upload-audio/:project", audioUpload.single("audio"), (req, res) => {
  try {
    const project = req.params.project;
    const subdir = req.query.subdir || "";
    const forceOverwrite = req.query.overwrite === "true";

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const audioRoot = path.join(WRITE_DIR, "public", "scores", project, "audio");
    const targetDir = subdir ? path.join(audioRoot, subdir) : audioRoot;

    // Security: prevent path traversal
    if (!targetDir.startsWith(audioRoot)) {
      return res.status(400).json({ error: "Invalid path" });
    }

    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filename = req.file.originalname;
    const targetPath = path.join(targetDir, filename);
    const relativePath = subdir ? `${subdir}/${filename}` : filename;

    // Check if file exists
    if (fs.existsSync(targetPath) && !forceOverwrite) {
      // Return conflict - let client decide
      return res.status(409).json({
        error: "File already exists",
        conflict: true,
        filename: filename,
        path: relativePath
      });
    }

    // Write file (overwrite if forceOverwrite is true)
    fs.writeFileSync(targetPath, req.file.buffer);
    console.log(`[UPLOAD] Audio saved: ${targetPath}${forceOverwrite ? " (overwritten)" : ""}`);

    res.json({
      ok: true,
      path: relativePath,
      overwritten: forceOverwrite && fs.existsSync(targetPath)
    });

  } catch (err) {
    console.error("[UPLOAD] Error:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});


// ------------------------------------------------------------
// ControlXY Presets API
// ------------------------------------------------------------

setupControlXYRoutes(app, path.join(WRITE_DIR, "public", "scores"));


// ---------------------------------------------
// Static file serving (READ ONLY)
// ---------------------------------------------

app.use(express.static(path.join(READ_DIR, "public")));
app.use("/scores", express.static(path.join(WRITE_DIR, "public/scores")));
app.use("/shared", express.static(path.join(READ_DIR, "public/shared")));


// ------------------------------------------------------------
// VERSION (single source of truth)
// ------------------------------------------------------------

const OSCILLA_VERSION = fs
  .readFileSync(path.join(READ_DIR, "VERSION"), "utf8")
  .trim();

// ---------------------------------------------
// Simple HTML directory lister
// ---------------------------------------------

function listDirectory(dirPath, webPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const links = entries.map(e => {
    const name = e.name + (e.isDirectory() ? "/" : "");
    return `<a href="${webPath}${name}">${name}</a><br>`;
  });
  return `<html><body>${links.join("")}</body></html>`;
}

// ---------------------------------------------
// Directory listing for /scores (READ)
// ---------------------------------------------

app.get("/scores/*", (req, res, next) => {
  const subPath = req.params[0] || "";
  const dir = path.join(READ_DIR, "public/scores", subPath);
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      res.type("html").send(
        listDirectory(dir, req.path.endsWith("/") ? req.path : req.path + "/")
      );
    } else next();
  } catch {
    next();
  }
});

// ---------------------------------------------
// Directory listing for /shared (READ)
// ---------------------------------------------

app.get("/shared/*", (req, res, next) => {
  const subPath = req.params[0] || "";
  const dir = path.join(READ_DIR, "public/shared", subPath);
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      res.type("html").send(
        listDirectory(dir, req.path.endsWith("/") ? req.path : req.path + "/")
      );
    } else next();
  } catch {
    next();
  }
});

// ---------------------------------------------
// Serve rendered Oscilla docs (READ)
// ---------------------------------------------

app.use(
  "/oscilla/docs",
  express.static(path.join(READ_DIR, "public/docs/site"), {
    extensions: ["html"]
  })
);
// ---------------------------------------------
// API: audio list (READ)
// ---------------------------------------------

// app.get("/api/audio-list/:project/*?", (req, res) => {
//   const project = req.params.project;
//   const dirPart = req.params[0] || "";

//   const dirPath = path.join(
//     READ_DIR,
//     "public",
//     "scores",
//     project,
//     "audio",
//     dirPart
//   );

//   try {
//     if (!fs.existsSync(dirPath)) {
//       return res.json({ files: [], directories: [] });
//     }

//     const entries = fs.readdirSync(dirPath, { withFileTypes: true });

//     const files = entries
//       .filter(e => e.isFile())
//       .map(e => e.name)
//       .filter(name => /\.(wav|aiff|aif|mp3|ogg)$/i.test(name));

//     const directories = entries
//       .filter(e => e.isDirectory())
//       .map(e => e.name);

//     res.json({ files, directories });
//   } catch (err) {
//     console.error("[API] audio-list failed:", err);
//     res.status(500).json({ error: "Could not read directory" });
//   }
// });

// app.get("/api/audio-tree/:project/*?", (req, res) => {
//   const project = req.params.project;
//   const subdir = req.params[0] || "";

//   const base = path.join(
//     READ_DIR,
//     "public",
//     "scores",
//     project,
//     "audio"
//   );

//   const dirPath = path.join(base, subdir);

//   // prevent ../ traversal
//   if (!dirPath.startsWith(base)) {
//     return res.status(400).json({ error: "Invalid path" });
//   }

//   if (!fs.existsSync(dirPath)) {
//     return res.json({ directories: [], files: [] });
//   }

//   const entries = fs.readdirSync(dirPath, { withFileTypes: true });

//   res.json({
//     path: subdir,
//     directories: entries.filter(e => e.isDirectory()).map(e => e.name),
//     files: entries
//       .filter(e => e.isFile())
//       .map(e => e.name)
//       .filter(n => /\.(wav|aiff|aif|mp3|ogg)$/i.test(n))
//   });
// });

// app.post("/api/audio-mkdir/:project", express.json(), (req, res) => {
//   const project = req.params.project;
//   const rel = req.body.path || "";

//   const base = path.join(
//     READ_DIR,
//     "public",
//     "scores",
//     project,
//     "audio"
//   );

//   const dirPath = path.join(base, rel);

//   if (!dirPath.startsWith(base)) {
//     return res.status(400).json({ error: "Invalid path" });
//   }

//   fs.mkdirSync(dirPath, { recursive: true });
//   res.json({ ok: true, path: rel });
// });





// ---------------------------------------------
// API: save preferences (WRITE)
// ---------------------------------------------

app.post("/save-preferences/:project", express.json(), (req, res) => {
  const project = req.params.project;
  const prefs = req.body;

  const file = path.join(
    WRITE_DIR,
    "public",
    "scores",
    project,
    "preferences.json"
  );

  try {
    fs.writeFileSync(file, JSON.stringify(prefs, null, 2), "utf8");
    console.log(`[Prefs] ✅ Saved preferences for ${project}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Prefs] ❌ Failed to save preferences:", err);
    res.status(500).json({ error: "Failed to write preferences.json" });
  }
});



const server = app.listen(port, () => {
  console.log(`HTTP server is running on http://localhost:${port}`);
  console.log(
    JSON.stringify({
      gui: true,
      type: 'http',
      port
    })
  );
});

const wss = new WebSocketServer({ server });

let sharedState = {
  elapsedTime: 0,
  isPlaying: false,
  playheadX: 0,
  duration: null, // allow project to supply duration
  speedMultiplier: 1.0,
  startTimestamp: null //  authoritative transport timebase (ms in performance.now() space)
};

// Store canonical rendered width *per project*
let canonicalRenderedWidthByProject = {};
let scoreWidthByProject = {};
let durationByProject = {};


let lastUpdateTime = null;
let lastKnownElapsedTime = 0; // Store last valid elapsed time
let lastJumpTime = 0; // Timestamp for debouncing jumps
const JUMP_DEBOUNCE_INTERVAL = 100; // Debounce interval in milliseconds

// OSC setup
const oscPort = new osc.UDPPort({
  localAddress: oscConfig.localAddress,
  localPort: oscConfig.localPort,
  remoteAddress: oscConfig.remoteAddress,
  remotePort: oscConfig.remotePort,
});

console.log(`OSC server is running with the following configuration:`);
console.log(oscConfig);

oscPort.open();

oscPort.on("ready", () => {
  console.log("OSC port is ready and listening for connections.");
  console.log(JSON.stringify({
    gui: true,
    type: "osc",
    localPort: oscPort.options.localPort,
    remotePort: oscPort.options.remotePort
  }));
});

const sendOscMessage = () => {
  const minutes = Math.floor(sharedState.elapsedTime / 60000);
  const seconds = Math.floor((sharedState.elapsedTime % 60000) / 1000);
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  oscPort.send({
    address: "/stopwatch",
    args: [formattedTime],
  });
};

const speedMultiplier = 1; // Default multiplier

const updateElapsedTime = () => {
  // if (!Number.isFinite(sharedState.duration) || sharedState.duration <= 0) return;
  if (!sharedState.isPlaying || sharedState.startTimestamp == null) return;

  const now = performance.now();
  const wallSeconds = Math.max(0, (now - sharedState.startTimestamp) / 1000);

  // Apply speed, clamp to duration
  const newElapsed = Math.min(wallSeconds * (sharedState.speedMultiplier || 1), sharedState.duration / 1000);
  const previous = sharedState.elapsedTime;

  sharedState.elapsedTime = newElapsed * 1000;

  // Keep playheadX in sync for legacy consumers
  if (sharedState.scoreWidth > 0) {
    sharedState.playheadX = (sharedState.elapsedTime / sharedState.duration) * sharedState.scoreWidth;
  }

  // Optional: emit OSC time every tick
  sendOscMessage();
};


function retargetStartTimestampFromElapsed(now, elapsedMs, speedMul) {
  const m = (Number.isFinite(speedMul) && speedMul > 0) ? speedMul : 1;
  const e = (Number.isFinite(elapsedMs) && elapsedMs >= 0) ? elapsedMs : 0;
  return now - (e / m);
}




// ✅ Store connected clients and their names
let connectedClients = {}; // { socketId: "ClientName" }

const broadcastState = () => {
  /**
 * Broadcasts authoritative playback state to all clients.
 * Includes the canonicalRenderedWidth so clients compute the same scale,
 * ensuring identical visual scroll speed across different screen sizes.
 */
  sharedState.scoreWidth = Number.isFinite(sharedState.scoreWidth) && sharedState.scoreWidth > 0 ? sharedState.scoreWidth : 40960;
  sharedState.elapsedTime = Number.isFinite(sharedState.elapsedTime) && sharedState.elapsedTime >= 0 ? sharedState.elapsedTime : 0;
  sharedState.playheadX = Number.isFinite(sharedState.playheadX) && sharedState.playheadX >= 0 ? sharedState.playheadX : 0;

  // --- Throttle sync logs to once per second ---
  if (!global._syncLogCounter) global._syncLogCounter = 0;
  global._syncLogCounter++;

  if (global._syncLogCounter % 16 === 0) {
    console.log(`[SYNC] t=${sharedState.elapsedTime} x=${sharedState.playheadX} speed=${sharedState.speedMultiplier}`);
  }

  // =====================================================
  // SERVER-OWNED COUNTDOWN TIMER
  // Calculate remaining time on server, clients just display it
  // =====================================================
  let countdownSync = null;
  
  if (sharedState.countdown && sharedState.countdown.running) {
    const cd = sharedState.countdown;
    const elapsed = Date.now() - cd.startTime;
    const remainingMs = Math.max(0, (cd.totalSeconds * 1000) - elapsed);
    const remainingSec = Math.ceil(remainingMs / 1000);
    
    countdownSync = {
      running: true,
      cueName: cd.cueName,
      sequenceName: cd.sequenceName,
      remainingSec: remainingSec,
      cueIndex: cd.cueIndex,
      totalCues: cd.totalCues,
      loop: cd.loop,
      currentLoop: cd.currentLoop
    };
    
    // Check if countdown finished
    if (remainingMs <= 0) {
      console.log(`[Countdown] Cue finished: ${cd.cueName}`);
      
      // Advance to next cue or handle loop/chain
      advanceCountdown();
    }
  }

  const message = JSON.stringify({
    type: 'sync',
    state: {
      elapsedTime: sharedState.elapsedTime,
      isPlaying: sharedState.isPlaying,
      scoreWidth: sharedState.scoreWidth,
      playheadX: sharedState.playheadX,
      speedMultiplier: sharedState.speedMultiplier,
      startTimestamp: sharedState.startTimestamp,
      canonicalRenderedWidth: sharedState.canonicalRenderedWidth || null,
      duration: sharedState.duration,
      countdown: countdownSync,  // Server-calculated countdown state
      countdownSequences: sharedState.countdownSequences || null
    },
    serverTime: Date.now()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  const frames = ["·", "•", " ● ", "•"];
  if (!global._hb) global._hb = 0;

  process.stdout.write(`\x1b[32m${frames[global._hb++ % frames.length]}\x1b[0m`);
  process.stdout.write(""); // flush
};

// =====================================================
// SERVER COUNTDOWN MANAGEMENT
// =====================================================

/**
 * Start a countdown on the server
 */
function startServerCountdown(cue, sequenceName, cueIndex, totalCues, loop, currentLoop) {
  sharedState.countdown = {
    running: true,
    cueName: cue.name || "Countdown",
    totalSeconds: cue.seconds || 0,
    startTime: Date.now(),
    sequenceName: sequenceName || null,
    cueIndex: cueIndex || 0,
    totalCues: totalCues || 1,
    loop: loop || 1,
    currentLoop: currentLoop || 1,
    cues: null,  // Will be set if running a sequence
    chainTo: null
  };
  console.log(`[Countdown] ▶ Started: ${cue.name} (${cue.seconds}s)`);
  
  // Immediately broadcast so clients update right away
  broadcastState();
}

/**
 * Start a sequence on the server
 */
function startServerSequence(sequence, loopCount) {
  if (!sequence || !sequence.cues || sequence.cues.length === 0) {
    console.warn(`[Countdown] ⚠️ Cannot start sequence - no cues found`);
    return;
  }
  
  const loops = loopCount !== undefined ? loopCount : (sequence.loop ?? 1);
  
  sharedState.countdown = {
    running: true,
    cueName: sequence.cues[0].name || "Countdown",
    totalSeconds: sequence.cues[0].seconds || 0,
    startTime: Date.now(),
    sequenceName: sequence.name || null,
    cueIndex: 0,
    totalCues: sequence.cues.length,
    loop: loops === 0 ? Infinity : loops,
    currentLoop: 1,
    cues: sequence.cues,
    chainTo: sequence.chain
  };
  console.log(`[Countdown] ▶ Sequence started: ${sequence.name} (${sequence.cues.length} cues, loop: ${loops})`);
  
  // Immediately broadcast so clients update right away
  broadcastState();
}

/**
 * Advance to next cue in sequence, handle loops and chains
 */
function advanceCountdown() {
  const cd = sharedState.countdown;
  if (!cd || !cd.running) return;
  
  // Single cue (not a sequence)
  if (!cd.cues) {
    stopServerCountdown();
    return;
  }
  
  // Move to next cue
  cd.cueIndex++;
  
  // Check if sequence complete
  if (cd.cueIndex >= cd.cues.length) {
    cd.currentLoop++;
    
    // Check if we should loop
    if (cd.loop === Infinity || cd.currentLoop <= cd.loop) {
      // Loop: restart from beginning
      cd.cueIndex = 0;
      const cue = cd.cues[0];
      cd.cueName = cue.name || "Countdown";
      cd.totalSeconds = cue.seconds || 0;
      cd.startTime = Date.now();
      console.log(`[Countdown] Loop ${cd.currentLoop}${cd.loop === Infinity ? ' (∞)' : ' of ' + cd.loop}`);
      return;
    }
    
    // Check if we should chain to another sequence
    if (cd.chainTo !== null && cd.chainTo !== undefined) {
      const sequences = sharedState.countdownSequences || [];
      const nextSeq = sequences[cd.chainTo];
      if (nextSeq) {
        console.log(`[Countdown] Chaining to: ${nextSeq.name}`);
        startServerSequence(nextSeq);
        return;
      }
    }
    
    // Done
    stopServerCountdown();
    return;
  }
  
  // Continue to next cue
  const cue = cd.cues[cd.cueIndex];
  cd.cueName = cue.name || "Countdown";
  cd.totalSeconds = cue.seconds || 0;
  cd.startTime = Date.now();
  console.log(`[Countdown] Next cue: ${cue.name} (${cue.seconds}s)`);
}

/**
 * Stop the countdown
 */
function stopServerCountdown() {
  if (sharedState.countdown) {
    console.log(`[Countdown] ⏹ Stopped`);
  }
  sharedState.countdown = null;
  
  // Immediately broadcast so clients clear their displays
  broadcastState();
}









///////////////////////////////////////////////////////////////////////////

const activeClients = new Set(); // Track active WebSocket connections
const clientNames = new Map(); // Stores unique names for each WebSocket connection

const generateRandomName = () => {
  const names = [
    "Mercator", "Ortelius", "Blaeu", "Buondelmonti"];
  return names[Math.floor(Math.random() * names.length)] + "_" + Math.floor(Math.random() * 1000);
};

const broadcastClientList = () => {
  const clientList = [...clientNames.values()]; // Get all client names
  const message = JSON.stringify({ type: "client_list", clients: clientList });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};




// -----------------------------------------------------------
//  Shared Annotations (session-scoped)
// -----------------------------------------------------------
// project → Map(annotationId → annotationObject)

const annotationsByProject = {};

function broadcastToOthers(ws, payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

////////////////////////////////
let cuePauseAcks = new Set(); // ✅ Moved to global scope so it persists for all clients

let repeatStateMap = {}; // cueId → { currentCount, count, active, ... }

// Declare a set to track triggered cues
let triggeredCues = new Set();

wss.on('connection', (ws, req) => {
  const clientName = generateRandomName();
  clientNames.set(ws, clientName);
  activeClients.add(ws);
  console.log(`[DEBUG] New WebSocket connection: ${clientName}`);

  //  Send welcome message to client so they know their name
  ws.send(JSON.stringify({ type: 'welcome', name: clientName }));

  broadcastClientList();

  // Instead of resetting, send the current state to the new client
  // ws.send(JSON.stringify({ type: "welcome", name: clientName }));
  // Sync the new client with existing state
  ws.send(JSON.stringify({ type: 'sync', state: sharedState }));

  // Send full repeat state to newly connected client
  ws.send(JSON.stringify({
    type: 'repeat_state_map',
    repeatStateMap
  }));

  ///////////////////////////////////////////////

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.error("[ERROR] Failed to parse WebSocket message:", err.message);
      return;
    }

    switch (data.type) {
      case "cueStop":
        console.log(`[DEBUG] Broadcasting cue_stop from client.`);

        // Use client-provided state
        sharedState.isPlaying = false;
        sharedState.elapsedTime = !isNaN(data.elapsedTime) ? data.elapsedTime : sharedState.elapsedTime;
        sharedState.playheadX = !isNaN(data.playheadX) ? data.playheadX : sharedState.playheadX;
        lastUpdateTime = null;

        const stopMessage = JSON.stringify({
          type: "cueStop",
          elapsedTime: sharedState.elapsedTime,
          playheadX: sharedState.playheadX,
          id: data.id || "cueStop"
        });

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(stopMessage);
          }
        });

        broadcastState();
        break;


      case "osc_rotate": {
        let { uid, deg, rad, norm, addr } = data;

        // Coerce degree safely
        let d = Number(deg);
        if (!Number.isFinite(d)) d = 0;

        // Fallback address when none supplied
        const address = addr
          ? `/oscilla/${addr.replace(/^\//, "")}`
          : `/oscilla/rotate/${uid}`;

        console.log(
          `[OSC] 🔁 ROTATE ${uid}  → ${address}  deg=${d.toFixed(2)}  rad=${(rad ?? 0).toFixed?.(4) ?? "0"}  norm=${(norm ?? 0).toFixed?.(4) ?? "0"}`
        );

        oscPort.send({
          address,
          args: [
            { type: "f", value: d },          // degrees
            { type: "f", value: Number(rad) || 0 },   // radians
            { type: "f", value: Number(norm) || 0 }   // 0–1 normalized
          ]
        });

        break;
      }


      // -----------------------------------------------------------
      // 🎚️ OSC Fade updates from client
      // -----------------------------------------------------------
      case "osc_fade": {
        let { uid, value } = data;
        if (!uid) uid = "unknown";
        uid = String(uid).replace(/[^a-zA-Z0-9_\-]/g, "");

        console.log(`[OSC] 🎚 FADER ${uid}: value=${Number(value).toFixed(3)}`);

        oscPort.send({
          address: `/oscilla/fade/${uid}`,
          args: [{ type: "f", value: Number(value) }],
        });
        break;
      }



      case "osc_scale": {
        let { uid, sx, sy, addr } = data;

        let scaleX = parseFloat(sx);
        let scaleY = parseFloat(sy);

        if (isNaN(scaleX)) scaleX = 1;
        if (isNaN(scaleY)) scaleY = 1;

        // choose address
        const address = addr
          ? `/oscilla/${addr.replace(/^\//, "")}`
          : `/oscilla/scale/${uid}`;

        console.log(
          `[OSC] 📏 SCALE  ${uid}  →  ${address}   X=${scaleX.toFixed(3)}  Y=${scaleY.toFixed(3)}`
        );

        oscPort.send({
          address,
          args: [
            { type: "f", value: scaleX },
            { type: "f", value: scaleY }
          ]
        });

        break;
      }

      // -----------------------------------------------------------
      // 🔊 OSC Audio Pool trigger
      // -----------------------------------------------------------
      case "osc_audio_pool": {
        const { filename, amp, fadeIn, fadeOut, pan, pitch, addr } = data;

        const address = addr
          ? `/oscilla/${addr.replace(/^\//, "")}`
          : `/oscilla/audio/pool`;

        const ampVal = parseFloat(amp) || 1;
        const panVal = parseFloat(pan) || 0;
        const pitchVal = parseFloat(pitch) || 1;
        const fadeInVal = parseFloat(fadeIn) || 0;
        const fadeOutVal = parseFloat(fadeOut) || 0;

        console.log(
          `[OSC] 🔊 POOL → ${address}  file=${filename}  amp=${ampVal.toFixed(2)}  pan=${panVal.toFixed(2)}  pitch=${pitchVal.toFixed(2)}`
        );

        // Args: filename, amp, pan, pitch, fadeIn, fadeOut
        oscPort.send({
          address,
          args: [
            { type: "s", value: filename || "unknown" },
            { type: "f", value: ampVal },
            { type: "f", value: panVal },
            { type: "f", value: pitchVal },
            { type: "f", value: fadeInVal },
            { type: "f", value: fadeOutVal }
          ]
        });

        break;
      }


      // -----------------------------------------------------------
      // 🌧 OSC Audio Impulse hit
      // -----------------------------------------------------------
      case "osc_audio_impulse": {
        const { filename, amp, fadeIn, fadeOut, pan, pitch, addr } = data;

        const address = addr
          ? `/oscilla/${addr.replace(/^\//, "")}`
          : `/oscilla/audio/impulse`;

        const ampVal = parseFloat(amp) || 1;
        const panVal = parseFloat(pan) || 0;
        const pitchVal = parseFloat(pitch) || 1;
        const fadeInVal = parseFloat(fadeIn) || 0;
        const fadeOutVal = parseFloat(fadeOut) || 0;

        console.log(
          `[OSC] 🌧 IMPULSE → ${address}  file=${filename}  amp=${ampVal.toFixed(2)}  pan=${panVal.toFixed(2)}  pitch=${pitchVal.toFixed(2)}`
        );

        // Args: filename, amp, pan, pitch, fadeIn, fadeOut
        oscPort.send({
          address,
          args: [
            { type: "s", value: filename || "unknown" },
            { type: "f", value: ampVal },
            { type: "f", value: panVal },
            { type: "f", value: pitchVal },
            { type: "f", value: fadeInVal },
            { type: "f", value: fadeOutVal }
          ]
        });

        break;
      }


      // -----------------------------------------------------------
      // 🎧 OSC Audio Trigger (generic cueAudio)
      // -----------------------------------------------------------
      case "osc_audio_trigger": {
        const { filename, volume, loop, addr } = data;

        const address = addr
          ? `/oscilla/${addr.replace(/^\//, "")}`
          : `/oscilla/audio/trigger`;

        const vol = parseFloat(volume) || 1;
        const loopCount = parseInt(loop) || 1;

        console.log(
          `[OSC] 🎧 TRIGGER → ${address}  file=${filename}  vol=${vol.toFixed(2)}  loop=${loopCount}`
        );

        oscPort.send({
          address,
          args: [
            { type: "s", value: filename || "unknown" },
            { type: "f", value: vol },
            { type: "i", value: loopCount }
          ]
        });

        break;
      }


      // -----------------------------------------------------------
      // 🛑 OSC Audio Stop
      // -----------------------------------------------------------
      case "osc_audio_stop": {
        const { filename, fadeOutMs, addr } = data;

        const address = addr
          ? `/oscilla/${addr.replace(/^\//, "")}`
          : `/oscilla/audio/stop`;

        const fadeMs = parseFloat(fadeOutMs) || 0;

        console.log(
          `[OSC] 🛑 STOP → ${address}  file=${filename || "all"}  fadeOut=${fadeMs}ms`
        );

        oscPort.send({
          address,
          args: [
            { type: "s", value: filename || "all" },
            { type: "f", value: fadeMs / 1000 }  // Convert to seconds
          ]
        });

        break;
      }


        // -----------------------------------------------------------
        // 🎛 Generic OSC value sender (from osc() cue)
        // -----------------------------------------------------------

        // ------------------------------------
        // Helper: resolve typed pitch
        // ------------------------------------
        function resolvePitch(pitch) {
          if (!pitch) return null;

          const { type, value } = pitch;

          if (type === "hz") {
            return {
              hz: value,
              midi: 69 + 12 * Math.log2(value / 440),
              raw: value
            };
          }

          if (type === "midi") {
            const hz = 440 * Math.pow(2, (value - 69) / 12);
            return {
              hz,
              midi: value,
              raw: value
            };
          }

          if (type === "raw") {
            return {
              hz: null,
              midi: null,
              raw: value
            };
          }

          return null;
        }
      // -----------------------------------------------------------
      // OSC message router
      // -----------------------------------------------------------
      case "osc_value": {
        const { addr, values, static: staticParams, args, uid } = data;

        if (!addr) {
          console.warn("[OSC]  osc_value missing addr:", data);
          break;
        }

        const oscAddress = `/oscilla/${String(addr)}`;

        // =========================================================
        // 1️⃣ NEW POSITIONAL FORMAT
        // =========================================================
        //
        // Browser sends:
        // {
        //   type:"osc_value",
        //   addr:"pontalist",
        //   args:[ pitchType, pitchA, pitchB, size, env, density ]
        // }
        //
        // =========================================================
        if (Array.isArray(args)) {
          console.log(
            `[OSC] 🎹 VALUE (positional) ${oscAddress}`,
            args.join(" ")
          );

          oscPort.send({
            address: oscAddress,
            args: args.map(v => ({
              type: Number.isInteger(v) ? "i" : "f",
              value: v
            }))
          });

          break;   //  IMPORTANT — do not continue into legacy path
        }

        // =========================================================
        // 2️⃣ LEGACY KEY / VALUE FORMAT
        // =========================================================
        //
        // Browser sends (old):
        // {
        //   type:"osc_value",
        //   addr:"pontalist",
        //   values:{ env:0.3, density:0.2 },
        //   static:{ pitch:{...} }
        // }
        //
        // =========================================================
        if (typeof values !== "object") {
          console.warn("[OSC] ⚠️ Invalid legacy osc_value payload:", data);
          break;
        }

        const oscArgs = [];
        const logParts = [];

        // --------------------------
        // control pitch (pitch:y)
        // --------------------------
        let pitchCtrl = null;

        if (typeof values.pitch === "number" && isFinite(values.pitch)) {
          pitchCtrl = values.pitch;
          delete values.pitch;
        }

        // --------------------------
        // continuous visual values
        // --------------------------
        for (const [key, num] of Object.entries(values)) {
          if (typeof num !== "number" || !isFinite(num)) continue;

          oscArgs.push({ type: "s", value: key });
          oscArgs.push({ type: "f", value: num });

          logParts.push(`${key}=${num.toFixed(3)}`);
        }

        // --------------------------
        // control pitch
        // --------------------------
        if (pitchCtrl != null) {
          oscArgs.push({ type: "s", value: "pitchCtrl" });
          oscArgs.push({ type: "f", value: pitchCtrl });

          logParts.push(`pitchCtrl=${pitchCtrl.toFixed(3)}`);
        }

        // --------------------------
        // semantic pitch
        // --------------------------
        if (staticParams?.pitch?.type === "hz") {
          oscArgs.push({ type: "s", value: "pitchHz" });
          oscArgs.push({ type: "f", value: staticParams.pitch.value });

          logParts.push(`pitchHz=${staticParams.pitch.value.toFixed(3)}`);
        }

        if (staticParams?.pitch?.type === "midi") {
          oscArgs.push({ type: "s", value: "pitchMidi" });
          oscArgs.push({ type: "f", value: staticParams.pitch.value });

          logParts.push(`pitchMidi=${staticParams.pitch.value.toFixed(3)}`);
        }

        if (staticParams?.pitch?.type === "deg") {
          const { degree, octave } = staticParams.pitch;

          if (Number.isFinite(degree) && Number.isFinite(octave)) {
            oscArgs.push({ type: "s", value: "pitchDeg" });
            oscArgs.push({ type: "f", value: degree });

            oscArgs.push({ type: "s", value: "pitchOct" });
            oscArgs.push({ type: "f", value: octave });

            logParts.push(`pitchDeg=${degree}`);
            logParts.push(`pitchOct=${octave}`);
          }
        }

        // --------------------------
        // optional UID
        // --------------------------
        if (uid) {
          oscArgs.push({ type: "s", value: "uid" });
          oscArgs.push({ type: "s", value: String(uid) });

          logParts.push(`uid=${uid}`);
        }

        console.log(
          `[OSC] 🎹 VALUE (legacy) ${oscAddress}`,
          logParts.join(" ")
        );

        oscPort.send({
          address: oscAddress,
          args: oscArgs
        });

        break;
      }



      case "osc_control": {
        const { addr, value, t } = data;

        if (!addr) {
          console.warn("[OSC] ⚠️ Missing addr in osc_control message.");
          break;
        }

        const v = parseFloat(value);
        const tt = parseFloat(t);

        const nv = Number.isFinite(v) ? v : 0;
        const nt = Number.isFinite(tt) ? tt : 0;

        // Build OSC path: /oscilla/control/<addr>...
        const oscAddress = `/oscilla/control${addr.startsWith("/") ? "" : "/"}${addr}`;

        console.log(
          `[OSC] 🎛 control → ${oscAddress}  v=${nv.toFixed(3)} t=${nt.toFixed(3)}`
        );

        oscPort.send({
          address: oscAddress,
          args: [
            // value + t only — clean signal
            { type: "f", value: nv },
            { type: "f", value: nt }
          ]
        });

        break;
      }



      case "osc_obj2path": {
        const { uid, x, y, angle } = data;

        if (!uid) {
          console.warn("[OSC] ⚠️ Missing uid in osc_obj2path message.");
          break;
        }

        const nx = parseFloat(x) || 0;
        const ny = parseFloat(y) || 0;
        const na = parseFloat(angle) || 0;

        console.log(
          `[OSC] 🛰 obj2path ${uid}: x=${nx.toFixed(3)} y=${ny.toFixed(3)} a=${na.toFixed(1)}`
        );

        oscPort.send({
          address: `/oscilla/o2p/${uid}`,
          args: [
            { type: "f", value: nx },
            { type: "f", value: ny },
            { type: "f", value: na }
          ]
        });

        break;
      }




      case "set_speed_multiplier": {
        const newMul = Number(data.multiplier);
        if (!(newMul > 0)) break; // ignore invalid input

        const oldMul = sharedState.speedMultiplier || 1;

        // If multiplier actually changed
        if (newMul !== oldMul) {

          // If playback is running under a clock anchor
          if (sharedState.isPlaying && sharedState.startTimestamp != null) {

            const now = performance.now();

            // Compute current elapsed under old multiplier
            const wallSeconds = (now - sharedState.startTimestamp) / 1000;
            const currentElapsedMs = Math.min(
              wallSeconds * oldMul * 1000,
              sharedState.duration
            );

            // ✅ Retarget startTimestamp so phase continuity is preserved
            sharedState.startTimestamp = now - (currentElapsedMs / newMul);

            // Keep legacy fields aligned
            sharedState.elapsedTime = currentElapsedMs;
            if (sharedState.scoreWidth > 0) {
              sharedState.playheadX =
                (sharedState.elapsedTime / sharedState.duration) *
                sharedState.scoreWidth;
            }
          }

          // Update shared multiplier
          sharedState.speedMultiplier = parseFloat(newMul.toFixed(3));
        }

        // Broadcast once (don't loop-broadcast!)
        broadcastState();
        break;
      }


      /**
       * 🔁 Handles incoming repeat cycle updates from clients.
       * - Each message contains a cueId and repeatData (currentCount, active, etc.)
       * - Server stores the state in `repeatStateMap`
       * - Then broadcasts the update to all connected clients
       *
       * This ensures that all clients stay in sync about the repeat status.
       */

      case "repeat_update":
        if (!data.cueId || typeof data.repeatData !== "object") {
          console.warn("[SERVER] Invalid repeat_update received.");
          break;
        }

        repeatStateMap[data.cueId] = data.repeatData;

        const repeatUpdateMessage = JSON.stringify({
          type: "repeat_update",
          cueId: data.cueId,
          repeatData: data.repeatData
        });

        // ✅ Only send to *other* clients — NOT the one that triggered it
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client !== ws) {
            client.send(repeatUpdateMessage);
          }
        });

        console.log(`[SERVER] 🔁 Broadcasted repeat state update for ${data.cueId}`);
        break;


      case "get_repeat_state":
        ws.send(JSON.stringify({
          type: "repeat_state_map",
          repeatStateMap
        }));
        console.log("[SERVER] 📡 Sent full repeat state map to reconnecting client.");
        break;


      case "update_client_name":
        if (typeof data.name === "string" && data.name.trim() !== "") {
          const oldName = clientNames.get(ws);
          const newName = data.name.trim();

          // ✅ Prevent duplicate names
          if (![...clientNames.values()].includes(newName) || oldName === newName) {
            console.log(`[SERVER] Client ${oldName} updated their name to ${newName}`);
            clientNames.set(ws, newName);
            broadcastClientList();
          } else {
            console.warn("[SERVER] Name already taken, ignoring update.");
          }
        } else {
          console.warn("[SERVER] Invalid name update request.");
        }
        break;




      case "annotation_list_request": {
        const { project } = data;
        if (!project) {
          console.warn("[ANNOTATION] Invalid annotation_list_request payload");
          break;
        }

        const items =
          annotationsByProject[project]
            ? Object.values(annotationsByProject[project])
            : [];

        // Only log if there are items to report
        if (items.length > 0) {
          console.log(`[ANNOTATION] 📤 list request  project=${project}  count=${items.length}`);
        }

        // reply ONLY to requesting client
        ws.send(JSON.stringify({
          type: "annotation_list_response",
          project,
          items
        }));

        break;
      }


      case "annotation_add": {
        const { project, item } = data;
        if (!project || !item?.id) {
          console.warn("[ANNOTATION] Invalid annotation_add payload");
          break;
        }

        annotationsByProject[project] ??= {};
        annotationsByProject[project][item.id] = item;

        console.log(
          `[ANNOTATION] ➕ add  project=${project}  id=${item.id}`
        );

        broadcastToOthers(ws, {
          type: "annotation_add",
          project,
          item
        });

        break;
      }

      case "annotation_update": {
        const { project, item } = data;
        if (!project || !item?.id) {
          console.warn("[ANNOTATION] Invalid annotation_update payload");
          break;
        }

        annotationsByProject[project] ??= {};
        annotationsByProject[project][item.id] = item;

        console.log(
          `[ANNOTATION] ✏️ update  project=${project}  id=${item.id}`
        );

        broadcastToOthers(ws, {
          type: "annotation_update",
          project,
          item
        });

        break;
      }

      case "annotation_delete": {
        const { project, id } = data;
        if (!project || !id) {
          console.warn("[ANNOTATION] Invalid annotation_delete payload");
          break;
        }

        if (annotationsByProject[project]) {
          delete annotationsByProject[project][id];
        }

        console.log(
          `[ANNOTATION] 🗑 delete  project=${project}  id=${id}`
        );

        broadcastToOthers(ws, {
          type: "annotation_delete",
          project,
          id
        });

        break;
      }




      /**
      * ✅ Handles manual pause requests from a client.
      * - Updates `isPlaying` state to false and stops playback tracking.
      * - Broadcasts the pause state to all clients to keep them in sync.
      * - Ensures `playheadX` remains accurate.
      */
      case "pause": {
        sharedState.isPlaying = false;

        if (sharedState.startTimestamp != null) {
          // Compute precise elapsed time at the moment of pausing
          const now = performance.now();
          const wallSeconds = (now - sharedState.startTimestamp) / 1000;
          const exactElapsedMs = Math.min(
            wallSeconds * (sharedState.speedMultiplier || 1) * 1000,
            sharedState.duration
          );

          // Store frozen position
          sharedState.elapsedTime = exactElapsedMs;
        }

        // Remove timebase anchor (no drift while paused)
        sharedState.startTimestamp = null;

        // Keep playheadX in sync for legacy consumers
        if (sharedState.scoreWidth > 0) {
          sharedState.playheadX =
            (sharedState.elapsedTime / sharedState.duration) * sharedState.scoreWidth;
        }

        broadcastState();
        break;
      }

      // =====================================================
      // COUNTDOWN - SERVER OWNED
      // =====================================================
      
      case "countdown_start_cue": {
        // Start a single countdown cue
        const { cue } = data;
        if (cue) {
          startServerCountdown(cue, null, 0, 1, 1, 1);
        }
        break;
      }
      
      case "countdown_start_sequence": {
        // Start a sequence - use sent sequence data if provided, or fall back to stored
        const { sequenceIndex, sequence: sentSequence } = data;
        const sequences = sharedState.countdownSequences || [];
        
        // Prefer the sequence data sent with the message (more reliable)
        // Fall back to stored sequences if not provided
        const seq = sentSequence || sequences[sequenceIndex];
        
        if (seq) {
          console.log(`[Countdown] Starting sequence: ${seq.name || 'unnamed'} (index: ${sequenceIndex})`);
          startServerSequence(seq);
        } else {
          console.warn(`[Countdown] ⚠️ No sequence found at index ${sequenceIndex} and no sequence data sent`);
        }
        break;
      }
      
      case "countdown_stop": {
        stopServerCountdown();
        break;
      }
      
      case "countdown_sequences_update": {
        // Store sequences on server
        sharedState.countdownSequences = data.sequences;
        console.log(`[Countdown] ✅ Sequences updated from client: ${data.sequences?.length || 0} sequences`);
        if (data.sequences?.length > 0) {
          console.log(`[Countdown]    Names: ${data.sequences.map(s => s.name || 'unnamed').join(', ')}`);
        }
        // Broadcast to other clients
        broadcastToOthers(ws, data);
        break;
      }
      
      case "countdown_sequences_request": {
        // Send stored sequences directly to requesting client
        if (sharedState.countdownSequences && sharedState.countdownSequences.length > 0) {
          ws.send(JSON.stringify({
            type: "countdown_sequences_update",
            sequences: sharedState.countdownSequences
          }));
        }
        break;
      }




      /**
      * ✅ Handles confirmation from clients that they have processed a cue pause.
      * - Once all clients acknowledge, the server broadcasts the confirmed pause state.
      */
      case "cue_pause_processed":
        console.log(`[DEBUG] Client confirmed cue_pause was processed at elapsed time ${data.elapsedTime}`);
        cuePauseAcks.add(ws);

        if (cuePauseAcks.size >= activeClients.size) {
          console.log("[DEBUG] All clients confirmed cue_pause processing. Broadcasting pause state.");
          cuePauseAcks.clear();
          broadcastState();
        }
        break;

      /**
      * ✅ Updates the global duration of the score if a valid value is received.
      */
      case "set_duration":
        if (!isNaN(data.duration) && data.duration > 0) {
          sharedState.duration = data.duration;
          console.log(`[DEBUG] Duration updated: ${sharedState.duration}ms`);
          broadcastState();
        } else {
          console.error("[ERROR] Invalid duration received. Ignoring update.");
        }
        break;

      /**
      * ✅ Handles cue triggers from a client and rebroadcasts them to all clients
      except the one that sent them to avoid infinite loops.
      */

      case "cue_triggered":
        console.log(`[SERVER] Cue was triggered on client: ${data.cueId}`);

        const cueMessage = JSON.stringify({
          type: "cue_triggered",
          cueId: data.cueId
        });

        // ✅ Broadcast to all *other* clients, not the sender
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client !== ws) {
            client.send(cueMessage);
          }
        });
        break;


      /**
      * ✅ Handles cue-based pauses, updating the server state and notifying clients.
      */
      case "cue_pause":
        const resolvedDuration = Number.isFinite(data.duration) ? data.duration : 5000; // fallback to 5s if missing

        console.log(`[DEBUG] Broadcasting pause cue: ${data.id}, Duration: ${resolvedDuration}ms`);

        sharedState.isPlaying = false;
        lastUpdateTime = null;
        sharedState.lastPausedTime = sharedState.elapsedTime;

        // ✅ Build the message with full duration
        const cuePauseMessage = JSON.stringify({
          type: "cue_pause",
          id: data.id,
          duration: resolvedDuration,
          elapsedTime: sharedState.elapsedTime,
          playheadX: sharedState.playheadX
        });

        // ✅ Send to all connected clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(cuePauseMessage);
          }
        });

        broadcastState(); // optional: keeps clients fully in sync
        break;


      /**
      * ✅ Handles acknowledgments of cue pauses from clients.
      * - Once all clients confirm, a pause state is rebroadcasted to keep them in sync.
      */
      case "cue_pause_ack":
        console.log(`[DEBUG] Client acknowledged cue_pause at elapsed time ${data.elapsedTime}`);
        cuePauseAcks.add(ws);

        if (cuePauseAcks.size >= activeClients.size) {
          console.log("[DEBUG] All clients acknowledged pause. Confirming pause state.");
          cuePauseAcks.clear();

          const confirmPauseMessage = JSON.stringify({
            type: "pause",
            elapsedTime: sharedState.playheadX,
          });

          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(confirmPauseMessage);
            }
          });

          broadcastState();
        }
        break;

      /**
      * ✅ Handles play requests from clients.
      * - Updates `playheadX` and ensures synchronization across clients.
      */
      case "play": {
        sharedState.scoreWidth = sharedState.scoreWidth || 1;

        const now = performance.now();
        sharedState.startTimestamp = retargetStartTimestampFromElapsed(
          now,
          sharedState.elapsedTime,
          sharedState.speedMultiplier
        );

        sharedState.isPlaying = true;
        broadcastState();
        break;
      }



      /**
      * ✅ Handles dismissing the pause countdown popup across all clients.
      */
      case "dismiss_pause_countdown":
        console.log("[DEBUG] Received dismiss_pause_countdown request. Broadcasting to all clients.");
        const dismissMessage = JSON.stringify({ type: "dismiss_pause_countdown" });

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(dismissMessage);
          }
        });

        console.log("[DEBUG] Broadcasting resume_after_pause to all clients.");
        const resumeMessage = JSON.stringify({
          type: "resume_after_pause",
          playheadX: sharedState.playheadX,
          elapsedTime: sharedState.elapsedTime
        });

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(resumeMessage);
          }
        });

        console.log(`[DEBUG] Resume broadcasted. playheadX=${sharedState.playheadX}, elapsedTime=${sharedState.elapsedTime}`);
        break;


      case "osc":
        /**
        * ✅ Handles incoming `cue_osc` messages from clients.
        * - Prevents duplicate OSC messages by tracking triggered cues.
        * - Sends the cue number as an integer argument to `/cue/trigger`.
        */
        console.log(`[DEBUG] Received OSC WebSocket message:`, data);

        // ✅ Extract cue number from message
        const cueNumber = parseInt(data.data, 10);

        if (isNaN(cueNumber)) {
          console.warn("[WARNING] Received invalid cue number:", data.data);
          break;
        }

        // ✅ Prevent duplicate messages
        if (triggeredCues.has(cueNumber)) {
          console.log(`[INFO] Cue ${cueNumber} has already been sent. Ignoring duplicate.`);
          break;
        }

        // ✅ Mark cue as triggered
        triggeredCues.add(cueNumber);

        // ✅ Send OSC message with integer argument
        oscPort.send({
          address: `/cue/trigger`, // ✅ Static address
          args: [{ type: "i", value: cueNumber }] // ✅ Integer cue number
        });

        console.log(`[DEBUG] Sent OSC cue: /cue/trigger ${cueNumber}`);
        break;


      case "jump": {
        // 1. Validate incoming position
        if (!isNaN(data.playheadX)) {
          sharedState.playheadX = data.playheadX;
        }

        // 2. Update elapsedTime based on world position (or client-sent value)
        if (!isNaN(data.elapsedTime)) {
          sharedState.elapsedTime = data.elapsedTime;
        } else if (sharedState.scoreWidth > 0 && sharedState.duration > 0) {
          sharedState.elapsedTime =
            (sharedState.playheadX / sharedState.scoreWidth) * sharedState.duration;
        }

        // 3. IMPORTANT: Re-anchor transport clock if playback is active
        if (sharedState.isPlaying) {
          const now = performance.now();
          sharedState.startTimestamp = retargetStartTimestampFromElapsed(
            now,
            sharedState.elapsedTime,
            sharedState.speedMultiplier
          );
        }


        console.log(
          `[SERVER] 🎯 Jump received → x=${sharedState.playheadX}, ` +
          `elapsed=${sharedState.elapsedTime}`
        );

        // 4. Broadcast jump to *other* clients (never to sender)
        const jumpMsg = JSON.stringify({
          type: "jump",
          playheadX: sharedState.playheadX,
          elapsedTime: sharedState.elapsedTime
        });

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(jumpMsg);
          }
        });

        break;
      }




      /**
      *  Handles resuming playback after a pause.
      * - Ensures synchronization across clients.
      */
      case "resume_after_pause":
        console.log("[DEBUG] Processing resume_after_pause request.");

        if (isNaN(data.playheadX) || data.playheadX < 0) {
          console.error(`[ERROR] Ignoring invalid playheadX: ${data.playheadX}. Keeping last known value.`);
          break;
        }

        sharedState.playheadX = data.playheadX;

        if (sharedState.scoreWidth > 0) {
          sharedState.elapsedTime = (sharedState.playheadX / sharedState.scoreWidth) * sharedState.duration;
          console.log(`[DEBUG] Recalculated elapsedTime from playheadX: ${sharedState.elapsedTime}`);
        } else {
          console.error(`[ERROR] scoreWidth is zero or undefined. Cannot calculate elapsedTime.`);
          sharedState.elapsedTime = 0;
        }

        sharedState.isPlaying = true;
        lastUpdateTime = Date.now();
        console.log(`[DEBUG] Broadcasting resume_after_pause with playheadX: ${sharedState.playheadX}`);

        const resumeAfterPauseMessage = JSON.stringify({
          type: "resume_after_pause",
          playheadX: sharedState.playheadX,
          elapsedTime: sharedState.elapsedTime
        });

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(resumeAfterPauseMessage);
          }
        });

        updateElapsedTime(); //  Restart elapsed time tracking
        sendOscMessage(); //  Immediately send an OSC stopwatch update

        broadcastState();
        break;


      case "score_meta": {
        const { project, scoreWidth, renderedWidth, duration } = data;

        if (!project) {
          console.warn("[SERVER] score_meta missing project name");
          break;
        }

        // ✅ duration (minutes converted to ms by client)
        if (duration > 0) {
          durationByProject[project] = duration;
          console.log(`[SERVER] ⏱ duration for ${project} = ${duration}ms (updated)`);
        }


        // ✅ Set project-specific scoreWidth if not already stored
        if (!scoreWidthByProject[project] && typeof scoreWidth === "number" && scoreWidth > 0) {
          scoreWidthByProject[project] = scoreWidth;
          console.log(`[SERVER] 📏 scoreWidth set for ${project} = ${scoreWidth}`);
        }

        // ✅ Set project-specific canonicalRenderedWidth if not already stored
        if (!canonicalRenderedWidthByProject[project] && typeof renderedWidth === "number" && renderedWidth > 0) {
          canonicalRenderedWidthByProject[project] = renderedWidth;
          console.log(`[SERVER] 🎯 canonicalRenderedWidth set for ${project} = ${renderedWidth}`);
        }

        //  Update sharedState to reflect current project
        sharedState.scoreWidth = scoreWidthByProject[project];
        sharedState.canonicalRenderedWidth = canonicalRenderedWidthByProject[project];
        sharedState.duration = durationByProject[project];


        broadcastState();
        break;
      }

      case "reset_project_state": {
        const { project } = data;
        if (!project) break;

        console.log(`[SYNC]  Resetting state for project: ${project}`);

        // Clear stored width for this project
        canonicalRenderedWidthByProject[project] = null;
        scoreWidthByProject[project] = null;

        // Also clear sharedState so future syncs don't reuse it
        sharedState.canonicalRenderedWidth = null;
        sharedState.scoreWidth = null;
        sharedState.duration = null;
        break;
      }

      default:
        console.log(`[DEBUG] Unknown message type: ${data.type}`);
        break;
    }
  });

  ///////////////////////////////////////////////

  ws.on('close', (code, reason) => {
    console.log(`[DEBUG] Client disconnected: ${clientNames.get(ws)} (Code: ${code}, Reason: ${reason || "No reason"})`);
    console.log(JSON.stringify({
      gui: true,
      type: "client_disconnected",
      name: clientNames.get(ws),
      ip: ws._socket?.remoteAddress
    }));

    activeClients.delete(ws);
    clientNames.delete(ws);
    broadcastClientList();

    if (code !== 1000) {
      console.log("[DEBUG] Unexpected WebSocket closure. Waiting 3s before attempting reconnect...");

      setTimeout(() => {
        console.log("[DEBUG] Reconnecting WebSocket...");
      }, 3000);
    }
  });

  ws.on('error', (error) => {
    console.error("[ERROR] WebSocket error:", error);
  });

});

const updateLoop = () => {
  const countdownRunning = sharedState.countdown && sharedState.countdown.running;
  
  if (sharedState.isPlaying) {
    updateElapsedTime();
    broadcastState();
  } else if (countdownRunning) {
    // Countdown can run independently of playback
    // Still need to broadcast state so clients can update their displays
    broadcastState();
  } else {
    //  console.log("[DEBUG] Skipping updates; playback is paused and no countdown running.");
  }
  setTimeout(updateLoop, 250);
};

updateLoop();