// ============================================================================
// 🎚️ sendMetronomeOsc(uid, beat, bpm)
// ============================================================================
const oscLastMetronome = new Map();

export function sendMetronomeOsc(uid, beat, bpm) {
  if (!window.OSC_ENABLED) return;

  const cleanUid = String(uid).replace(/^uid:/, "") || "default";
  const now = Date.now(); // wall-clock timestamp
  const THROTTLE_MS = 50;

  if (oscLastMetronome.has(cleanUid) && now - oscLastMetronome.get(cleanUid) < THROTTLE_MS) return;
  oscLastMetronome.set(cleanUid, now);

  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
    console.warn("[OSC] WebSocket not ready yet. Skipping OSC.");
    return;
  }

  const client = window.localClientName || "unnamed";

  const message = {
    type: "oscilla/metro",
    uid: cleanUid,
    beat,
    bpm,
    client,
    timestamp: now
  };

  window.socket.send(JSON.stringify(message));

  console.log(
    `[OSC]  /oscilla/metro uid=${cleanUid} beat=${beat} bpm=${bpm} client=${client} ts=${now}`
  );
}



