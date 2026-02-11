---
title: Timer Network Synchronization (Developer Guide)
---

# Timer Network Sync — Developer Guide

This document explains how the countdown timer synchronization works between clients and server for developer onboarding.

---

## Architecture Overview

The countdown timer uses a **server-owned** architecture:

```
┌─────────────┐     commands      ┌─────────────┐     broadcast     ┌─────────────┐
│  Client A   │ ─────────────────▶│   Server    │◀─────────────────▶│  Client B   │
│  (sender)   │                   │  (owner)    │                   │  (receiver) │
└─────────────┘                   └─────────────┘                   └─────────────┘
       │                                │                                  │
       │  countdown_start_sequence      │                                  │
       │ ──────────────────────────────▶│                                  │
       │                                │  sync (with countdown state)     │
       │                                │ ────────────────────────────────▶│
       │                                │                                  │
       │  sync (with countdown state)   │                                  │
       │◀────────────────────────────── │                                  │
```

**Key principle**: Clients send commands, server owns state, server broadcasts to all.

---

## Files Involved

| File | Role |
|------|------|
| `oscillaTimers.js` | Client-side UI, countdown controls, display updates |
| `oscillaSystemSocket.js` | WebSocket message routing on client |
| `server.js` | Server-side countdown logic, state management, broadcasting |

---

## Data Structures

### Client-Side Sequences (localStorage)

```javascript
// Key: "oscilla.countdownSequences"
[
  {
    "name": "Sonata",
    "loop": 1,           // 0 = infinite, 1+ = repeat count
    "chain": null,       // index of next sequence, or null
    "cues": [
      { "name": "Exposition", "seconds": 120 },
      { "name": "Development", "seconds": 180 }
    ]
  }
]
```

### Server-Side Countdown State (`sharedState.countdown`)

```javascript
{
  running: true,
  cueName: "Exposition",      // Current cue name (for display)
  totalSeconds: 120,          // Total duration of current cue
  startTime: 1706745600000,   // Date.now() when cue started
  sequenceName: "Sonata",     // Parent sequence name
  cueIndex: 0,                // Current cue index within sequence
  totalCues: 2,               // Total cues in sequence
  loop: 1,                    // Loop setting
  currentLoop: 1,             // Current loop iteration
  cues: [...],                // Full cue array (for advancement)
  chainTo: null               // Next sequence index when complete
}
```

### Server-Side Sequences (`sharedState.countdownSequences`)

```javascript
// Mirror of client sequences, stored on server for:
// 1. Late-joining clients
// 2. Sequence lookup when starting by index
[
  { name: "Sonata", loop: 1, chain: null, cues: [...] }
]
```

---

## Message Types

### Client → Server

| Message | Purpose | Payload |
|---------|---------|---------|
| `countdown_sequences_update` | Sync sequences to server | `{ sequences: [...] }` |
| `countdown_start_sequence` | Start a sequence | `{ sequenceIndex: 0, sequence: {...} }` |
| `countdown_start_cue` | Start single cue | `{ cue: { name, seconds } }` |
| `countdown_stop` | Stop countdown | `{}` |

### Server → Clients (via sync broadcast)

The countdown state is included in the regular `sync` message:

```javascript
{
  type: "sync",
  state: {
    // ... other state ...
    countdown: {
      running: true,
      cueName: "Exposition",
      remainingSec: 45,        // Calculated from startTime
      sequenceName: "Sonata",
      cueIndex: 0,
      totalCues: 2,
      // ... etc
    },
    countdownSequences: [...]  // For late-joiners
  }
}
```

---

## Sync Flow

### 1. Client Connects

```
Client                              Server
  │                                    │
  │──── WebSocket connect ────────────▶│
  │                                    │
  │◀─── sync (includes countdown) ─────│  // If countdown running
  │                                    │
  │──── countdown_sequences_update ───▶│  // Client syncs its sequences
  │                                    │
```

**Code path:**
- `oscillaSystemSocket.js`: Socket `open` event calls `window.syncCountdownSequences()`
- `oscillaTimers.js`: `syncSequencesToServer()` sends `countdown_sequences_update`

### 2. Client Starts Countdown

