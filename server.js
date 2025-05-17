#!/bin/node

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


app.use(express.static('public'));

// serve the docs ////////////////////////
const path = require('path');
app.use('/docs', express.static(path.join(__dirname, 'docs')));

const server = app.listen(port, () => {
  console.log(`HTTP server is running on http://localhost:${port}`);
  console.log(JSON.stringify({
    gui: true,
    type: "http",
    port
  }));
});

const wss = new WebSocket.Server({ server });

let sharedState = {
  elapsedTime: 0,
  isPlaying: false,
  playheadX: 0, // ✅ Ensure playheadX is always included
  duration: 20 * 60 * 1000, // ✅ Duration will be set dynamically in popup but this is the default fallback
  speedMultiplier: 1.0, // ✅ Add speed multiplier to shared state

};

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
  if (sharedState.isPlaying && lastUpdateTime !== null) {
    const now = Date.now();
    const delta = now - lastUpdateTime;

    console.log(`[DEBUG] ⏳ updateElapsedTime() called. Time delta: ${delta}ms`);

    // Ensure a valid speedMultiplier
    sharedState.speedMultiplier = Number.isFinite(sharedState.speedMultiplier) && sharedState.speedMultiplier > 0
      ? sharedState.speedMultiplier
      : 1;

    // Apply elapsed time update
    const previousElapsedTime = sharedState.elapsedTime;
    sharedState.elapsedTime = Math.min(
      sharedState.elapsedTime + delta * sharedState.speedMultiplier,
      sharedState.duration
    );

    console.log(`[DEBUG] 🕒 Updated elapsedTime: ${previousElapsedTime} → ${sharedState.elapsedTime}`);

    // Update playheadX based on the elapsed time
    if (sharedState.scoreWidth > 0) {
      const previousPlayheadX = sharedState.playheadX;
      sharedState.playheadX = (sharedState.elapsedTime / sharedState.duration) * sharedState.scoreWidth;
      console.log(`[DEBUG] 📍 Updated playheadX: ${previousPlayheadX} → ${sharedState.playheadX}`);
    } else {
      console.error("[ERROR] ❌ scoreWidth is zero or undefined. Cannot update playheadX.");
    }

    lastUpdateTime = now;
    sendOscMessage();
  }
};






// ✅ Store connected clients and their names
let connectedClients = {}; // { socketId: "ClientName" }

