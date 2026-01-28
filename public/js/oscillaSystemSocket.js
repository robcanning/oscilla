/*!
 * oscillaSystemSocket.js — WebSocket Transport & Message Routing
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 *
 * Handles WebSocket connection, message routing, and OSC-in control dispatch.
 */

import { scrollToPlayheadVisual, togglePlayButton } from './oscillaTransport.js';
import { startStopwatch } from './cues/oscillaTimers.js';
import { loadSharedAnnotations } from './oscillaContributionSurface.js';
import { handleCueTrigger } from './oscillaCueDispatcher.js';
import { handleStopCue } from './cues/oscillaStop.js';
import { handleAudioCue } from './cues/oscillaAudio.js';
import { dismissPauseCountdown, handlePauseCue } from './cues/oscillaPause.js';
import { handleOSCIn } from './oscillaControlRouter.js';

// ===========================
// Module State
// ===========================
let reconnectAttempts = 0;
const MAX_RETRIES = 5;

// Callbacks for cross-module communication
let onStartAnimation = null;
let onStopAnimation = null;
let onUpdateClientList = null;
let onRepeatStateUpdate = null;
let onRepeatStateMapReceived = null;

// ===========================
// Socket Initialisation
// ===========================

/**
 * Initialise socket module with callbacks
 * @param {Object} callbacks - Callback functions for cross-module events
 */
export function initSocketCallbacks(callbacks) {
  onStartAnimation = callbacks.startAnimation || null;
  onStopAnimation = callbacks.stopAnimation || null;
  onUpdateClientList = callbacks.updateClientList || null;
  onRepeatStateUpdate = callbacks.onRepeatStateUpdate || null;
  onRepeatStateMapReceived = callbacks.onRepeatStateMapReceived || null;
}

/**
 * Get WebSocket URL from server config
 * @returns {Promise<string>} WebSocket URL
 */
async function getWebSocketURL() {
  try {
    const response = await fetch('/config');
    const config = await response.json();
    const hostname = window.location.hostname;
    const port = config.websocketPort;
    return (hostname === 'localhost' || hostname === '127.0.0.1')
      ? `ws://localhost:${port}`
      : `ws://${hostname}:${port}`;
  } catch {
    return `ws://localhost:8001`;
  }
}

/**
 * Connect to WebSocket server
 */
export async function connectWebSocket() {
  if (!window.wsEnabled || window.socket?.readyState === WebSocket.OPEN) return;

  try {
    const WS_URL = await getWebSocketURL();
    const socket = new WebSocket(WS_URL);
    window.socket = socket;

    socket.addEventListener('open', () => {
      console.log(`[WS] Connected to ${WS_URL}`);
      reconnectAttempts = 0;
      window.wsEnabled = true;
      socket.send(JSON.stringify({ type: "get_repeat_state" }));
    });

    socket.addEventListener("message", handleSocketMessage);

    socket.addEventListener('close', (event) => {
      console.warn(`[WS] Closed: ${event.code}`);
      if (!event.wasClean && reconnectAttempts < MAX_RETRIES) {
        reconnectAttempts++;
        setTimeout(connectWebSocket, 3000);
      }
    });

    socket.addEventListener('error', (err) => console.error('[WS] Error:', err));
  } catch (error) {
    console.error(`[WS] Init failed: ${error.message}`);
  }
}

/**
 * Handle incoming WebSocket messages
 * @param {MessageEvent} event - WebSocket message event
 */
function handleSocketMessage(event) {
  try {
    const data = JSON.parse(event.data);
    if (!data || typeof data !== "object") return;

    switch (data.type) {
      case "welcome":
        window.localClientName = data.name;
        break;

      case "client_list":
        onUpdateClientList?.(data.clients);
        break;

      case "annotation_list_response":
        loadSharedAnnotations(data.project, data.items);
        break;

      case "set_speed_multiplier":
        if (!isNaN(data.multiplier) && data.multiplier > 0) {
          const rounded = parseFloat(data.multiplier.toFixed(1));
          if (window.speedMultiplier !== rounded) {
            window.speedMultiplier = rounded;
            window.updateSpeedDisplay?.();
          }
        }
        break;

      case "pause":
        if (!isNaN(data.playheadX) && data.playheadX >= 0) window.playheadX = data.playheadX;
        if (!isNaN(data.elapsedTime) && data.elapsedTime >= 0) window.elapsedTime = data.elapsedTime;
        window.isPlaying = false;
        window.isMusicalPause = false;
        onStopAnimation?.();
        togglePlayButton();
        break;

      case "resume_after_pause":
        if (!isNaN(data.playheadX) && data.playheadX >= 0) window.playheadX = data.playheadX;
        if (!isNaN(data.elapsedTime) && data.elapsedTime >= 0) window.elapsedTime = data.elapsedTime;
        if (window.isMusicalPause) return;
        window.isPlaying = true;
        startStopwatch();
        togglePlayButton();
        onStartAnimation?.();
        break;

      case "dismiss_pause_countdown":
        dismissPauseCountdown(true, true);
        break;

      case "cuePause":
        handleCuePauseMessage(data);
        break;

      case "cueStop":
        handleStopCue(data.id || "cueStop");
        break;

      case "cueTriggered":
        handleCueTrigger(data.cueId, true);
        break;

      case "cuePause_ack":
      case "cueTraverse":
        // Acknowledged messages - no action needed
        break;

      case "audio_cue":
        handleAudioCue(data.cueId);
        break;

      case "sync":
        handleSyncMessage(data);
        break;

      case "repeat_update":
        handleRepeatUpdate(data);
        break;

      case "repeat_state_map":
        onRepeatStateMapReceived?.(data.repeatStateMap || {});
        break;

      case "jump":
        handleJumpMessage(data);
        break;

      // ===========================
      // OSC-IN CONTROL MESSAGES
      // ===========================
      case "osc_in":
      case "osc_control":
        handleOSCInMessage(data);
        break;

      case "control_set":
        // Direct control message: { type: "control_set", uid, param, value }
        handleControlSetMessage(data);
        break;
    }
  } catch (error) {
    console.error("[WS] Message error:", error);
  }
}