```
Client A                            Server                           Client B
  │                                    │                                 │
  │── countdown_sequences_update ─────▶│                                 │
  │── countdown_start_sequence ───────▶│                                 │
  │                                    │── startServerSequence() ───────▶│
  │                                    │                                 │
  │◀────────── sync ───────────────────│─────────── sync ───────────────▶│
  │                                    │                                 │
```

**Code path:**
1. `oscillaTimers.js`: `sendCountdownStartSequence(index)` sends:
   - `countdown_sequences_update` (ensures server has sequences)
   - `countdown_start_sequence` with index AND full sequence data
2. `server.js`: Receives message, calls `startServerSequence(seq)`
3. `server.js`: Sets `sharedState.countdown`, immediately calls `broadcastState()`
4. All clients receive sync, call `window.updateCountdownDisplay(countdown)`

### 3. Countdown Running (Update Loop)

```
Server                              All Clients
  │                                      │
  │  updateLoop() every 250ms            │
  │  ├── if countdown.running            │
  │  │   └── broadcastState()            │
  │  │       └── calculates remainingSec │
  │                                      │
  │────────── sync ─────────────────────▶│
  │                                      │  updateCountdownDisplay()
  │                                      │
```

**Code path:**
- `server.js`: `updateLoop()` runs every 250ms
- If `sharedState.countdown.running` OR `sharedState.isPlaying`, calls `broadcastState()`
- `broadcastState()` calculates `remainingSec` from `startTime`:
  ```javascript
  const elapsed = Math.floor((Date.now() - countdown.startTime) / 1000);
  const remainingSec = Math.max(0, countdown.totalSeconds - elapsed);
  ```

### 4. Cue Advancement (Server-Side)

```
Server (in broadcastState)
  │
  │  remainingSec === 0?
  │  └── advanceCountdown()
  │      ├── cueIndex < totalCues - 1?
  │      │   └── advance to next cue
  │      ├── currentLoop < loop?
  │      │   └── restart sequence, increment loop
  │      ├── chainTo !== null?
  │      │   └── start chained sequence
  │      └── else: stopServerCountdown()
```

**Code path:**
- `server.js`: `broadcastState()` checks if `remainingSec <= 0`
- Calls `advanceCountdown()` which handles:
  - Next cue in sequence
  - Loop repetition
  - Chain to next sequence
  - Stop when complete

### 5. Client Stops Countdown

```
Client                              Server                           All Clients
  │                                    │                                 │
  │──── countdown_stop ───────────────▶│                                 │
  │                                    │── stopServerCountdown() ───────▶│
  │                                    │                                 │
  │◀────────── sync ───────────────────│─────────── sync ───────────────▶│
  │  (countdown: null)                 │  (countdown: null)              │
```

---

## Time Synchronization

### How Remaining Time is Calculated

```javascript
// Server stores START time, not remaining time
sharedState.countdown = {
  startTime: Date.now(),      // When cue started
  totalSeconds: 120           // Total duration
};

// In broadcastState(), calculate remaining:
const elapsed = Math.floor((Date.now() - countdown.startTime) / 1000);
const remainingSec = Math.max(0, countdown.totalSeconds - elapsed);
```

### Why This Works

- Server calculates `remainingSec` at broadcast time
- All clients receive the SAME remaining time value
- No clock sync required between server and clients
- Network latency causes ±50-200ms variance (acceptable)

### Alternative Approach (Not Used)

```javascript
// ❌ Don't do this - requires clock synchronization
countdown.endTime = Date.now() + (seconds * 1000);
// Client: remainingSec = (countdown.endTime - Date.now()) / 1000
// Problem: client and server clocks may differ!
```

---

## Key Functions

### Client Side (`oscillaTimers.js`)

```javascript
// Sync sequences to server on load/connect
function syncSequencesToServer()

// Send start command with sequence data
function sendCountdownStartSequence(sequenceIndex)

// Send single cue start
function sendCountdownStartCue(cue)

// Send stop command
function sendCountdownStop()

// Broadcast sequences to server
function broadcastSequencesUpdate()

// Update display from server sync (called by oscillaSystemSocket)
function updateCountdownDisplay(countdown)
```