const broadcastState = () => {
  sharedState.scoreWidth = Number.isFinite(sharedState.scoreWidth) && sharedState.scoreWidth > 0 ? sharedState.scoreWidth : 40960;
  sharedState.elapsedTime = Number.isFinite(sharedState.elapsedTime) && sharedState.elapsedTime >= 0 ? sharedState.elapsedTime : 0;
  sharedState.playheadX = Number.isFinite(sharedState.playheadX) && sharedState.playheadX >= 0 ? sharedState.playheadX : 0;
  sharedState.duration = Number.isFinite(sharedState.duration) && sharedState.duration > 0 ? sharedState.duration : 1200000;

  console.log("\n[SERVER] 🔄 Broadcasting State:");
  console.log(`    🕒 Elapsed Time: ${sharedState.elapsedTime}`);
  console.log(`    🎵 Is Playing: ${sharedState.isPlaying}`);
  console.log(`    📍 PlayheadX: ${sharedState.playheadX}`);
  console.log(`    🚀 Speed Multiplier: ${sharedState.speedMultiplier}`); // ✅ Log speed multiplier

  const message = JSON.stringify({
    type: 'sync',
    state: {
      elapsedTime: sharedState.elapsedTime,
      isPlaying: sharedState.isPlaying,
      scoreWidth: sharedState.scoreWidth,
      playheadX: sharedState.playheadX,
      speedMultiplier: sharedState.speedMultiplier, // ✅ Only send when needed
    },
    serverTime: Date.now(),
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  console.log(`[SERVER] ✅ Broadcast complete.`);
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
      case "cue_stop":
        console.log(`[DEBUG] Broadcasting cue_stop from client.`);

        const stopMessage = JSON.stringify({
          type: "cue_stop",
          elapsedTime: data.elapsedTime || sharedState.elapsedTime,
          id: data.id || "cue_stop"
        });

        // ✅ Broadcast to all clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(stopMessage);
          }
        });

        // ✅ Optionally update server playback state
        sharedState.isPlaying = false;
        lastUpdateTime = null;
        broadcastState(); // Optional, ensures clients reflect stopped state

        break;

        case "osc_rotate":
          console.log(`[OSC] 🔄 Received osc_rotate:`, data);

          // TODO: Add routing logic here

          // Optionally broadcast this OSC message to all clients (if needed)
          // Or forward to an OSC server if you're using node-osc or similar
        
          break;

      case 'set_speed_multiplier':
        if (!isNaN(data.multiplier) && data.multiplier > 0) {
          const roundedMultiplier = parseFloat(data.multiplier.toFixed(1)); // ✅ Round before storing

          if (sharedState.speedMultiplier !== roundedMultiplier) {
            sharedState.speedMultiplier = roundedMultiplier;
            console.log(`[SERVER] Updated speed multiplier to ${roundedMultiplier}`);

            // ✅ Send the update to all clients EXCEPT the sender
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client !== ws) { // ✅ Skip sender
                client.send(JSON.stringify({
                  type: 'set_speed_multiplier',
                  multiplier: sharedState.speedMultiplier
                }));
              }
            });

            // ✅ DO NOT call broadcastState() here (to avoid syncing back to sender)
          } else {
            console.log(`[SERVER] Speed multiplier already set to ${roundedMultiplier}. No update needed.`);
          }
        } else {
          console.warn("[SERVER] Invalid speed multiplier received.");
        }
        break;

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
      case "pause":
        console.log("[DEBUG] Handling manual pause from client.");

        sharedState.isPlaying = false;
        lastUpdateTime = null;

        // ✅ Update shared state with provided values or maintain existing state
        sharedState.playheadX = !isNaN(data.playheadX) ? data.playheadX : sharedState.playheadX;
        sharedState.elapsedTime = !isNaN(data.elapsedTime) ? data.elapsedTime : sharedState.elapsedTime;

        console.log(`[DEBUG] Pausing at playheadX=${sharedState.playheadX}, elapsedTime=${sharedState.elapsedTime}`);

        if (isNaN(sharedState.playheadX) || isNaN(sharedState.elapsedTime)) {
          console.error(`[ERROR] Invalid playheadX or elapsedTime received: playheadX=${sharedState.playheadX}, elapsedTime=${sharedState.elapsedTime}`);
          return;
        }

        const pauseMessage = JSON.stringify({
          type: "pause",
          playheadX: sharedState.playheadX,
          elapsedTime: sharedState.elapsedTime
        });

        // ✅ Send the pause message to all clients except the sender
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client !== ws) {
            console.log("[DEBUG] Sending pause message to client.");
            client.send(pauseMessage);
          }
        });

        broadcastState();
        break;


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
      case "play":
        console.log("[DEBUG] ▶️ Handling play message from client.");

        if (!isNaN(data.playheadX) && data.playheadX >= 0) {
          console.log(`[DEBUG] Received playheadX=${data.playheadX} from client.`);
          sharedState.playheadX = data.playheadX;
        } else {
          console.warn("[WARNING] `playheadX` from client is invalid. Retaining last known value.");
        }

        if (typeof sharedState.duration === "number" && sharedState.scoreWidth > 0) {
          const previousElapsedTime = sharedState.elapsedTime;
          sharedState.elapsedTime = (sharedState.playheadX / sharedState.scoreWidth) * sharedState.duration;
          console.log(`[DEBUG] 🔄 Recalculated elapsedTime: ${previousElapsedTime} → ${sharedState.elapsedTime}`);
        } else {
          console.warn("[WARNING] Skipping elapsedTime update: Missing valid `scoreWidth` or `duration`.");
        }

        sharedState.isPlaying = true;
        lastUpdateTime = Date.now();
        console.log("[DEBUG] 🎬 Broadcasting updated state after play.");
        broadcastState();
        break;


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

      /**
      * ✅ Handles jump requests from clients.
      * - Prevents unnecessary override by delaying the next sync update.
      */
      case "jump":
        console.log(`[DEBUG] 🏃 Handling jump request. Received playheadX=${data.playheadX}, elapsedTime=${data.elapsedTime}`);

        if (!isNaN(data.playheadX) && data.playheadX >= 0) {
          sharedState.playheadX = data.playheadX;  // ✅ Trust client-side value
          sharedState.elapsedTime = data.elapsedTime;

          console.log(`[DEBUG] ✅ Jump applied. playheadX: ${sharedState.playheadX}, elapsedTime: ${sharedState.elapsedTime}`);
          console.log(`[DEBUG] ✅ Broadcasting updated state immediately.`);

          broadcastState();  // ✅ Ensure clients receive the new state
        } else {
          console.warn("[WARNING] ❌ Invalid playheadX received. Ignoring.");
        }
        break;






      /**
      * ✅ Handles resuming playback after a pause.
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

        updateElapsedTime(); // ✅ Restart elapsed time tracking
        sendOscMessage(); // ✅ Immediately send an OSC stopwatch update

        broadcastState();
        break;

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
  setTimeout(updateLoop, 1400);
};

updateLoop();
