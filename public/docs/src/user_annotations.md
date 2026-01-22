# Oscilla Annotations

## Overview

Annotations provide a **text-first compositional layer** that exists independently of SVG score notation. While Oscilla's primary workflow involves creating scores in Inkscape and embedding cues via the DSL, annotations offer an alternative—or complementary—approach that requires no external software.

At their simplest, annotations are performer notes: reminders, instructions, or markings placed directly on the score during rehearsal or performance. At their most developed, annotations become **executable triggers**—buttons that play audio, fire samples from pools, or run continuous generative processes. This transforms the score view into a **live performance interface**.

### Two Compositional Planes

| SVG Score Layer | Annotation Layer |
|-----------------|------------------|
| Created in Inkscape | Created in browser |
| Embedded DSL cues | Click-to-execute triggers |
| Requires XML/text editing | Visual point-and-click |
| Playhead-driven | Performer-driven |
| Fixed at authoring time | Editable during performance |
| Shared via project files | Shared via WebSocket (optional) |

These layers coexist. A score might use SVG cues for precise, time-locked events while annotations provide flexible performer controls. Or a piece might use **only annotations**—no SVG at all—relying on positioned text cues and audio triggers coordinated via the stopwatch and network sync.

---

## Basic Usage: Performer Notes

### Adding an Annotation

1. **Enable pen mode**: Click the ✏️ pen icon in the toolbar (or double-tap the score area)
2. **Click on the score**: Position where you want the note
3. **Type your text**: Instructions, reminders, cue names, section markers
4. **Adjust font size**: Use the slider (8–32px)
5. **Choose scope**: Check "Share" to broadcast to other connected clients
6. **Save**: Click Save or press Enter

### Editing an Annotation

1. **Enable pen mode** (pen icon must be active)
2. **Click on the annotation** you want to edit
3. **Modify text, size, or settings**
4. **Save** changes

> **Important**: You can only edit annotations when pen mode is ON. When pen mode is OFF, clicking a trigger executes it; clicking a regular note does nothing.

### Deleting an Annotation

1. Enable pen mode
2. Click the annotation to open the editor
3. Click **Delete**

### Moving an Annotation

Annotations can be dragged at any time (pen mode on or off):
- **Mouse**: Click and drag
- **Touch**: Touch and drag

Position is saved automatically when you release.

---

## Executable Triggers

Annotations can be converted into **triggers**—clickable buttons that execute audio playback when tapped in performance mode (pen mode OFF).

### Creating a Trigger

1. Enable pen mode and click to create a new annotation (or edit existing)
2. Check **☑ Executable (trigger)**
3. Configure the trigger type and parameters
4. Save

### Trigger Types

#### 🔊 Audio (Single File)
Plays one audio file each time clicked.

**Parameters:**
| Parameter | Range | Description |
|-----------|-------|-------------|
| Source | file path | Path to audio file (e.g., `drums/kick.wav`) |
| Gain | 0.0–1.0 | Volume level |
| Pan | -1 to +1 | Stereo position (left/right) |
| Pitch | 0.25x–2x | Playback speed/pitch |
| Loop | 1, 2, 3, 4, ∞ | Number of times to play |
| Fade In | 0–2s | Fade in duration |
| Fade Out | 0–2s | Fade out duration |
| Toggle | on/off | If enabled, click starts playback, click again stops |

**Use cases:**
- One-shot samples (hits, stings, effects)
- Looping drones or textures (with Toggle + Loop ∞)
- Pitch-shifted variations of a single sound

---

#### 🎲 Audio Pool (Directory)
Plays files from a directory, selecting the next file based on the chosen order.

**Parameters:**
| Parameter | Range | Description |
|-----------|-------|-------------|
| Source | directory path | Path to folder (e.g., `textures/pads/`) |
| Order | shuffle/sequential/random | How files are selected |
| Gain | 0.0–1.0 | Volume level |
| Pan | -1 to +1 | Stereo position |
| Pitch | 0.25x–2x | Playback speed/pitch |
| Loop | 1, 2, 3, 4, ∞ | Times to play each selected file |
| Fade In | 0–2s | Fade in duration |
| Fade Out | 0–2s | Fade out duration |

**Order modes:**
- **Shuffle**: Plays through all files in random order, then reshuffles (no immediate repeats)
- **Sequential**: Plays files in alphabetical order, cycling back to start
- **Random**: Pure random selection (may repeat)

**Use cases:**
- Drum machines (folder of kick variations)
- Texture clouds (folder of similar ambient sounds)
- Aleatoric elements (folder of short phrases)

---

#### ⚡ Audio Impulse (Continuous)
Starts a **continuous generative process** that plays samples at a specified rate. Click once to start, click again to stop.

