# 🎛️ ControlXY Preset Launcher - Complete Guide

## ✨ What It Is

A **hardware-style preset launcher** overlaid directly on your controlXY pads:
- **8 buttons per bank** for instant preset recall
- **Multiple banks** (default: 3, configurable)
- **Touch-friendly** with long-press support
- **Auto-saves** to JSON with your project
- **Visual feedback** - buttons light up when active

Think of it as **memory buttons on a hardware synth**, but for spatial control!

---

## 🚀 Quick Start

### 1. Enable Launcher in DSL

```xml
<rect id="pad1" x="100" y="100" width="600" height="400"
      fill="#222"
      cue="controlXY(uid:pad1, 
                    handle:[dot1,dot2], 
                    label:true, 
                    launcher:8,    
                    banks:3)"/>
```

**Parameters:**
- `launcher:8` - Enable with 8 buttons (can be 4, 6, 8, 10, etc.)
- `banks:3` - Number of banks (default: 3)

### 2. Use the Launcher

**Left-click button** → Recall preset/sequence (instant)
**Right-click button** → Save current state to this slot
**Long-press (touch)** → Save current state to this slot

**Bank navigation:**
- **← Button** → Previous bank
- **→ Button** → Next bank

---

## 📐 Visual Layout

```
┌─────────────────────────────────────────┐
│                                         │
│         ControlXY Pad Area              │
│                                         │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ [←]   Bank: Verse (1/3)   [→]          │ ← Bank Bar
├─────────────────────────────────────────┤
│ [1]  [2]  [3]  [4]  [5]  [6]  [7]  [8] │ ← Slot Buttons
│ Intro Mid  End  ─   ─   ─   ─   ─      │
└─────────────────────────────────────────┘
```

### Button States

**Empty (gray)** - No assignment
```
[1]
Empty
```

**Assigned Preset (blue)** - Preset stored
```
[1]
intro
```

**Assigned Sequence (green)** - Sequence stored
```
[2]
verse_loop
```

**Active (orange)** - Currently recalling (brief flash)
```
[1]
intro ✨
```

---

## 🎯 Usage Workflows

### Workflow 1: Quick Performance Setup (5 minutes)

1. **Position handles** for your intro
2. **Right-click slot 1** → Name it "intro"
3. **Move handles** to verse position
4. **Right-click slot 2** → Name it "verse"
5. **Continue** for chorus, bridge, etc.
6. **Perform:** Left-click buttons 1-2-3-4 to trigger states

### Workflow 2: Sequence Launcher

1. **Create sequences** in UI (Tab 2)
   - "verse_pattern" = loop of presets
   - "chorus_pattern" = another loop
2. **Go to Sequences tab**
3. **Right-click sequence names** in list
4. **Select "Assign to Launcher"**
5. **Choose pad + bank + slot**

### Workflow 3: Multiple Banks for Song Structure

**Bank 1: Intro**
- Slot 1: intro_a
- Slot 2: intro_b
- Slot 3: intro_build
- Slot 4-8: variations

**Bank 2: Verse**
- Slot 1: verse_start
- Slot 2: verse_pattern (sequence)
- Slot 3: verse_end
- Slot 4-8: variations

**Bank 3: Chorus**
- Slot 1: chorus_a
- Slot 2: chorus_big
- Slot 3: chorus_pattern (sequence)
- Slot 4-8: variations

**Performance:** Switch banks with ←→, trigger with 1-8

---

## 💾 Storage Format

Launchers are saved in `controlxy-presets.json`:

```json
{
  "presets": { ... },
  "sequences": { ... },
  "launchers": {
    "pad1": {
      "currentBank": 0,
      "banks": [
        {
          "name": "Bank 1",
          "slots": [
            { "type": "preset", "name": "intro" },
            { "type": "preset", "name": "verse" },
            { "type": "sequence", "name": "verse_loop" },
            null,
            null,
            null,
            null,
            null
          ]
        },
        {
          "name": "Bank 2",
          "slots": [ ... ]
        },
        {
          "name": "Bank 3",
          "slots": [ ... ]
        }
      ]
    }
  }
}
```

---

## 🎨 Customization

### Different Slot Counts

```javascript
// 4 buttons (smaller pads)
controlXY(uid:pad1, handle:dot1, launcher:4, banks:5)

// 10 buttons (larger pads)
controlXY(uid:pad1, handle:dot1, launcher:10, banks:3)

// 12 buttons (wide pads)
controlXY(uid:pad1, handle:dot1, launcher:12, banks:4)
```

### Custom Bank Names (Future Enhancement)

Currently banks are named "Bank 1", "Bank 2", etc.
Coming soon: Custom names via UI or DSL:

```javascript
// Future syntax
controlXY(uid:pad1, 
          handle:dot1, 
          launcher:8,
          bankNames:["Intro","Verse","Chorus"])
```

---

## 🔧 Advanced Features

### Multiple Pads, Multiple Launchers

Each pad gets its own launcher:

```xml
<rect id="pad1" cue="controlXY(uid:pad1, handle:dot1, launcher:8, banks:3)"/>
<rect id="pad2" cue="controlXY(uid:pad2, handle:dot2, launcher:6, banks:2)"/>
```

