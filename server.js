#!/bin/node

const { performance } = require('node:perf_hooks');

// ---------------------------------------------
// Command-Line & Environment Configuration Layer
// ---------------------------------------------

// Load yargs to parse command-line arguments
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse CLI arguments (e.g. --port=8010 --osc-in=57123)
const argv = yargs(hideBin(process.argv)).argv;

// ---------------------------------------------
// Module Imports
// ---------------------------------------------

const WebSocket = require('ws');
const express = require('express');
const osc = require('osc');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------
// Express App Setup
// ---------------------------------------------

const app = express();

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

// --- Static file serving ---
app.use(express.static('public')); // root public assets
app.use('/scores', express.static(path.join(process.cwd(), 'public/scores')));
app.use('/shared', express.static(path.join(process.cwd(), 'public/shared')));

// --- Simple HTML directory lister ---
function listDirectory(dirPath, webPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const links = entries.map(e => {
    const name = e.name + (e.isDirectory() ? '/' : '');
    return `<a href="${webPath}${name}">${name}</a><br>`;
  });
  return `<html><body>${links.join('')}</body></html>`;
}

// --- Directory listing for /scores/... ---
app.get('/scores/*', (req, res, next) => {
  const subPath = req.params[0] || '';
  const dir = path.join(process.cwd(), 'public/scores', subPath);
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      res.type('html').send(listDirectory(dir, req.path.endsWith('/') ? req.path : req.path + '/'));
    } else next();
  } catch (err) {
    next();
  }
});
// --- Directory listing for /shared/... (outside public) ---
app.get('/shared/*', (req, res, next) => {
  const subPath = req.params[0] || '';
  const dir = path.join(process.cwd(), 'public/shared', subPath);
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      res.type('html').send(listDirectory(dir, req.path.endsWith('/') ? req.path : req.path + '/'));
    } else next();
  } catch (err) {
    next();
  }
});

// --- Directory listing for /docs/... ---
app.get('/docs/*', (req, res, next) => {
  const subPath = req.params[0] || '';
  const dir = path.join(process.cwd(), 'public/docs/md_docs', subPath);
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      res
        .type('html')
        .send(listDirectory(dir, req.path.endsWith('/') ? req.path : req.path + '/'));
    } else next();
  } catch (err) {
    next();
  }
});

// --- Serve static files in /docs (Markdown etc.) ---
app.use('/docs', express.static(path.join(process.cwd(), 'public/docs/md_docs')));

// app.use(express.static('dist'));


