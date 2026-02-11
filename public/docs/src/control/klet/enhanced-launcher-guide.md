# 🎛️ Enhanced Launcher - Complete Feature Set

## ✨ All New Features

### 1. **Tween/Jump Toggle** (~)
Switch between smooth tweening and instant jumps

### 2. **Preset/Sequence Mode** (P/S)
Toggle between two modes:
- **P mode**: Manually assigned presets (original behavior)
- **S mode**: Auto-filled from sequence list (8 per bank)

### 3. **Hide Launcher** (👁)
Temporarily hide the launcher overlay

### 4. **Undock Launcher** (⧉)
Open launcher in separate draggable window (multi-monitor support!)

---

## 🎮 Button Layout

```
┌────────────────────────────────────────────┐
│ [←] Bank 1 (1/3) [→] [P] [~] [👁] [⧉]    │
├────────────────────────────────────────────┤
│ [1]  [2]  [3]  [4]  [5]  [6]  [7]  [8]   │
└────────────────────────────────────────────┘

Legend:
[←][→] = Bank navigation
[P/S]  = Preset/Sequence mode toggle
[~]    = Tween/Jump toggle
[👁]    = Hide launcher
[⧉]    = Undock to separate window
```

---

## 🎯 Feature Details

### Tween/Jump Toggle (~)

**Active (orange)** = Tween enabled
- Presets recall with 1-second smooth animation
- Sequences play with smooth transitions

**Inactive (gray)** = Jump mode
- Presets recall instantly (0 seconds)
- Sequences start immediately

**Use cases:**
- **Tween ON**: Smooth performance, gradual changes
- **Jump OFF**: Instant cuts, rhythmic triggering

### Preset/Sequence Mode (P/S)

#### **P Mode (Preset)**
- Shows manually assigned presets
- Right-click to store current state
- Each bank has independent slots
- Original behavior

#### **S Mode (Sequence)**
- Auto-fills from your sequence list
- Bank 1 = sequences 1-8
- Bank 2 = sequences 9-16
- Bank 3 = sequences 17-24
- **No manual assignment needed!**
- Perfect for triggering many sequences

**Workflow:**
1. Create 20 sequences in UI
2. Switch to S mode
3. Navigate banks to access all 20
4. One-click triggering!

### Hide Launcher (👁)

Temporarily hide the overlay:
- Click 👁 to hide
- Launcher disappears
- To restore: `window.controlXYLauncher.show('pad1')`

**Use cases:**
- Clean view during composition
- Screenshots without UI
- Focus on score

### Undock Launcher (⧉)

Open launcher in **separate browser window**:
- Draggable to second monitor
- Stays in sync with main window
- Independent controls
- Auto-updates every second

**Use cases:**
- Multi-monitor performances
- Separate control surface
- Collaborative work (one person controls, another watches)

**Perfect for live performance!**

---

## 🎪 Complete Usage Guide

### Example 1: Quick Preset Performance

```xml
<rect id="pad1" cue="controlXY(uid:pad1, handle:dot1, launcher:8)"/>
```

1. Move handles to 8 different positions
2. Right-click slots 1-8 to save each
3. **Toggle tween OFF** (~) for instant cuts
4. Perform: Click slots for instant recall

### Example 2: Sequence Launcher

```xml
<rect id="pad1" cue="controlXY(uid:pad1, handle:dot1, launcher:8, banks:3)"/>
```

1. Create 20+ sequences in UI
2. Click **P** to switch to **S mode**
3. Bank 1 shows sequences 1-8
4. Bank 2 shows sequences 9-16
5. Bank 3 shows sequences 17-24
6. **Toggle tween ON** (~) for smooth playback
7. Perform: Navigate banks, trigger sequences

### Example 3: Undocked Control

```xml
<rect id="pad1" cue="controlXY(uid:pad1, handle:[dot1,dot2], launcher:8)"/>
```

1. Click **⧉** to undock
2. Drag window to second monitor
3. Main window shows score
4. Control window shows launcher
5. Click slots in control window
6. Score updates in main window
7. **Perfect for presentations!**

### Example 4: Mixed Mode Performance

1. **Bank 1 (P mode)**: Your 8 favorite presets
2. **Bank 2-3 (S mode)**: Switch to S, access sequences
3. Switch between P and S mid-performance!

