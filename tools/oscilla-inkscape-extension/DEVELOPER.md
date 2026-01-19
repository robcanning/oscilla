# OSCILLA Inkscape Extension - Developer Documentation

## Overview

The OSCILLA Inkscape Extension provides a GUI for applying OSCILLA DSL cues to SVG elements within Inkscape. Rather than manually editing element IDs, users can select cue types, configure parameters through appropriate widgets, and apply them to selected elements.

**Repository:** Part of [OSCILLA](https://github.com/robcanning/oscilla)  
**Location:** `tools/inkscape-extension/`  
**Version:** 2.0.0  
**License:** Same as OSCILLA project

---

## Architecture

### Design Constraints

Inkscape's extension system has significant limitations:

1. **Static INX dialogs** - Parameter dialogs defined in INX XML cannot dynamically show/hide fields based on user selection
2. **Blocking execution** - Extensions using GTK's `Gtk.main()` block Inkscape's event loop, causing "Not Responding" state
3. **No direct document access from external processes** - A standalone GTK app cannot directly modify the Inkscape document

### Solution: Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         INKSCAPE                                │
│  ┌─────────────────┐    ┌─────────────────────────────────┐    │
│  │ Smart Cues      │    │ Apply Queued Cue                │    │
│  │ Launcher (.inx) │    │ Extension (.inx + .py)          │    │
│  │                 │    │                                 │    │
│  │ Spawns ─────────┼────┼──► Reads /tmp/oscilla_cue.txt   │    │
│  │ subprocess      │    │    Sets element ID              │    │
│  └────────┬────────┘    └─────────────────────────────────┘    │
│           │                           ▲                         │
└───────────┼───────────────────────────┼─────────────────────────┘
            │                           │
            ▼                           │
┌─────────────────────────────────────────────────────────────────┐
│              OSCILLA Smart Cues GTK Editor                      │
│              (Separate Process)                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Dynamic UI - shows only relevant parameters           │   │
│  │ • Presets from JSON config                              │   │
│  │ • Live preview of cue string                            │   │
│  │ • Writes to /tmp/oscilla_cue.txt ───────────────────────┼───┘
│  │ • Optionally triggers Inkscape via xdotool              │
│  └─────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Inter-Process Communication

Communication between the GTK editor and Inkscape uses a **temp file protocol**:

| File | Purpose |
|------|---------|
| `/tmp/oscilla_cue.txt` | Contains the cue string to apply |

**Protocol:**
1. GTK editor writes cue string to temp file
2. If append mode: prefix with `APPEND:`
3. "Apply Queued Cue" extension reads file, applies to selection, deletes file

**Optional automation:**
- GTK editor can trigger Inkscape extension via `xdotool` sending `Ctrl+Shift+Q`
- Requires user to bind "Apply Queued Cue" to that shortcut

---

## File Structure

```
oscilla-inkscape-extension/
├── oscilla_smart_cues_gtk.py      # Main GTK editor (36KB)
├── oscilla_smart_cues_launcher.py # Inkscape extension to spawn GTK editor
├── oscilla_smart_cues_launcher.inx# Menu entry for launcher
├── oscilla_apply_cue.py           # Extension to apply queued cue
├── oscilla_apply_cue.inx          # Menu entry for apply
├── oscilla_presets.json           # User-editable presets
├── install.sh                     # Installation script
└── README.md                      # User documentation
```

---

## Component Details

### 1. Smart Cues GTK Editor (`oscilla_smart_cues_gtk.py`)

**Purpose:** Provides a dynamic GUI for configuring OSCILLA cues.

**Key Classes:**

#### `CueParameter`
Defines a single parameter with its widget type and constraints.

```python
CueParameter(
    name,        # Parameter name in cue syntax
    label,       # Display label
    widget_type, # 'entry', 'spin', 'float', 'combo', 'check', 'color', 'file'
    default,     # Default value
    options,     # List of options for combo
    min_val,     # Minimum for numeric
    max_val,     # Maximum for numeric
    step,        # Step increment
    tooltip      # Help text
)
```

#### `CUE_DEFINITIONS`
Dictionary defining all cue types organized by category:

```python
CUE_DEFINITIONS = {
    "category_id": {
        "label": "Display Name",
        "cues": {
            "cue_name": {
                "label": "Cue Display Name",
                "params": [CueParameter(...), ...]
            }
        }
    }
}
```

**Categories:**
- `timing` - stop, pause, speed, nav, page, stopwatch, metro
- `animation` - scale, scaleXY, rotate, o2p
- `visual` - color, fade, text
- `audio` - audio, audioPool, audioImpulse, video
- `synth` - synth, synthStop
- `osc` - osc, oscCtrl
- `interaction` - button, reuse, use

#### `OscillaSmartCuesWindow`
Main GTK window class.

**Key Methods:**

| Method | Purpose |
|--------|---------|
| `__init__()` | Build UI: category/cue/preset combos, params area, preview, buttons |
| `populate_cue_combo()` | Update cue dropdown when category changes |
| `populate_preset_combo()` | Update preset dropdown when cue type changes |
| `build_params_ui()` | Dynamically create parameter widgets for selected cue |
| `create_param_widget(param)` | Factory method for appropriate GTK widget |
| `build_cue_string()` | Assemble cue string from current parameter values |
| `update_preview()` | Update preview TextView with current cue string |
| `on_apply_clicked()` | Write to temp file, optionally trigger Inkscape |
| `trigger_inkscape_apply()` | Attempt to auto-trigger via xdotool |

**Widget Types:**

| Type | GTK Widget | Notes |
|------|------------|-------|
| `entry` | `Gtk.Entry` | Free text input |
| `spin` | `Gtk.SpinButton` | Integer values |
| `float` | `Gtk.SpinButton` | Float values (2 decimal places) |
| `combo` | `Gtk.ComboBoxText` | Dropdown selection |
| `check` | `Gtk.CheckButton` | Boolean toggle |
| `color` | `Gtk.Entry` + `Gtk.ColorButton` | Hex color with picker |
| `file` | `Gtk.Entry` | File path (no browser yet) |

### 2. Launcher Extension (`oscilla_smart_cues_launcher.py`)

**Purpose:** Inkscape menu entry that spawns the GTK editor as a subprocess.

**Key Implementation:**

```python
subprocess.Popen(
    [sys.executable, editor_script],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    stdin=subprocess.DEVNULL,
    start_new_session=True,  # Detach from Inkscape
    close_fds=True
)
```

**Important:** Uses `start_new_session=True` to fully detach the subprocess, preventing Inkscape from blocking.

### 3. Apply Queued Cue Extension (`oscilla_apply_cue.py`)

**Purpose:** Reads cue from temp file and applies to selected elements.

**Logic:**

```python
def effect(self):
    # Read temp file
    with open("/tmp/oscilla_cue.txt", 'r') as f:
        cue = f.read().strip()
    
    # Check for append mode
    if cue.startswith("APPEND:"):
        append_mode = True
        cue = cue[7:]
    
    # Apply to all selected elements
    for elem in self.svg.selection.values():
        if append_mode:
            new_id = f"{elem.get('id', '')} {cue}"
        else:
            new_id = cue
        elem.set("id", new_id)
    
    # Clean up
    os.remove("/tmp/oscilla_cue.txt")
```

### 4. INX Files

**Format:** Inkscape extension XML format.

**Launcher INX (minimal, no params = no dialog):**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<inkscape-extension xmlns="http://www.inkscape.org/namespace/inkscape/extension">
  <name>OSCILLA Smart Cues Editor</name>
  <id>org.oscilla.smart_cues_launcher</id>
  <effect needs-live-preview="false">
    <object-type>all</object-type>
    <effects-menu>
      <submenu name="OSCILLA"/>
    </effects-menu>
  </effect>
  <script>
    <command location="inx" interpreter="python">oscilla_smart_cues_launcher.py</command>
  </script>
</inkscape-extension>
```

**Note:** Must use `<name>` not `<n>` for Inkscape to recognize the extension.

### 5. Presets (`oscilla_presets.json`)

**Structure:**

```json
{
  "category_id": {
    "cue_name": [
      {
        "name": "Preset Display Name",
        "params": {
          "param_name": value,
          ...
        }
      }
    ]
  }
}
```

**Example:**

```json
{
  "timing": {
    "pause": [
      {"name": "Short Pause (4s)", "params": {"dur": 4}},
      {"name": "Pause with Countdown", "params": {"dur": 8, "count": true}}
    ]
  }
}
```

---

## Cue String Generation

### General Pattern

Most cues follow: `cueName(param1:value1, param2:value2, ...)`

### Special Cases

Several cues have non-standard syntax requiring special handling in `build_cue_string()`:

#### nav
```python
# Target is positional, not named
"nav(page1)"
"nav(scroll@A, repeats:3)"
```

#### page with patterns
```python
# Pattern functions wrap page list
"page(Pseq([page1,page2,page3],2))"
"page(Pchoose([pageA,pageB]))"
```

#### osc pitch types
```python
# Pitch uses nested function syntax
"osc(addr:voice1, pitch:y)"
"osc(addr:voice1, pitch:hz(440))"
"osc(addr:voice1, pitch:midi(60))"
"osc(addr:voice1, pitch:deg(2,4))"
```

#### synth filter
```python
# Filter is nested object
"synth(uid:s1, wave:sine, freq:440, filter:{type:lp,freq:800})"
```

#### Arrays
```python
# Values/vals parameters use brackets
"scale(values:[1,1.3,1], dur:2)"
"color(vals:[#f00,#0f0,#00f], dur:3)"
```

---

## Adding New Cue Types

### Step 1: Update CUE_DEFINITIONS

Add to appropriate category in `oscilla_smart_cues_gtk.py`:

```python
"newCue": {
    "label": "New Cue Display Name",
    "params": [
        CueParameter("param1", "Label", "entry", "default"),
        CueParameter("param2", "Number", "float", 1.0, min_val=0, max_val=10),
        CueParameter("mode", "Mode", "combo", "", options=["", "opt1", "opt2"]),
    ]
}
```

### Step 2: Add Build Method (if special syntax needed)

```python
def build_newcue(self):
    params = []
    # ... assemble params ...
    return f"newCue({', '.join(params)})"
```

### Step 3: Update build_cue_string()

Add case in the category handler:

```python
elif cue_type == "newCue":
    cue = self.build_newcue()
```

### Step 4: Add Presets (optional)

Add to `oscilla_presets.json`:

```json
"category": {
  "newCue": [
    {"name": "Basic", "params": {"param1": "value"}},
    {"name": "Advanced", "params": {"param1": "x", "param2": 5}}
  ]
}
```

---

## Platform Considerations

### Linux
- **Primary platform** - fully supported
- GTK3 native
- xdotool available for auto-trigger

### macOS
- GTK3 bundled with Inkscape
- xdotool not available - manual two-step workflow
- Some visual quirks possible

### Windows
- GTK3 bundled with Inkscape
- xdotool not available
- Temp file path needs adjustment: use `os.environ.get('TEMP')` or `tempfile` module
- `start_new_session` not available - use `creationflags=DETACHED_PROCESS`

**Windows compatibility TODO:**

```python
import platform
if platform.system() == 'Windows':
    import tempfile
    TEMP_CUE_FILE = os.path.join(tempfile.gettempdir(), 'oscilla_cue.txt')
else:
    TEMP_CUE_FILE = '/tmp/oscilla_cue.txt'
```

---

## Testing

### Manual Testing Checklist

1. **Installation**
   - [ ] install.sh detects OS correctly
   - [ ] Files copied to correct location
   - [ ] Extension appears in menu after Inkscape restart

2. **GTK Editor**
   - [ ] Opens without blocking Inkscape
   - [ ] Category dropdown populates cue types
   - [ ] Cue type dropdown shows only relevant parameters
   - [ ] Preset dropdown loads and applies values
   - [ ] Preview updates in real-time
   - [ ] All widget types function correctly

3. **Cue Generation**
   - [ ] Each cue type generates valid syntax
   - [ ] Arrays formatted with brackets
   - [ ] Special cases (nav, page, osc, synth filter) correct
   - [ ] Empty/default values omitted appropriately

4. **Apply Workflow**
   - [ ] Temp file created on "Apply to Selection"
   - [ ] "Apply Queued Cue" reads and applies
   - [ ] Append mode works
   - [ ] Temp file deleted after apply
   - [ ] Auto-trigger via xdotool (Linux)

### Automated Testing

Currently no automated tests. Recommended additions:

```python
# test_cue_generation.py
def test_pause_cue():
    # Mock the options
    options = MockOptions(pause_dur=8, pause_count=True)
    editor = OscillaSmartCues()
    editor.options = options
    assert editor.build_pause() == "pause(dur:8, count:true)"
```

---

## Troubleshooting

### Extension not appearing in menu

1. Check INX has `<name>` not `<n>`
2. Clear Inkscape cache: `rm -rf ~/.cache/inkscape/extensions/`
3. Check for Python syntax errors: `python3 -m py_compile *.py`

### "Not Responding" when opening editor

- Ensure launcher uses `subprocess.Popen` with `start_new_session=True`
- Never use `Gtk.main()` inside an Inkscape extension directly

### Cue not applying

1. Check temp file exists: `cat /tmp/oscilla_cue.txt`
2. Verify element is selected in Inkscape
3. Check for error dialogs from Apply Queued Cue

### xdotool auto-trigger not working

1. Install xdotool: `sudo apt install xdotool`
2. Bind Apply Queued Cue to `Ctrl+Shift+Q` in Inkscape preferences
3. Ensure Inkscape window can receive focus

---

## Future Enhancements

### Planned

- [ ] Windows temp file path compatibility
- [ ] File browser button for audio/video sources
- [ ] Validation of cue syntax before apply
- [ ] Undo support (store previous ID)
- [ ] Batch apply to multiple elements with variations

### Potential

- [ ] Direct DBus communication with Inkscape (Linux)
- [ ] Live preview in Inkscape (highlight affected elements)
- [ ] Import/export preset collections
- [ ] Cue templates with placeholders
- [ ] Integration with OSCILLA score validator

---

## Contributing

1. Fork the OSCILLA repository
2. Create feature branch: `git checkout -b feature/extension-improvement`
3. Make changes in `tools/inkscape-extension/`
4. Test on all available platforms
5. Update this documentation if adding features
6. Submit pull request

---

## References

- [Inkscape Extensions Documentation](https://inkscape.org/develop/extensions/)
- [INX File Format](https://wiki.inkscape.org/wiki/index.php/INX_extension_descriptor_format)
- [inkex Python API](https://inkscape.gitlab.io/extensions/documentation/)
- [OSCILLA DSL Specification](../cheatsheet.md)
- [GTK3 Python Tutorial](https://python-gtk-3-tutorial.readthedocs.io/)
