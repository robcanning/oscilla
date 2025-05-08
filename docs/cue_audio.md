
# `cueAudio` — Trigger Audio Playback (Local or OSC-Based)

The `cueAudio(...)` cue allows playback of audio files from either the browser (via WaveSurfer.js) or through external OSC-compatible environments such as SuperCollider, Pure Data (Pd), Max, or similar tools.

---

## 🔤 Syntax

```
cueAudio(filename)_amp(1.0)_loop(1)_ext(wav)
```

- `filename` → The name of the audio file (with or without extension).
- `amp(value)` → Playback volume (0.0 to 1.0). Default: `1.0`.
- `loop(value)` → Number of loops. Use `0` for infinite looping. Default: `1`.
- `ext(value)` → File extension if not included in filename (e.g. `wav`, `mp3`).

---

## ✅ Examples

### Local browser-based playback
```
cueAudio(kick)_amp(0.8)
cueAudio(drum-loop.wav)_loop(0)
```

### Explicit extension and volume
```
cueAudio(ambient)_ext(ogg)_amp(0.4)
```

---

## 🔈 Playback Modes

### 1. ✅ Local browser playback (WaveSurfer.js)

By default, if this client is marked as the **audio master**, the cue will:
- Load the audio file from the `/audio/` folder
- Play it using WaveSurfer.js in the browser
- Respect parameters like `amp(...)`, `loop(...)`, `fadein(...)`, and `fadeout(...)`

### 2. ✅ OSC-based audio triggering

The same cue also sends a WebSocket message to the server of type:

```json
{
  "type": "osc_audio_trigger",
  "filename": "drone.wav",
  "volume": 0.7,
  "loop": 2,
  "timestamp": 1746516500
}
```

This allows external audio engines (e.g. SuperCollider, Pd, etc.) to trigger and manage playback in sync with the score.

---

## 🎛️ Audio Master Role

Only one client should be responsible for **local audio playback** (e.g. connected to the speakers).

- By default, `window.isPlaybackMaster = false`
- This prevents all clients from playing audio simultaneously
- You can **toggle this role in the GUI** (e.g. checkbox or menu option)
- When enabled, this client will handle `cueAudio(...)` locally

```js
if (!window.isPlaybackMaster) {
  console.log("Skipping local audio playback — not audio master");
  return;
}
```

---

## 🚫 Notes

- If a cue does not specify an extension, it defaults to `.wav`
- Extensions already present in the filename are preserved
- Clients not designated as playback masters will still forward OSC messages

---

## 🧩 Related Cues

- [`cuePause(...)`](cuePause.md) — pause with optional countdown and jump
- [`cueRepeat(...)`](cueRepeat.md) — structured loop and jump logic
- [`cueTraverse(...)`](cueTraverse.md) — animate objects along paths or between points