/**
 * Handle cuePause message
 */
function handleCuePauseMessage(data) {
  if (!isNaN(data.playheadX)) window.playheadX = data.playheadX;
  if (!isNaN(data.elapsedTime)) window.elapsedTime = data.elapsedTime;
  onStopAnimation?.();
  window.isPlaying = false;
  window.isMusicalPause = false;
  window.animationPaused = true;
  togglePlayButton();
  window.socket?.send(JSON.stringify({
    type: "cuePause_ack",
    playheadX: window.playheadX ?? -1,
    elapsedTime: window.elapsedTime ?? -1
  }));
  handlePauseCue(data.id, data.duration);
}

/**
 * Handle sync message
 */
function handleSyncMessage(data) {
  const state = data.state;
  if (!state) return;
  
  const wasPlaying = window.isPlaying;
  window.scoreWidth = state.scoreWidth;

  if (state.canonicalRenderedWidth) {
    window.canonicalRenderedWidth = state.canonicalRenderedWidth;
    
    const inner = document.getElementById("scoreInner");
    const stage = document.getElementById("scrollStage");
    if (inner) { inner.style.width = "max-content"; inner.style.height = "100%"; }
    if (stage) { stage.style.width = "max-content"; stage.style.height = "100%"; }
  }

  if (state.duration > 0) window.duration = state.duration;
  window.elapsedTime = state.elapsedTime;
  window.isPlaying = state.isPlaying;
  
  // Only accept server playhead position if we haven't just manually navigated
  if (state.playheadX !== undefined) {
    if (!window.ignoreNextSync && !window.recentlyRecalculatedPlayhead) {
      window.serverSyncPlayheadX = state.playheadX;
    }
  }
  scrollToPlayheadVisual?.();

  if (window.isPlaying && !wasPlaying) {
    cancelAnimationFrame(window.animationFrameId);
    window.animationFrameId = requestAnimationFrame(window.animate);
  }
  if (!window.isPlaying && wasPlaying) {
    cancelAnimationFrame(window.animationFrameId);
  }
}

/**
 * Handle repeat_update message
 */
function handleRepeatUpdate(data) {
  onRepeatStateUpdate?.(data.cueId, data.repeatData);
}

/**
 * Handle jump message
 */
function handleJumpMessage(data) {
  if (window.ignoreNextSync) {
    window.ignoreNextSync = false;
    return;
  }
  if (window.recentlyRecalculatedPlayhead) return;
  
  window.playheadX = data.playheadX;
  window.elapsedTime = data.elapsedTime ?? 0;
  scrollToPlayheadVisual?.();
}

// ===========================
// OSC-IN Control Handling
// ===========================

/**
 * Handle OSC-in message from server
 * Dispatches to the control router
 * @param {Object} data - OSC message data
 */
function handleOSCInMessage(data) {
  const { address, args } = data;
  
  if (!address) {
    console.warn('[WS] OSC-in missing address:', data);
    return;
  }

  // Dispatch to control router
  try {
    handleOSCIn(address, args || []);
  } catch (err) {
    console.error('[WS] OSC-in handler error:', err);
  }

  // Emit event for other listeners
  window.dispatchEvent(new CustomEvent('oscilla:osc-in', {
    detail: { address, args }
  }));
}

/**
 * Handle direct control_set message
 * @param {Object} data - { uid, param, value }
 */
function handleControlSetMessage(data) {
  const { uid, param, value } = data;
  
  if (!uid || !param) {
    console.warn('[WS] control_set missing uid or param:', data);
    return;
  }

  try {
    handleOSCIn('/oscilla/set', [uid, param, value]);
  } catch (err) {
    console.error('[WS] control_set handler error:', err);
  }
}

// ===========================
// Outbound Message Helpers
// ===========================

/**
 * Send a message through the WebSocket
 * @param {string} type - Message type
 * @param {Object} payload - Message payload
 */
export function sendSocketMessage(type, payload = {}) {
  if (window.socket?.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({ type, ...payload }));
  }
}

/**
 * Send score metadata to server
 * @param {Object} meta - Score metadata
 */
export function sendScoreMeta(meta) {
  sendSocketMessage("score_meta", meta);
}

/**
 * Send client name update
 * @param {string} name - New client name
 */
export function sendClientNameUpdate(name) {
  sendSocketMessage("update_client_name", { name });
}

/**
 * Enable or disable WebSocket connection
 * @param {boolean} enabled - Whether to enable WebSocket
 */
export function setSocketEnabled(enabled) {
  if (!enabled) {
    window.socket?.close();
    window.socket = null;
  } else {
    connectWebSocket();
  }
}

/**
 * Get current socket instance
 * @returns {WebSocket|null} Current WebSocket or null
 */
export function getSocket() {
  return window.socket || null;
}

// ===========================
// Control-Specific Outbound
// ===========================

/**
 * Request current parameter value from a target
 * @param {string} uid - Target uid
 * @param {string} param - Parameter name
 */
export function requestParam(uid, param) {
  sendSocketMessage("control_get", { uid, param });
}

/**
 * Send control value to server (for broadcast to other clients)
 * @param {string} uid - Target uid
 * @param {string} param - Parameter name
 * @param {any} value - Parameter value
 */
export function sendControl(uid, param, value) {
  sendSocketMessage("control_set", { uid, param, value });
}
