---
title: inkscape_extension
layout: docs_layout.njk
---

# OSCILLA Inkscape Extension
<figure class="doc-image">
  <img
    src="{{ '/docs/img/oscilla-inkscape-extension.png' | url }}"
    alt="Oscilla Inkscape Extension"
  >
  <figcaption>A smart cue editor for creating OSCILLA interactive graphic notation within Inkscape.
 </figcaption>
</figure>



## Overview

The OSCILLA Inkscape Extension provides a graphical interface for applying OSCILLA DSL cues to SVG elements. Instead of manually typing cue syntax into element IDs, you select cue types from organized categories, configure parameters using appropriate widgets, and apply them directly to selected elements.

## Installation

### Automatic Installation

```bash
cd oscilla-inkscape-extension
./install.sh
```

The installer detects your operating system and copies files to the correct Inkscape extensions folder.




### Manual Installation

Copy all files to your Inkscape extensions folder:

| OS | Extensions Path |
|----|-----------------|
| Linux | `~/.config/inkscape/extensions/` |
| macOS | `~/Library/Application Support/org.inkscape.Inkscape/config/inkscape/extensions/` |
| Windows | `%APPDATA%\inkscape\extensions\` |

Restart Inkscape after installation.

## First-Time Setup: Keyboard Shortcut

For efficient workflow, bind "Apply Queued Cue" to a keyboard shortcut:

1. In Inkscape: **Edit → Preferences → Interface → Keyboard**
2. In the search box, type `Apply Queued`
3. Click on the "Apply Queued Cue" entry
4. Press your desired shortcut (recommended: `Ctrl+Shift+Q`)
5. Click **Close**

This shortcut applies cues configured in the Smart Cues Editor to your selected elements.

For detailed keyboard shortcut documentation, see the [Inkscape Keyboard Shortcut Guide](https://inkscape-manuals.readthedocs.io/en/latest/interface.html#keyboard-shortcuts).

## Components

The extension consists of two parts under **Extensions → OSCILLA**:

### OSCILLA Smart Cues Editor

The main interface for building cues. Opens as a floating window that stays on top of Inkscape while you work.

**Note:** The editor cannot dock inside Inkscape - it remains a separate floating window. However, it stays on top so you can see both windows simultaneously.

### Apply Queued Cue

Applies the configured cue to selected elements in Inkscape. Bind this to a keyboard shortcut for the fastest workflow.

## Workflow

### Standard Workflow

1. **Open the Smart Cues Editor:** Extensions → OSCILLA → OSCILLA Smart Cues Editor
2. **Keep the editor open** - it floats above Inkscape
3. **Configure your cue:**
   - Select a category (Timing, Animation, Visual, etc.)
   - Select a cue type
   - Optionally select a preset
   - Adjust parameters as needed
4. **Click "Apply to Selection"** - this queues the cue
5. **In Inkscape:** Select one or more elements
6. **Press your keyboard shortcut** (e.g., `Ctrl+Shift+Q`) - cue is applied!

### Quick Workflow with Presets

Once you've saved presets for your commonly used cues:

1. Open Smart Cues Editor (keep it open)
2. Select preset from dropdown
3. Click "Apply to Selection"
4. Select element in Inkscape → Press `Ctrl+Shift+Q`

### Stacking Multiple Cues

To add multiple cues to one element:

1. Apply the first cue normally
2. Check **Append to existing ID**
3. Configure and apply additional cues

Result: `pause(dur:4) scale(values:[1,1.3,1], dur:2)`

## Using the Smart Cues Editor

### Interface Elements

#### Category Dropdown

Select from seven cue categories:

| Category | Cue Types |
|----------|-----------|
| Timing & Navigation | stop, pause, speed, nav, page, stopwatch, metro |
| Animation | scale, scaleXY, rotate, o2p |
| Visual | color, fade, text |
| Audio / Video | audio, audioPool, audioImpulse, video |
| Synth | synth, synthStop |
| OSC | osc, oscCtrl |
| Interaction | button, reuse, use |

#### Cue Type Dropdown

Shows available cues for the selected category. When you select a cue type, only the relevant parameters appear below.

#### Preset Dropdown

Load pre-configured parameter combinations. Select "-- Custom --" to configure parameters manually.

#### Parameters Area

Dynamic parameter widgets appropriate to each parameter type:

| Widget | Used For |
|--------|----------|
| Text entry | Free text, file paths, color values |
| Spin button | Integer values with increment/decrement |
| Float spinner | Decimal values with precision |
| Dropdown | Fixed option selection |
| Checkbox | Boolean on/off values |
| Color button | Color picker (alongside text entry) |

#### Preview

Shows the cue string as you configure parameters. Updates in real-time. Wraps long cues across multiple lines.

#### Append Checkbox

When checked, the cue is added to the element's existing ID rather than replacing it. Use this to stack multiple cues on one element.

#### Buttons

| Button | Action |
|--------|--------|
| Save Preset | Save current parameters as a reusable preset |
| Copy to Clipboard | Copies the cue string for manual pasting |
| Apply to Selection | Queues the cue for application via keyboard shortcut |

## Presets

### Using Presets

Presets provide quick access to common cue configurations. Select from the Preset dropdown to auto-fill parameters, then adjust as needed.

### Saving Presets

1. Configure parameters as desired
2. Click **Save Preset**
3. Enter a name for the preset
4. Click **Save**

The preset is immediately available in the Smart Cues Editor dropdown.

### Customizing Presets Manually

Presets are stored in `oscilla_presets.json` in your extensions folder. You can edit this file directly.

#### File Location

| OS | Path |
|----|------|
| Linux | `~/.config/inkscape/extensions/oscilla_presets.json` |
| macOS | `~/Library/Application Support/org.inkscape.Inkscape/config/inkscape/extensions/oscilla_presets.json` |
| Windows | `%APPDATA%\inkscape\extensions\oscilla_presets.json` |

#### Structure

```json
{
  "category_id": {
    "cue_name": [
      {
        "name": "Preset Display Name",
        "params": {
          "param_name": value
        }
      }
    ]
  }
}
```

#### Example: Adding Pause Presets

```json
{
  "timing": {
    "pause": [
      {
        "name": "Short Pause (4s)",
        "params": {
          "dur": 4
        }
      },
      {
        "name": "Long Pause with Countdown",
        "params": {
          "dur": 12,
          "count": true
        }
      }
    ]
  }
}
```

#### Category IDs

Use these exact category IDs in the JSON:

| Display Name | Category ID |
|--------------|-------------|
| Timing & Navigation | `timing` |
| Animation | `animation` |
| Visual | `visual` |
| Audio / Video | `audio` |
| Synth | `synth` |
| OSC | `osc` |
| Interaction | `interaction` |

#### Cue Names

Use the exact cue name as shown (case-sensitive):

`stop`, `pause`, `speed`, `nav`, `page`, `stopwatch`, `metro`, `scale`, `scaleXY`, `rotate`, `o2p`, `color`, `fade`, `text`, `audio`, `audioPool`, `audioImpulse`, `video`, `synth`, `synthStop`, `osc`, `oscCtrl`, `button`, `reuse`, `use`

#### Validating Your Presets

After editing, verify the JSON is valid:

```bash
python3 -m json.tool oscilla_presets.json > /dev/null && echo "Valid JSON"
```

Restart the Smart Cues Editor to load updated presets.

## Troubleshooting

### Extension not appearing in menu

1. Restart Inkscape completely
2. Verify files are in the correct extensions folder
3. Check for Python errors: `python3 -c "import oscilla_smart_cues_gtk"`

### Editor won't open

Check the launcher script is executable and Python 3 with GTK is available:

```bash
python3 -c "import gi; gi.require_version('Gtk', '3.0'); from gi.repository import Gtk; print('GTK OK')"
```

### Cue not applying to element

1. Ensure an element is selected in Inkscape
2. Ensure you've clicked "Apply to Selection" in the Smart Cues Editor
3. Press your keyboard shortcut (e.g., `Ctrl+Shift+Q`)
4. If still not working, check `/tmp/oscilla_cue.txt` exists after clicking Apply

### Keyboard shortcut not working

1. Verify the shortcut is bound: Edit → Preferences → Interface → Keyboard → search "Apply Queued"
2. Make sure Inkscape window is focused when pressing the shortcut
3. Try a different shortcut combination if there's a conflict

### Presets not loading

1. Validate JSON syntax: `python3 -m json.tool oscilla_presets.json`
2. Check category and cue names match exactly (case-sensitive)
3. Restart the Smart Cues Editor

### Editor not staying on top

On some systems/window managers, "always on top" may not work. Try:
- Right-click the window title bar → "Always on Top" (if available)
- Use your window manager's settings to pin the window

## Files

| File | Purpose |
|------|---------|
| `oscilla_smart_cues_gtk.py` | Main GTK editor application |
| `oscilla_smart_cues_launcher.py` | Inkscape extension that launches editor |
| `oscilla_smart_cues_launcher.inx` | Menu entry definition |
| `oscilla_apply_cue.py` | Extension that applies cue to selection |
| `oscilla_apply_cue.inx` | Menu entry definition |
| `oscilla_presets.json` | User-editable preset configurations |