Both launchers are **independent** and saved separately.

### Keyboard Shortcuts (Coming Soon)

Map keyboard keys to slots:
- `1-8` → Trigger slots 1-8
- `[` `]` → Change banks
- `Shift+1-8` → Store to slots

### MIDI Control (Coming Soon)

Map MIDI notes to slots for hardware control.

---

## 🎛️ UI Integration

### Assigning from Preset List

1. Open preset UI (Alt+Shift+P)
2. Go to **Presets** tab
3. Click a preset name to select it
4. UI shows "Assign to Launcher" options
5. Choose: **Pad → Bank → Slot**
6. Done!

### Assigning from Sequence List

Same process in **Sequences** tab.

### Launcher Manager View

See all launchers, all banks at once:
- Visual grid of all slots
- Drag-and-drop assignment (future)
- Bulk operations (clear bank, copy bank, etc.)

---

## 🎭 Performance Tips

### Tip 1: Organize by Song Section
One bank per section makes navigation intuitive.

### Tip 2: Leave Empty Slots
Don't fill all 8 slots - leave room for improvisation.

### Tip 3: Mix Presets & Sequences
- Presets = instant states
- Sequences = evolving patterns
- Combine both in one bank!

### Tip 4: Visual Memory
Empty slots show slot numbers (1-8).
Learn the positions for blind performance.

### Tip 5: Touch Performance
Long-press works great on tablets/touchscreens.
Practice the 500ms timing.

---

## 🐛 Troubleshooting

### Launcher not appearing?
- Check `launcher:8` is in DSL
- Verify CSS is loaded
- Check console for errors

### Buttons not responding?
- Make sure preset/sequence exists
- Check browser console for errors
- Try clearing and re-assigning

### Right-click doesn't work on touch?
- Use **long-press** (500ms hold)
- Or assign from UI instead

### Banks not saving?
- Make sure project has ID
- Check if presets module is loaded
- Verify server routes are working

### Slots showing wrong names?
- Refresh preset list
- Check JSON file for corruption
- Re-assign slots if needed

---

## 📊 Comparison: Launcher vs UI vs DSL

| Method | Speed | Flexibility | Use Case |
|--------|-------|-------------|----------|
| **Launcher** | ⚡⚡⚡ Instant | 🎛️ 8 slots | Live performance |
| **UI** | ⚡⚡ Fast | 🎛️🎛️🎛️ Unlimited | Composition work |
| **DSL** | ⚡ Timed | 🎛️🎛️ Scripted | Score automation |

**Best practice:** Use all three!
- **Launcher** for live triggering
- **UI** for managing presets/sequences
- **DSL** for playhead-based automation

---

## 🎼 Musical Applications

### Application 1: Live Improvisation
Pre-save 8 interesting states, perform freely between them.

### Application 2: Song Structure Navigation
Bank = section, slot = variation. Navigate song structure live.

### Application 3: Parameter Exploration
Save 8 extreme positions, explore in-between states manually.

### Application 4: Call-Response Patterns
Odd slots = calls, even slots = responses. Alternate rapidly.

### Application 5: Gradual Evolution
Slots 1-8 = progressive changes. Step through slowly.

---

## 🚧 Roadmap (Future Enhancements)

### Phase 1: Core ✅ DONE
- 8-button launcher
- Bank switching
- Right-click/long-press store
- JSON persistence

### Phase 2: UI Polish (Next)
- Launcher manager view
- Drag-and-drop assignment
- Custom bank names
- Bulk operations (clear, copy banks)

### Phase 3: Performance (Soon)
- Keyboard shortcuts
- MIDI mapping
- Transition timing per slot
- Auto-advance mode

### Phase 4: Advanced (Later)
- Multiple launchers per pad
- Vertical/horizontal layouts
- Nested sequence support in slots
- Conditional triggering (if/then)

---

## 🎉 Summary

You now have:
1. ✅ **8-button preset launcher** on each pad
2. ✅ **Multiple banks** (3 default, configurable)
3. ✅ **Instant recall** (left-click)
4. ✅ **Quick store** (right-click/long-press)
5. ✅ **Auto-save** to JSON
6. ✅ **Visual feedback** (colors, states)
7. ✅ **Touch-friendly** (500ms long-press)

**This is a complete performance system!**

Start simple:
- Enable launcher on one pad
- Store 3-4 presets
- Practice triggering

Then expand:
- Use multiple banks
- Mix presets & sequences
- Perform live!

**Score-as-instrument. Touch-as-memory.** 🎛️✨

---

## 📝 DSL Reference

```javascript
// Basic
controlXY(uid:pad1, handle:dot1, launcher:8)

// Custom slots
controlXY(uid:pad1, handle:dot1, launcher:6)

// Custom banks
controlXY(uid:pad1, handle:dot1, launcher:8, banks:5)

// Full config
controlXY(uid:pad1, 
          handle:[dot1,dot2,dot3], 
          label:true,
          launcher:8, 
          banks:3,
          osc:true)
```

**Ready to perform!** 🎵🎹
