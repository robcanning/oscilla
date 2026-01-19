# OSCILLA Inkscape Extension

A comprehensive Inkscape extension suite for authoring [OSCILLA](https://github.com/robcanning/oscilla) interactive graphic notation scores without writing DSL code manually.

## Overview

OSCILLA is an interactive graphic notation system that uses SVG element IDs to define behaviors, animations, audio cues, and more. This extension provides a GUI interface to apply these cues to your SVG elements directly in Inkscape.

## Features

### ⌨️ Quick Apply (Keyboard Shortcuts)
**29 individual mini-extensions** that can be bound to keyboard shortcuts for instant, dialog-free cue application:
- Select element → press shortcut → cue applied instantly
- Bind in: `Edit → Preferences → Interface → Keyboard` → search "OSCILLA"
- Suggested shortcuts: `Ctrl+Alt+P` for Pause, `Ctrl+Alt+S` for Scale, etc.

### 🎛 OSCILLA Cue Editor
The main extension with comprehensive controls for all OSCILLA cue types:

- **Timing & Navigation**: stop, pause, speed, nav, page, stopwatch, metro
- **Animation**: scale, scaleXY, rotate, object-to-path (o2p)
- **Visual Effects**: color transitions, fade effects
- **Text**: animated text display from files or strings
- **Audio**: single files, audio pools, stochastic impulses
- **Video**: in-score video playback
- **Synthesis**: Web Audio synth with filters and envelopes
- **OSC**: discrete events and continuous control lanes
- **Interaction**: buttons, reusable collections
- **Propagate**: group-level cue application

### 🎛 Standalone Toolbar
A floating GTK toolbar that runs **outside** of Inkscape's extension system - no dialog popups, no freezing:
```bash
python3 oscilla_toolbar_standalone.py
```
- Stays open while you work
- Click buttons to copy cues to clipboard
- Paste into Inkscape's Object Properties (Ctrl+Shift+O) → ID field
- Or bind it to a keyboard shortcut / add to your desktop

### ⚡ OSCILLA Quick Cues
Preset templates for rapid workflow:
- One-click application of common cue patterns
- Customizable values for each preset
- Perfect for frequently used cues

### 🔍 OSCILLA Cue Inspector
Document management and debugging tools:
- Inspect cues on selected elements
- Validate cue syntax
- List all cues in document
- Batch operations (find/replace, clear, prefix UIDs)
- Extract all UIDs for reference

## Installation

### Method 1: Manual Installation

1. Locate your Inkscape extensions folder:
   - **Linux**: `~/.config/inkscape/extensions/`
   - **macOS**: `~/Library/Application Support/org.inkscape.Inkscape/config/inkscape/extensions/`
   - **Windows**: `%APPDATA%\inkscape\extensions\`

2. Copy all files to the extensions folder:
   ```
   oscilla_cues.inx
   oscilla_cues.py
   oscilla_quick_cues.inx
   oscilla_quick_cues.py
   oscilla_inspector.inx
   oscilla_inspector.py
   ```

3. Restart Inkscape

### Quick Apply Extensions (Optional but Recommended)

For keyboard-shortcut workflow, also install the quick-apply extensions:

```bash
# Generate the quick-apply files
cd oscilla-inkscape-extension
python3 generate_quick_apply.py

# Copy to extensions folder
cp quick-apply/*.inx quick-apply/*.py ~/.config/inkscape/extensions/
```

Then bind shortcuts in Inkscape:
1. `Edit → Preferences → Interface → Keyboard`
2. Search for "OSCILLA"
3. Assign shortcuts (e.g., `Ctrl+Alt+P` for Pause)

### Method 2: Using the Install Script

```bash
# Linux/macOS
./install.sh

# Or manually:
cp *.inx *.py ~/.config/inkscape/extensions/
```

## Usage

### Accessing the Extensions

After installation, find the extensions under:
**Extensions → OSCILLA →**
- OSCILLA Cue Editor
- OSCILLA Quick Cues
- OSCILLA Cue Inspector

### Basic Workflow

1. **Select** one or more SVG elements in Inkscape
2. Open **Extensions → OSCILLA → OSCILLA Cue Editor**
3. Choose the appropriate **tab** for your cue type
4. Configure the **parameters**
5. Click **Apply**

The selected element's ID will be replaced with the generated OSCILLA cue string.

### Example: Adding a Pause Cue

1. Select a shape that should trigger a pause
2. Open OSCILLA Cue Editor
3. Go to "Timing & Navigation" tab
4. Select "pause" from Cue Type dropdown
5. Set Duration to 8 seconds
6. Check "Show Countdown"
7. Click Apply

Result: Element ID becomes `pause(dur:8, count:true)`

### Example: Adding an Animation

1. Select a shape to animate
2. Open OSCILLA Cue Editor
3. Go to "Animation" tab
4. Select "scale" from Animation Type
5. Set Values to "1,1.5,1"
6. Set Duration to 2
7. Set Loop to 0 (infinite)
8. Click Apply

Result: Element ID becomes `scale(values:[1,1.5,1], dur:2, loop:0)`

### Using Quick Cues

For common operations:

1. Select element(s)
2. Open **OSCILLA Quick Cues**
3. Choose a preset (e.g., "💓 Scale Pulse")
4. Optionally customize values
5. Click Apply

### Combining Multiple Cues

OSCILLA supports multiple cues through:

1. **Nesting groups**: Wrap elements in `<g>` groups, each with its own cue ID
2. **Append mode**: Use the Utility tab's "Append to Existing" action
3. **Propagate**: Apply templates to all children in a group

## Cue Reference

### Timing & Navigation

| Cue | Description | Example |
|-----|-------------|---------|
| `stop()` | Stop playback | `stop(uid:s1)` |
| `pause()` | Pause with duration | `pause(dur:12, count:true)` |
| `speed()` | Change playback speed | `speed(value:0.5, dur:2)` |
| `nav()` | Navigate to target | `nav(scroll@A, repeats:3)` |
| `page()` | Switch page | `page(Pseq([p1,p2],3))` |
| `stopwatch()` | Display timer | `stopwatch(source:new, trig:auto)` |
| `metro()` | Metronome | `metro(bpm:120, visual:hex)` |

### Animation

| Cue | Description | Example |
|-----|-------------|---------|
| `scale()` | Scale animation | `scale(values:[1,1.5,1], dur:2)` |
| `scaleXY()` | Independent X/Y scale | `scaleXY([1,1.3],[1,0.6], dur:1)` |
| `rotate()` | Rotation animation | `rotate(dir:1, dur:2)` |
| `o2p()` | Object-to-path motion | `o2p(path:orbit, dur:8)` |

### Visual Effects

| Cue | Description | Example |
|-----|-------------|---------|
| `color()` | Color transitions | `color(vals:[#f00,#0f0], dur:2)` |
| `fade()` | Opacity animation | `fade(mode:pulse, dur:6)` |
| `text()` | Animated text | `text(src:poem.txt, dur:3)` |

### Audio/Video

| Cue | Description | Example |
|-----|-------------|---------|
| `audio()` | Play audio file | `audio(src:hit.wav, loop:2)` |
| `audioPool()` | Random from directory | `audioPool(path:sfx, mode:rand)` |
| `audioImpulse()` | Stochastic playback | `audioImpulse(path:perc, rate:30)` |
| `video()` | Video playback | `video(file:intro.mp4, size:fs)` |

### Synthesis & OSC

| Cue | Description | Example |
|-----|-------------|---------|
| `synth()` | Web Audio synth | `synth(uid:s1, wave:sine, freq:440)` |
| `synthStop()` | Stop synth | `synthStop(uid:s1, rel:0.5)` |
| `osc()` | OSC event | `osc(addr:v1, pitch:y)` |
| `oscCtrl()` | OSC control lane | `oscCtrl(addr:"/fx/pan", min:-1, max:1)` |

### Interaction

| Cue | Description | Example |
|-----|-------------|---------|
| `button()` | Interactive button | `button(trigger:nav(page3))` |
| `reuse()` | Define collection | `reuse(mainMenu)` |
| `use()` | Use collection | `use(mainMenu)` |
| `propagate()` | Apply to group | `propagate(osc(addr:v, pitch:y))` |

## Troubleshooting

### Extension not appearing
- Ensure all `.inx` and `.py` files are in the extensions folder
- Restart Inkscape
- Check Inkscape's extension error log

### Cue not working in OSCILLA
- Use the Inspector to validate syntax
- Check the OSCILLA browser console for errors
- Ensure element IDs don't have XML-invalid characters

### Multiple cues on one element
- Use nested groups with separate IDs
- Or use the Append action in Utility tab

## Contributing

Issues and pull requests welcome at the OSCILLA repository:
https://github.com/robcanning/oscilla

## License

MIT License - See LICENSE file for details.

## Version History

- **1.0.0** - Initial release
  - Full Cue Editor with all cue types
  - Quick Cues preset system
  - Cue Inspector with validation

## Credits

Created for the [OSCILLA](https://robcanning.github.io/oscilla/docs/) project by Rob Canning.
