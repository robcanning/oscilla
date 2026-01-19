# OSCILLA Inkscape Extension

A smart cue editor for [OSCILLA](https://github.com/robcanning/oscilla) interactive graphic notation.

## Installation

```bash
./install.sh
```

Or manually copy all files to your Inkscape extensions folder:
- Linux: `~/.config/inkscape/extensions/`
- macOS: `~/Library/Application Support/org.inkscape.Inkscape/config/inkscape/extensions/`
- Windows: `%APPDATA%\inkscape\extensions\`

Restart Inkscape after installing.

## Usage

1. **Open the editor:** Extensions → OSCILLA → OSCILLA Smart Cues Editor
2. **Select a category** (Timing, Animation, Visual, Audio/Video, Synth, OSC, Interaction)
3. **Select a cue type** - only relevant parameters are shown
4. **Optionally pick a preset** to auto-fill common values
5. **Adjust parameters** as needed
6. **Click "Apply to Selection"** to queue the cue
7. **In Inkscape:** Select element(s) → Extensions → OSCILLA → Apply Queued Cue

### Keyboard Shortcut (Recommended)

Bind "Apply Queued Cue" to a shortcut for faster workflow:
1. Edit → Preferences → Interface → Keyboard
2. Search for "Apply Queued"
3. Assign a shortcut (e.g., `Ctrl+Shift+Q`)

Then your workflow becomes:
1. Open Smart Cues Editor (keep it open)
2. Configure cue → Click "Apply"
3. Select element in Inkscape → Press `Ctrl+Shift+Q`

## Customizing Presets

Edit `oscilla_presets.json` in your extensions folder to add your own presets.

## Files

- `oscilla_smart_cues_gtk.py` - Main GTK editor
- `oscilla_smart_cues_launcher.py/inx` - Menu entry to launch editor
- `oscilla_apply_cue.py/inx` - Applies queued cue to selection
- `oscilla_presets.json` - Editable presets
