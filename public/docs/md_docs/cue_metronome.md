# cue:metronome

Triggers a visual and/or audible metronome marker at the cue’s location or a specified `target:` element.  
The metronome can follow scrolling objects, stay fixed to the viewport, and optionally send OSC messages.

---

### 🧭 Syntax

```
cue:metro(bpm:<number>,beats:<number>,visual:<type>,audio:<0|1>,
           position:<fixed|scrolling>,osc:<0|1>,uid:<string>,
           target:<uid>,hideTarget:<0|1>,showcount:<0|1>,hold:<seconds>,
           colour:<csscolour>,size:<pixels>)
```

---

### ⚙️ Parameters

| Parameter | Type | Default | Description |
|------------|------|----------|--------------|
| **bpm** | number | `120` | Beats per minute. Controls metronome speed. |
| **beats** | number | `4` | Number of beats per cycle before wrapping to beat 1. |
| **visual** | string | `"circle"` | Visual style of the pulse indicator (currently always a circle). |
| **audio** | `0` / `1` | `0` | Enables short sine tone clicks for each beat (higher pitch for beat 1). |
| **position** | `"fixed"` / `"scrolling"` | `"fixed"` | Determines whether the metronome overlay stays fixed on screen or follows a scrolling anchor object. |
| **osc** | `0` / `1` | `0` | Sends beat data as OSC messages over WebSocket. |
| **uid** | string | `"default"` | Unique identifier for the metronome instance. Used for multiple concurrent metronomes and deterministic audio pitch. |
| **target** | string (UID) | — | Targets another SVG element (by `id` or `data-uid`) as the anchor point instead of the cue element. |
| **hideTarget** | `0` / `1` | `1` | Whether to hide the `target:` element when the metronome starts (`1` = hide, `0` = leave visible). |
| **showcount** | `0` / `1` | `1` | Toggles display of the current beat number inside the metronome circle. |
| **hold** | number (seconds) | `0` | Optional duration after which the metronome automatically stops and fades out. |
| **colour** | string (CSS/hex) | `"red"` | Fill colour for the metronome shape. Accepts standard CSS colour names or hex values. |
| **size** | number (pixels) | `50` | Diameter of the metronome shape in pixels. |

---

### 🪄 Behaviour

- Each metronome instance is uniquely identified by its `uid:`.  
  Re-triggering the same `uid` resets and reuses that instance; triggering a different `uid` creates an independent one.

- If `position:scrolling` is used, the metronome dynamically follows its anchor element as the score scrolls.  
  (This behaviour is implemented using `getBoundingClientRect()` offsets and scroll deltas.)

- If `hold:` is specified, the metronome runs for the given number of seconds, then fades out and removes itself.  
  The cue and (optionally) target elements remain hidden after completion.

- Audio clicks use a **shared AudioContext** and deterministic UID-based frequencies (each `uid` maps to a stable tone between 300–700 Hz).  
  This allows several metronomes to sound distinct without detuning.

- Timing is controlled using `performance.now()` and `requestAnimationFrame()` for high precision.  
  This avoids drift typical of `setTimeout`-based timers, especially at high BPMs or when the browser is busy.

- If OSC is enabled, a message is sent on every beat:

  ```
  /oscilla/metro uid:<string> client:<name> bpm:<number> beat:<number>
  ```

  (Address `/oscilla/metro`, client name from `localClientName`.)

---

### 🔊 Example Cues

| Description | Example |
|--------------|----------|
| Fixed on screen, 4 beats at 100 BPM | `cue:metro(bpm:100,beats:4,audio:1,uid:main)` |
| Scroll-following metronome attached to a note | `cue:metro(bpm:120,beats:4,position:scrolling,target:note1)` |
| Hidden target and auto-stop after 12 s | `cue:metro(bpm:90,beats:6,audio:1,target:markerA,hideTarget:1,hold:12,uid:a1)` |
| Two concurrent metronomes with different tones | `cue:metro(bpm:70,uid:left,audio:1)` and `cue:metro(bpm:90,uid:right,audio:1)` |
| Custom colour and size | `cue:metro(bpm:110,beats:4,colour:#33ff99,size:80,audio:1,uid:greenbig)` |

---

### 🧩 OSC Message Example

```
/oscilla/metro
{
  "uid": "main",
  "client": "rob",
  "bpm": 100,
  "beat": 3
}
```

---

### 🧱 Notes

- Multiple metronomes can run concurrently if `uid`s differ.
- Elements hidden by the cue remain hidden after completion.
- For very high accuracy across inactive tabs, future versions may integrate a shared Web Audio clock or OSC master sync.
