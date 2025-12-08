# cue:metronome _(with autostart support)_

Triggers a visual and/or audible metronome marker at the cue’s location or a specified `target:` element.
The metronome can follow scrolling objects, stay fixed to the viewport, and optionally send OSC messages.

The metronome **can also autostart**, meaning it runs automatically when the SVG is loaded in either page mode or scroll mode without needing a cue trigger crossing.

---

### 🧭 Syntax

```
cue:metro(bpm:<number>,beats:<number>,visual:<type>,audio:<0|1>,
           position:<fixed|scrolling>,osc:<0|1>,uid:<string>,
           target:<uid>,hideTarget:<0|1>,showcount:<0|1>,hold:<seconds>,
           colour:<csscolour>,size:<pixels>,trig:<auto|edge>)
```

---

### ⚙️ Parameters

| Parameter | Type | Default | Description |
|------------|------|----------|--------------|
| **bpm** | number | `120` | Beats per minute. Controls metronome speed. |
| **beats** | number | `4` | Number of beats per cycle. |
| **visual** | string | `"circle"` | Visual style (`circle`, `hex`, future shapes). |
| **audio** | `0` / `1` | `0` | Enables click sound. |
| **position** | `"fixed"` / `"scrolling"` | `"fixed"` | Follow-scrolling or fixed overlay. |
| **osc** | `0` / `1` | `0` | Publishes OSC beat messages. |
| **uid** | string | `"default"` | Unique metronome identifier. |
| **target** | uid | — | Anchor element (scrolling mode only). |
| **hideTarget** | `0` / `1` | `1` | Hide target element when starting. |
| **showcount** | `0` / `1` | `1` | Show count number inside shape. |
| **hold** | seconds | `0` | Stop after defined duration. |
| **colour** | CSS color | `"red"` | Circle colour. |
| **size** | pixels | `50` | Circle diameter. |
| **trig** | `"auto"` / `"edge"` | `"edge"` | Whether to autostart or trigger when playhead crosses. |

---

### 🪄 Behaviour

- Runs as **overlay DOM** element (not part of the SVG).
- Follows scrolling or stays screen-fixed depending on `position:`.
- Supports **audio click** and **OSC output**.
- Supports **multiple concurrent** metronomes (UID required).
- Can target another SVG element and hide it on activation.

---

### 🚀 Autostart Mode (NEW)

#### 🧠 When is a metronome autostarted?

Whenever the cue contains:

```
trig:auto
```

Example:

```
cue:metro(bpm:90,visual:hex,uid:m21,trig:auto)
```

#### 🔁 When does autostart happen?

- In **page overlay mode** (during PDF-style view)
- In **scroll mode** (timeline view)
- **After the SVG and DOM are initialized**
- **Before** the animation clock starts

#### 🏷️ What does autostart actually do?

Autostart metronomes fully initialise as if they had been triggered by the scrolling playhead:

- Overlay DOM is created
- Beat scheduler starts
- UI is visible
- OSC messages begin
- Audio (if enabled) clicks on beat 1,2,3,4…

#### 🗂️ Multiple autostarts supported

Each metronome UID becomes its **own independent instance**.

---

### 🔊 Example cues

| Description | Example |
|--------------|----------|
| Autostart metronome at load | `cue:metro(bpm:90,visual:hex,trig:auto,uid:m1)` |
| Two autostarts with different tones | `cue:metro(bpm:70,trig:auto,uid:A)` + `cue:metro(bpm:110,trig:auto,uid:B)` |
| Standard (on crossing), no autostart | `cue:metro(bpm:100,visual:circle,uid:M)` |
| Scroll-following autostart | `cue:metro(bpm:120,position:scrolling,target:x1,trig:auto,uid:hex1)` |

---

### 🎯 OSC Message Example

```
/oscilla/metro
{
  "uid": "m21",
  "client": "rob",
  "bpm": 90,
  "beat": 3
}
```

---

### 🎛️ Implementation Notes (for developers)

- Autostart hooks run **after** DOM insertion and SVG setup.
- Autostart routines are separate from cue crossing logic:
  - No tracking in `triggeredCues`
  - No playhead position checks required
- Overlay visibility ensured via:
  ```
  div.style.zIndex = "99999";
  ```

---

### 🚫 Known Limitations

- Multiple autostarts in high BPM (>200) may need scheduler improvements.
- OSC feedback not currently aware of phase differences between UIDs.
- Appearance position is based on CSS absolute, not SVG hitbox.