**Parameters:**
| Parameter | Range | Description |
|-----------|-------|-------------|
| Source | directory path | Path to sample folder |
| Order | shuffle/sequential/random | Selection mode |
| Gain | 0.0–1.0 | Volume level |
| Pan | -1 to +1 | Stereo position |
| Pitch | 0.25x–2x | Playback speed |
| Rate | 1–120/min | Hits per minute |
| Jitter | 0–100% | Timing randomness |
| Polyphony | 1–12 | Maximum simultaneous voices |

**Visual feedback:**
- Running impulse shows **green border**
- Stopped impulse shows **cyan border**

**Use cases:**
- Granular-style textures
- Irregular rhythmic patterns
- Ambient soundscapes
- Generative percussion

---

## Audio File Management

### Browsing Files

Click the **📁** button next to the Source field to open the audio browser:

- Navigate directories by clicking folder names
- Click **Select** button on a directory row to choose it for a pool
- Click a file to select it for single-file playback
- Use **⬆ ..** to go up one level
- Inside a directory, click **✓ Select this directory** to use current location

### Uploading Files

Click **⬆ Upload Audio** to add new files:

- Files upload to the directory shown in the Source field
- If Source is empty, files go to the project's `audio/` root
- If Source contains a directory path (e.g., `drums/kicks`), files upload there

**Conflict handling:**

When uploading a file that already exists, you'll see three options:
- **Cancel**: Abort the upload
- **Rename**: Enter a new filename
- **Overwrite**: Replace the existing file

### Directory Structure

Audio files live in your project's `audio/` directory:

```
scores/
  my_project/
    audio/
      kick.wav
      snare.wav
      drums/
        kick_01.wav
        kick_02.wav
        kick_03.wav
      textures/
        pad_a.wav
        pad_b.wav
        pad_c.wav
```

Reference files by path relative to `audio/`:
- Single file: `kick.wav` or `drums/kick_01.wav`
- Directory pool: `drums/` or `textures/`

---

## Scope and Sharing

### Local vs Shared Annotations

| Scope | Visibility | Persistence |
|-------|------------|-------------|
| **Local** | Only you | localStorage in your browser |
| **Shared** | All connected clients | Broadcast via WebSocket |

Check **☐ Share** when creating/editing to broadcast the annotation.

### Network Synchronization

When clients are connected via WebSocket:
- Shared annotations appear on all clients
- Position changes sync in real-time
- Edits and deletions propagate to all

> **Note**: Currently, audio files themselves do not sync—all clients need the same files in their project's audio directory. File sharing is planned for a future update.

---

## Visual Reference

### Annotation Appearance

| Type | Border | Icon | Position |
|------|--------|------|----------|
| Text note | thin white | none | — |
| Audio trigger | cyan | 🔊 | top-right |
| Audio Pool trigger | cyan | 🎲 | top-right |
| Audio Impulse trigger | cyan (green when running) | ⚡ | top-right |

### Interaction States

| Pen Mode | Click on Trigger | Click on Text Note |
|----------|-----------------|-------------------|
| ON (editing) | Opens editor | Opens editor |
| OFF (performance) | **Executes trigger** | No action (drag only) |

---

## Workflow Examples

### Example 1: Rehearsal Notes

A violinist marking difficult passages:

1. Enable pen mode
2. Click at measure 47: "watch intonation"
3. Click at measure 89: "breathe here"
4. Click at measure 102: "wait for cello"
5. Disable pen mode

Notes remain visible during performance as reminders.

### Example 2: Simple Text-Cue Score

A piece for ensemble with only textual instructions:

1. Create annotations for each section:
   - "I. Sustained tones, ppp, gradual entry"
   - "II. Rhythmic unison, accented"
   - "III. Free improvisation on motif"
2. Position them left-to-right across the score area
3. Share all annotations
4. All performers see the same cues
5. Use stopwatch for coordination

No SVG required—the annotations ARE the score.

### Example 3: Drum Pad Interface

Creating a sample-triggering performance interface:

1. Create a grid of trigger annotations:
   ```
   [Kick]  [Snare]  [Hat]   [Crash]
   [Tom1]  [Tom2]   [Rim]   [Clap]
   ```

2. Configure each as Audio Pool:
   - Kick → `drums/kicks/` (shuffle)
   - Snare → `drums/snares/` (shuffle)
   - etc.

3. Set parameters:
   - Gain: 0.8
   - Pitch: 1.0 (or vary for expression)

4. Disable pen mode and play!

### Example 4: Texture Cloud

An ambient installation with generative layers:

1. Create impulse triggers:
   - "Pads" → `textures/pads/`, rate: 8/min, jitter: 50%
   - "Tones" → `textures/tones/`, rate: 4/min, jitter: 80%
   - "Noise" → `textures/noise/`, rate: 20/min, jitter: 30%

2. Click each to start/stop layers
3. Mix by adjusting individual gain levels
4. Pan triggers across stereo field

### Example 5: Networked Performance

Multiple performers with distributed interface:

**Performer 1 (laptop):**
- Annotation triggers for bass samples
- Shared annotations visible to all

**Performer 2 (tablet):**
- Annotation triggers for percussion
- Same shared annotations visible