---

## 🔧 Console Commands

### Show/Hide Launcher
```javascript
// Hide
window.controlXYLauncher.hide('pad1');

// Show
window.controlXYLauncher.show('pad1');
```

### Undock Programmatically
```javascript
window.controlXYLauncher.undock('pad1');
```

### Check State
```javascript
const state = window.controlXYPresets._store.launchers.pad1;
console.log('Mode:', state.mode);       // 'preset' or 'sequence'
console.log('Tween:', state.tween);     // true or false
console.log('Visible:', state.visible); // true or false
```

---

## 💾 Storage Format

```json
{
  "launchers": {
    "pad1": {
      "currentBank": 0,
      "mode": "preset",
      "tween": true,
      "visible": true,
      "banks": [
        {
          "name": "Bank 1",
          "slots": [
            { "type": "preset", "name": "intro" },
            { "type": "sequence", "name": "verse_loop" },
            null,
            ...
          ]
        }
      ]
    }
  }
}
```

All settings persist across sessions!

---

## 🎨 Visual States

### Mode Button (P/S)
- **P** = Blue = Preset mode
- **S** = Green = Sequence mode

### Tween Button (~)
- **Orange** = Tween ON (smooth)
- **Gray** = Jump (instant)

### Slots
- **Gray** = Empty
- **Blue** = Preset assigned
- **Green** = Sequence assigned
- **Orange flash** = Currently active

---

## 🚀 Advanced Tips

### Tip 1: Hybrid Banks
- Bank 1: P mode with carefully chosen presets
- Banks 2-3: S mode for quick sequence access
- Toggle between as needed!

### Tip 2: Tween for Transitions
- Turn tween ON (~) for section changes
- Turn tween OFF for rhythmic triggering
- Change mid-performance!

### Tip 3: Multi-Monitor Setup
1. Undock launcher to second screen
2. Make undocked window fullscreen (F11)
3. Use as dedicated control surface
4. Main screen shows score to audience

### Tip 4: Sequence Mode Organization
- Name sequences with numbers: `01_intro`, `02_verse`
- They'll sort alphabetically
- Banks align with sets of 8

### Tip 5: Hide During Recording
- Hide launcher (👁) for clean recordings
- Show when you need controls
- No need to reposition

---

## 🎹 Keyboard Shortcuts (Future)

Coming soon:
- `1-8` = Trigger slots
- `[` `]` = Change banks
- `P` = Toggle mode
- `T` = Toggle tween
- `H` = Hide/show
- `U` = Undock

---

## 🔍 Troubleshooting

### Undocked window shows empty?
- Make sure parent window stays open
- Check browser console for errors
- Try allowing popups

### Sequence mode shows empty slots?
- Make sure you have sequences defined
- Check: `Object.keys(window.controlXYPresets._store.sequences)`
- Create some sequences first!

### Tween not working?
- Check button is orange (active)
- Try toggling off and on
- Verify preset exists

### Can't restore hidden launcher?
```javascript
window.controlXYLauncher.show('pad1');
```

---

## 📊 Feature Matrix

| Feature | Preset Mode | Sequence Mode |
|---------|-------------|---------------|
| **Slots** | 8 per bank | 8 per bank |
| **Assignment** | Manual (right-click) | Auto (from list) |
| **Storage** | Saved in banks | Read from sequences |
| **Use case** | Curated favorites | Full sequence library |
| **Tween** | ✅ Works | ✅ Works |
| **Undock** | ✅ Works | ✅ Works |
| **Hide** | ✅ Works | ✅ Works |

---

## 🎉 Summary

You now have:
1. ✅ **Tween/Jump toggle** - Smooth or instant
2. ✅ **Preset/Sequence modes** - Two ways to fill slots
3. ✅ **Hide launcher** - Clean view when needed
4. ✅ **Undock launcher** - Multi-monitor support
5. ✅ **Auto-save all settings** - Persists across sessions
6. ✅ **Full state control** - Console commands available

**This is a complete performance control system!**

### Quick Start:
1. Enable launcher: `launcher:8` in DSL
2. Try **S mode** for sequence triggering
3. Toggle **tween** for smooth/instant
4. **Undock** for multi-monitor setup
5. **Perform!**

**Score-as-instrument. Control-as-performance.** 🎛️🎪✨