### Server Side (`server.js`)

```javascript
// Start a single cue countdown
function startServerCountdown(cue, sequenceName, cueIndex, totalCues, loop, currentLoop)

// Start a full sequence
function startServerSequence(sequence, loopCount)

// Advance to next cue/loop/chain
function advanceCountdown()

// Stop and clear countdown
function stopServerCountdown()

// Broadcast state to all clients (includes countdown)
function broadcastState()
```

---

## Message Handlers

### Server (`server.js` switch statement)

```javascript
case "countdown_sequences_update":
  // Store sequences, broadcast to others
  sharedState.countdownSequences = data.sequences;
  broadcastToOthers(ws, data);
  break;

case "countdown_start_sequence":
  // Start sequence (prefer sent data, fallback to stored)
  const seq = data.sequence || sharedState.countdownSequences[data.sequenceIndex];
  if (seq) startServerSequence(seq);
  break;

case "countdown_start_cue":
  // Start single cue
  startServerCountdown(data.cue);
  break;

case "countdown_stop":
  // Stop countdown
  stopServerCountdown();
  break;
```

### Client (`oscillaSystemSocket.js`)

```javascript
case "sync":
  handleSyncMessage(data);  // Includes countdown display update
  break;

case "countdown_sequences_update":
  // Another client updated sequences
  handleCountdownMessage(data);
  break;
```

---

## Update Loop

The server runs an update loop every 250ms:

```javascript
const updateLoop = () => {
  const countdownRunning = sharedState.countdown && sharedState.countdown.running;
  
  if (sharedState.isPlaying) {
    updateElapsedTime();
    broadcastState();
  } else if (countdownRunning) {
    // Countdown runs independently of playback!
    broadcastState();
  }
  
  setTimeout(updateLoop, 250);
};
```

**Important**: Countdown broadcasts happen even when score playback is stopped. This was a bug that was fixed — the original code only broadcast when `isPlaying` was true.

---

## Late-Joining Clients

When a client connects mid-countdown:

1. Client receives first `sync` message
2. `sync.state.countdown` contains current countdown state with calculated `remainingSec`
3. `sync.state.countdownSequences` contains all sequences
4. Client immediately shows correct countdown time
5. Client stores sequences to localStorage

```javascript
// In handleSyncMessage (oscillaSystemSocket.js)
if (state.countdown) {
  window.updateCountdownDisplay(state.countdown);
}

if (state.countdownSequences?.length > 0) {
  // Store to localStorage if we don't have any
  const local = localStorage.getItem("oscilla.countdownSequences");
  if (!local || JSON.parse(local).length === 0) {
    localStorage.setItem("oscilla.countdownSequences", JSON.stringify(state.countdownSequences));
  }
}
```

---

## Debugging

### Server Logs

```
[Countdown] ✅ Sequences updated from client: 2 sequences
[Countdown]    Names: Warm-up, Sonata
[Countdown] ▶ Sequence started: Sonata (2 cues, loop: 1)
[Countdown] ▶ Started: Exposition (120s)
[Countdown] → Advanced to cue 2/2: Development
[Countdown] ⏹ Stopped
```

### Client Logs

```
[Countdown] Broadcasting sequences to server: 2 sequences
[Countdown] Sent countdown_start_sequence with sequence data: Sonata
[Countdown] ✅ Synced sequences to server: 2
```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Countdown doesn't start | Sequences not synced to server | Check `broadcastSequencesUpdate()` is called |
| Display doesn't update | `updateLoop` not broadcasting | Ensure countdown check in update loop |
| Late joiner sees wrong time | `remainingSec` not in sync message | Check `broadcastState()` calculates it |
| Sequences lost on refresh | Not saved to localStorage | Check `saveCountdownSequences()` |

---

## Summary

1. **Server owns the timer** — clients send commands, server manages state
2. **Sequences sync bidirectionally** — clients send updates, server stores and broadcasts
3. **Time calculated server-side** — `remainingSec` computed from `startTime` at broadcast
4. **250ms update loop** — continuous broadcast while countdown or playback active
5. **Late joiners supported** — full state included in sync messages