**Performer 3 (phone):**
- Text cue annotations only
- Follows along with stopwatch

All synchronized via WebSocket, no SVG score needed.

---

## API Reference

### Window API

```javascript
// Access annotation system
window.oscillaAnnotations

// Methods
.setEnabled(bool)      // Enable/disable annotation display
.setMode(bool)         // Enable/disable pen mode
.setShareDefault(bool) // Set default sharing behavior
.setProject(name)      // Switch project context
.delete(id)            // Delete annotation by ID
.list()                // Get array of all annotations
.render()              // Force re-render

// Trigger-specific
.getTriggers()         // Get all trigger annotations
.executeTriggerById(id) // Fire a trigger programmatically
.clearTriggerPools()   // Clear cached directory pools
```

### Data Model

```javascript
// Annotation structure
{
  id: "ann_xxx",
  project: "my_project",
  kind: "text" | "trigger",
  text: "Display label",
  scope: "local" | "shared",
  
  style: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)"
  },
  
  placement: {
    x: 150,
    y: 200,
    space: "score" | "pageOverlay"
  },
  
  // For triggers only:
  trigger: {
    type: "audio" | "audioPool" | "audioImpulse",
    source: {
      mode: "file" | "directory",
      path: "drums/kick.wav"
    },
    playback: {
      order: "shuffle",
      gain: 0.8,
      pan: 0,
      pitch: 1,
      loop: 1,
      fadeIn: 0,
      fadeOut: 0,
      toggle: false
    },
    // audioImpulse only:
    impulse: {
      rate: 30,
      jitter: 0.2,
      poly: 6
    }
  }
}
```

---

## Roadmap / TODO

### Playhead Triggering
- [ ] Option to trigger annotation cues automatically when playhead passes
- [ ] Define trigger region (x-range on score)
- [ ] One-shot vs retriggerable modes

### Audio File Sync
- [ ] Share uploaded audio files across network
- [ ] "Offer file bundle" protocol between clients
- [ ] Accept/reject incoming files
- [ ] Progress indicator for transfers

### Collaborative Interface Building
- [ ] Real-time collaborative trigger arrangement
- [ ] Lock/unlock annotations for editing
- [ ] Version history for shared annotations

### Extended Cue Types
- [ ] Synth triggers (oscillator, envelope, filter)
- [ ] DSL cue triggers (execute arbitrary cue string)
- [ ] OSC message triggers
- [ ] MIDI output triggers
- [ ] Visual cue triggers (screen flash, color change)

### Recording
- [ ] Record audio directly from browser microphone
- [ ] Save recordings to project audio directory
- [ ] Assign recordings to triggers immediately

### Preset Management
- [ ] Save/load trigger configurations
- [ ] Import/export annotation sets
- [ ] Template interfaces (drum pad, mixer, etc.)

---

## Conceptual Notes

### Annotations as Compositional Material

The annotation layer reframes what a "score" can be. Traditional notation software produces fixed documents; Oscilla's SVG cues add temporal triggers but still require external authoring. Annotations collapse authoring and performance into a single interface.

A composer might:
- Sketch ideas as text annotations during initial exploration
- Convert promising ideas to audio triggers
- Refine trigger parameters in rehearsal
- Share the result as a self-contained performance system

The "score" becomes the interface; the interface becomes the instrument.

### Minimal Viable Performance

For many situations, the full SVG workflow is unnecessary:

- **Workshop settings**: Text instructions + stopwatch
- **Installation contexts**: Audio triggers only
- **Remote collaboration**: Shared annotations over network
- **Improvisation frameworks**: Loose cues, flexible timing

Annotations provide "just enough" structure without the overhead of notation software.

### The Scratchpad That Grows

Annotations start as notes—marginal scribbles, rehearsal marks. They can stay that way forever. Or they can grow:

```
Note → Trigger → Pool → Impulse → Network Interface → Distributed Instrument
```

This gradient from simple to complex happens incrementally, in the browser, during use. There's no threshold where you must "switch tools" or "export and reimport." The scratchpad is the performance system.

---

## Troubleshooting

### Trigger doesn't play audio
- Check the Source path is correct
- Ensure audio files exist in project's `audio/` directory
- Check browser console for errors
- Verify file format is supported (.wav, .mp3, .ogg, .aif)

### Can't edit existing annotation
- Make sure **pen mode is ON** (pen icon active)
- Click directly on the annotation text

### Impulse shows "Empty pool"
- The specified directory contains no audio files
- Check the path is a directory, not a file
- Verify files have supported extensions

### Annotations not syncing
- Check WebSocket connection status
- Ensure annotations are marked "Shared"
- Other clients must be on the same project

### Upload fails
- Check file size (max 50MB)
- Verify file type is audio
- Check server console for errors

---

## Summary

Annotations bridge the gap between notation and interface, between preparation and performance. They require nothing but a browser, scale from marginal notes to generative instruments, and synchronize across any number of connected performers.

Start simple: add a note. Let it grow from there.