app.post("/save-preferences/:project", express.json(), (req, res) => {
  const project = req.params.project;
  const prefs = req.body;

  const file = path.join(__dirname, "public", "scores", project, "preferences.json");

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

const wss = new WebSocket.Server({ server });

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
let lastKnownElapsedTime = 0; // ✅ Store last valid elapsed time
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



  const message = JSON.stringify({
    type: 'sync',
    state: {
      elapsedTime: sharedState.elapsedTime, // legacy (clients should prefer startTimestamp)
      isPlaying: sharedState.isPlaying,
      scoreWidth: sharedState.scoreWidth,
      playheadX: sharedState.playheadX,     // legacy
      speedMultiplier: sharedState.speedMultiplier,
      startTimestamp: sharedState.startTimestamp, // 
      canonicalRenderedWidth: sharedState.canonicalRenderedWidth || null,
      duration: sharedState.duration   // 
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

////////////////////////////////
let cuePauseAcks = new Set(); // ✅ Moved to global scope so it persists for all clients

let repeatStateMap = {}; // cueId → { currentCount, count, active, ... }

// ✅ Declare a set to track triggered cues
let triggeredCues = new Set();

wss.on('connection', (ws, req) => {
  const clientName = generateRandomName();
  clientNames.set(ws, clientName);
  activeClients.add(ws);
  console.log(`[DEBUG] New WebSocket connection: ${clientName}`);

  // ✅ Send welcome message to client so they know their name
  ws.send(JSON.stringify({ type: 'welcome', name: clientName }));

  broadcastClientList();

  // ✅ Instead of resetting, send the current state to the new client
  // ws.send(JSON.stringify({ type: "welcome", name: clientName }));
  // ✅ Sync the new client with existing state
  ws.send(JSON.stringify({ type: 'sync', state: sharedState }));

  // 🔁 Send full repeat state to newly connected client
  ws.send(JSON.stringify({
    type: 'repeat_state_map',
    repeatStateMap
  }));

  ///////////////////////////////////////////////

  ws.on('message', (message) => {
    console.log("[DEBUG] Received WebSocket message:", message);
    const data = JSON.parse(message);

    switch (data.type) {
      case "cueStop":
        console.log(`[DEBUG] Broadcasting cue_stop from client.`);

        // ✅ Use client-provided state
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
        const { uid, angle, radians, norm } = data;
        console.log(`[OSC] 🔁 ROTATE ${uid}: ${angle.toFixed(1)}°`);
        oscPort.send({
          address: `/oscilla/rotate/${uid}`,
          args: [
            { type: "f", value: angle },
            { type: "f", value: radians },
            { type: "f", value: norm },
          ],
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
        let { uid, scaleX, scaleY } = data;

        // Coerce to numeric
        scaleX = parseFloat(scaleX);
        scaleY = parseFloat(scaleY);

        // Fallbacks to avoid crash
        if (isNaN(scaleX)) scaleX = 1;
        if (isNaN(scaleY)) scaleY = 1;

        console.log(`[OSC] 📏 SCALE ${uid}: X=${scaleX.toFixed(3)} Y=${scaleY.toFixed(3)}`);

        oscPort.send({
          address: `/oscilla/scale/${uid}`,
          args: [
            { type: "f", value: scaleX },
            { type: "f", value: scaleY },
          ],
        });
        break;
      }

      case "osc_obj2path": {
        const { pathId, x, y, angle } = data;

        if (!pathId) {
          console.warn("[OSC] ⚠️ Missing pathId in osc_obj2path message.");
          break;
        }

        // Coerce to numeric values
        const nx = parseFloat(x) || 0;
        const ny = parseFloat(y) || 0;
        const na = parseFloat(angle) || 0;

        console.log(`[OSC] 🛰 obj2path ${pathId}: x=${nx.toFixed(3)} y=${ny.toFixed(3)} a=${na.toFixed(1)}`);

        oscPort.send({
          address: `/oscilla/obj2path/${pathId}`,
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
        // Ensure scoreWidth & duration defaults are set
        sharedState.scoreWidth = sharedState.scoreWidth || 1;

        // If we are resuming playback:
        // sharedState.elapsedTime is already the last known position (in ms),
        // so we compute a timebase origin anchored to *right now*:
        sharedState.startTimestamp = performance.now() - sharedState.elapsedTime;

        sharedState.isPlaying = true;

        // Broadcast the new authoritative transport state
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
          return;
        }

        // ✅ Prevent duplicate messages
        if (triggeredCues.has(cueNumber)) {
          console.log(`[INFO] Cue ${cueNumber} has already been sent. Ignoring duplicate.`);
          return;
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
    sharedState.startTimestamp = performance.now() - sharedState.elapsedTime;
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
          return;
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
          console.warn("[SERVER] ⚠️ score_meta missing project name");
          break;
        }

        // ✅ duration (minutes converted to ms by client)
        if (!durationByProject[project] && duration > 0) {
          durationByProject[project] = duration;
          console.log(`[SERVER] ⏱ duration for ${project} = ${duration}ms`);
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
  if (sharedState.isPlaying) {
    updateElapsedTime();
    broadcastState();
  } else {
    //  console.log("[DEBUG] Skipping updates; playback is paused.");
  }
  setTimeout(updateLoop, 250);
};

updateLoop();
