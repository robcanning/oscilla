# Oscilla Developer Guide: Adding a New Cue Type

This guide walks through the complete process of adding a new cue type to Oscilla, using the `color()` / `colour()` animation cue as a case study.

---

## Overview

Adding a new cue type requires modifications to four key files:

| File | Purpose |
|------|---------|
| `oscillaParser.js` | Token definition, grammar rules, AST extraction |
| `oscilla<CueName>.js` | The cue handler implementation |
| `oscillaCueDispatcher.js` | Playhead-triggered cue dispatch |
| `oscillaAnimation.js` | Load-time cue assignment (for animation cues) |

The general flow is:

```
SVG element ID → Parser → AST → Dispatcher/Assignment → Handler
```

---

## Step 1: Define the Token (Parser)

Tokens are the lexical building blocks. Add your cue keyword to `oscillaParser.js`.

### Location
Near the top of the file, after other keyword tokens (around line 80-90).

### Pattern
```javascript
const Color = createToken({ 
    name: "Color", 
    pattern: /\b(color|colour)\b/,  // supports both spellings
    longer_alt: Identifier 
});
```

### Key Points
- Use `\b` word boundaries to prevent partial matches
- `longer_alt: Identifier` ensures the token doesn't consume longer identifiers
- For aliases (like `color`/`colour`), use regex alternation: `(color|colour)`

### Add to Token Array
Find the `allTokens` array and add your token:

```javascript
export const allTokens = [
  Cue, Fade, Page, Stopwatch, Video, Text, Pause, Stop,
  Audio, AudioPool, AudioImpulse, Synth, Button, Nav,
  Rotate, Scale, ScaleXY, O2P, Color, Ui,  // ← Color added here
  // ...
];
```

**Important:** Token order matters. More specific tokens should come before `Identifier`.

---

## Step 2: Add Parser Rule (Parser)

Parser rules define the grammar structure for your cue.

### Location
Inside the `CueParser` class constructor, after similar cue rules (around line 860-870).

### Pattern for Animation Cues
Animation cues (like rotate, scale, color) use a shared parameter list:

```javascript
$.RULE("cueColorTop", () => {
    $.CONSUME(Color);
    $.SUBRULE($.animGenericParamList);
});
```

The `animGenericParamList` rule handles:
- Parentheses `()`
- Key-value pairs `dur:2, loop:0`
- Arrays `vals:[1, 2, 3]`
- Patterns `vals:Pseq([a, b], 3)`
- Nested functions `prestate:fadein(500)`

### Add to cueTop Alternatives
Find the `cueTop` rule and add your new rule as an alternative:

```javascript
$.RULE("cueTop", () => {
    // ...
    $.OR([
        // ... existing alternatives ...
        { ALT: () => $.SUBRULE($.cueRotateTop) },
        { ALT: () => $.SUBRULE($.cueScaleTop) },
        { ALT: () => $.SUBRULE($.cueO2PTop) },
        { ALT: () => $.SUBRULE($.cueColorTop) },  // ← Add here
        { ALT: () => $.SUBRULE($.cueOscTop) },
        // ...
    ]);
});
```

---

## Step 3: Add AST Extraction (Parser)

The CST (Concrete Syntax Tree) must be converted to an AST (Abstract Syntax Tree).

### Location
In the `cstToAst()` function, near the end (around line 2480-2490).

### Pattern
```javascript
const colorNode = cst.children?.cueColorTop?.[0] || 
                  (cst.name === "cueColorTop" ? cst : null);
if (colorNode) {
    return { type: "cueColor", args: extractAnimKvArgs(colorNode) };
}
```

### AST Structure
The resulting AST looks like:
```javascript
{
    type: "cueColor",
    args: [
        { key: "vals", value: ["#f00", "#0f0", "#00f"] },
        { key: "dur", value: 2 },
        { key: "mode", value: "alt" }
    ]
}
```

---

## Step 4: Create the Handler Module

Create a new file `oscillaAnimationColor.js` (or `oscilla<CueName>.js`).

### Module Structure

```javascript
// oscillaAnimationColor.js

// ============================================================
// IMPORTS
// ============================================================
import { registerAnimation } from "./oscillaAnimation.js";
import { scheduleCueStart } from "./oscillaCueDispatcher.js";
import { createHitLabel } from "./oscillaHitLabels.js";
import {
    applyPrestateBeforeStart,
    applyPrestateOnStart,
    installOscToggleHandler,
    armGhostClickable,
    needsArming,
    needsFadeIn,
    triggerFadeIn,
    isOscEnabled
} from "./oscillaAnimationShared.js";
import { sendOSCMessage, createOscOverlay } from "./oscillaOSC.js";

// ============================================================
// INTERNAL UTILITIES
// ============================================================

// Pattern generator (reusable across animation types)
function makePatternGenerator(pattern) {
    // ... implementation
}

// Cue-specific utilities
function parseColorToHSL(colorStr) {
    // ... implementation
}

// ============================================================
// ANIMATION ENGINES
// ============================================================

// Different modes may need different engines
function handleColorHueCycle(el, cfg) {
    // Continuous hue cycling implementation
}

function handleColorSequence(el, cfg) {
    // Discrete color sequence implementation
}

// ============================================================
// MAIN CUE HANDLER (exported)
// ============================================================
export function handleColorCue(el, astArgs, options = {}) {
    // ... implementation
}

export default { handleColorCue };
```

### Handler Function Anatomy

```javascript
export function handleColorCue(el, astArgs, options = {}) {
    if (!el) return;
    
    const { fromCueTrigger = false } = options;
    
    // ─────────────────────────────────────────────────
    // 1. CHECK FOR RE-TRIGGER (ghostClickable, fadein)
    // ─────────────────────────────────────────────────
    const existingCfg = el._oscillaCfg;
    
    if (fromCueTrigger && existingCfg && existingCfg._ghostClickable) {
        if (needsArming(existingCfg)) {
            armGhostClickable(el, existingCfg);
        }
        return;
    }
    
    // ─────────────────────────────────────────────────
    // 2. PARSE COMMON PARAMETERS
    // ─────────────────────────────────────────────────
    let trig = "auto";
    let uid = el.id || ("color_" + Math.random().toString(36).slice(2));
    let cfgStartDelay = 0;
    let prestate = "show";
    
    for (const a of astArgs) {
        const key = a.key || a.type;
        const val = a.value;
        
        if (key === "trig") trig = String(val).toLowerCase();
        if (key === "uid") uid = String(val).trim();
        if (key === "tdelay") cfgStartDelay = Number(val) || 0;
        if (key === "prestate" && val != null) prestate = val;
    }
    
    const shouldStartNow = fromCueTrigger || trig === "auto" || trig === "playhead";
    
    // ─────────────────────────────────────────────────
    // 3. BUILD BASE CONFIG
    // ─────────────────────────────────────────────────
    const baseCfg = {
        uid,
        trig,
        start: cfgStartDelay,
        prestate,
        astArgs,
        fromCueTrigger,
        kind: "color",
        _anim: null
    };
    
    // ─────────────────────────────────────────────────
    // 4. DETERMINE MODE & DISPATCH
    // ─────────────────────────────────────────────────
    const valsArg = astArgs.find(a => a.key === "vals" || a.type === "vals");
    
    // Check for hue cycling mode
    if (valsArg?.value === "hue" || valsArg?.value?.name === "hue") {
        const cfg = { ...baseCfg, mode: "hue-cycle" };
        setupAndStart(el, cfg, handleColorHueCycle, shouldStartNow);
        return;
    }
    
    // Check for pattern sequence
    if (valsArg?.value?.type === "pattern") {
        const cfg = { ...baseCfg, pattern: valsArg.value, mode: "sequence-pattern" };
        setupAndStart(el, cfg, handleColorSequence, shouldStartNow);
        return;
    }
    
    // Array sequence
    if (Array.isArray(valsArg?.value)) {
        const cfg = { ...baseCfg, values: valsArg.value, mode: "sequence" };
        setupAndStart(el, cfg, handleColorSequence, shouldStartNow);
        return;
    }
}

// Helper to avoid repetition
function setupAndStart(el, cfg, engineFn, shouldStartNow) {
    el._oscillaCfg = cfg;
    
    installOscToggleHandler(el, cfg);
    applyPrestateBeforeStart(el, cfg);
    
    const rawStart = () => engineFn(el, cfg);
    const start = wrapStart(cfg, rawStart);
    
    registerAnimation(el, `color-${cfg.mode}`, cfg, start);
    
    createHitLabel(el, "color", cfg.uid, {
        anchorMode: "center",
        color: "magenta",
        sizeMode: "follow"
    });
    
    if (shouldStartNow) start();
}
```

### Start Function Wrapper

The `wrapStart` pattern handles delayed starts and prestate transitions:

```javascript
function wrapStart(cfg, rawStartFn) {
    cfg._start = rawStartFn;
    cfg._applyPrestateOnStart = () => applyPrestateOnStart(el, cfg);
    
    return () => {
        if (cfg.start > 0) {
            scheduleCueStart(
                cfg,
                el,
                () => {
                    if (cfg._ghostClickable && cfg._startBlocked) {
                        applyPrestateOnStart(el, cfg);
                        return;
                    }
                    applyPrestateOnStart(el, cfg);
                    rawStartFn();
                },
                cfg.uid
            );
        } else {
            if (cfg._ghostClickable && cfg._startBlocked) {
                applyPrestateOnStart(el, cfg);
                return;
            }
            applyPrestateOnStart(el, cfg);
            rawStartFn();
        }
    };
}
```

---

## Step 5: Register in Dispatcher

Add your handler to `oscillaCueDispatcher.js` for playhead-triggered execution.

### Add Import
```javascript
import { handleRotateCue } from "./oscillaAnimationRotate.js";
import { handleScaleCue } from "./oscillaAnimationScale.js";
import { handleO2PCue } from "./oscillaAnimationO2p.js";
import { handleColorCue } from "./oscillaAnimationColor.js";  // ← Add
```

### Add Case in Switch
Find the cue dispatch switch statement (around line 290-400):

```javascript
case "cueO2P": {
    handleO2PCue(cueElement, ast.args, { fromCueTrigger: true });
    triggerNestedCues(ast, cueElement);
    return;
}

case "cueColor": {  // ← Add this case
    handleColorCue(cueElement, ast.args, { fromCueTrigger: true });
    triggerNestedCues(ast, cueElement);
    return;
}

case "cueOsc": {
    // ...
}
```

**Key Points:**
- Pass `{ fromCueTrigger: true }` to indicate playhead activation
- Call `triggerNestedCues()` if your cue can contain nested cues

---

## Step 6: Register in Animation Assignment

For animation cues that should activate on page load (auto-start), add to `oscillaAnimation.js`.

### Add Import
```javascript
import { handleScaleCue } from "./oscillaAnimationScale.js";
import { handleRotateCue } from "./oscillaAnimationRotate.js";
import { handleO2PCue } from "./oscillaAnimationO2p.js";
import { handleColorCue } from "./oscillaAnimationColor.js";  // ← Add
```

### Add Case in animationAssign
```javascript
switch (ast.type) {
    case "cueScale":
        handleScaleCue(ast, el);
        break;

    case "cueRotate":
        handleRotateCue(el, ast.args);
        break;

    case "cueO2P":
        handleO2PCue(el, ast.args);
        break;

    case "cueColor":  // ← Add this case
        handleColorCue(el, ast.args);
        break;

    // ...
}
```

---

## Common Parameters

Most animation cues support these shared parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | string | Unique identifier for the animation |
| `trig` | `auto` \| `playhead` | Trigger mode |
| `tdelay` | number | Delay before start (seconds) |
| `prestate` | `show` \| `hide` \| `ghost` \| `fadein(ms)` \| `ghostClickable(...)` | Initial visibility state |
| `dur` | number \| pattern | Duration per cycle |
| `loop` | number | Repeat count (0 = infinite) |
| `osc` | 0 \| 1 \| 2 | OSC output mode |
| `oscaddr` | string | Custom OSC address |

---

## Pattern Support

Oscilla patterns work across all animation cues:

```javascript
// Sequential
vals:Pseq([a, b, c], 3)     // Play a,b,c three times

// Random (with repeats)
vals:Prand([a, b, c], inf)  // Random selection, may repeat

// Random (no repeats)
vals:Pxrand([a, b, c], inf) // Random, never same twice in a row

// Shuffled
vals:Pshuf([a, b, c], 2)    // Shuffle, play through twice
```

### Pattern Generator Template

```javascript
function makePatternGenerator(pattern) {
    if (!pattern?.values || !Array.isArray(pattern.values)) {
        return { next: () => null };
    }

    const values = pattern.values.slice();
    let repeats = pattern.repeats ?? Infinity;
    let index = 0;
    let cycleCount = 0;

    switch (pattern.name) {
        case "Pseq":
            return {
                next() {
                    const v = values[index++];
                    if (index >= values.length) {
                        index = 0;
                        if (++cycleCount >= repeats) return null;
                    }
                    return v;
                }
            };
        // ... other patterns
    }
}
```

---

## OSC Integration

To add OSC output to your cue:

### 1. Check if OSC is Enabled
```javascript
import { isOscEnabled } from "./oscillaAnimationShared.js";

if (isOscEnabled(cfg, oscMode)) {
    // Send OSC
}
```

### 2. Send OSC Message
```javascript
import { sendOSCMessage } from "./oscillaOSC.js";

function sendOSCColor(cfg, hsl) {
    const payload = {
        type: "osc_color",
        uid: cfg.uid,
        h: hsl.h,
        s: hsl.s,
        l: hsl.l,
        timestamp: Date.now()
    };
    
    if (cfg.oscAddr) payload.addr = cfg.oscAddr;
    
    sendOSCMessage(payload);
}
```

### 3. Add Visual Overlay (Optional)
```javascript
import { createOscOverlay } from "./oscillaOSC.js";

if (isOscEnabled(cfg, oscMode)) {
    cfg._overlay = createOscOverlay({
        anchorEl: el,
        label: cfg.oscAddr || cfg.uid,
        anchorMode: "center",
        mode: "auto"
    });
    cfg._overlay.update("initial value");
}
```

---

## Hit Labels

Hit labels provide visual indicators and click targets:

```javascript
import { createHitLabel } from "./oscillaHitLabels.js";

createHitLabel(el, "color", cfg.uid, {
    anchorMode: "center",      // center | pathStart | pathEnd
    color: "magenta",          // CSS color
    sizeMode: "follow"         // follow | fixed | rotate40
});
```

---

## Testing Your Cue

### 1. Parser Test
```javascript
import { parseCueToAST } from "./oscillaParser.js";

const ast = parseCueToAST("color(vals:[#f00,#0f0],dur:2,mode:alt)");
console.log(JSON.stringify(ast, null, 2));
```

Expected output:
```json
{
  "type": "cueColor",
  "args": [
    { "key": "vals", "value": ["#f00", "#0f0"] },
    { "key": "dur", "value": 2 },
    { "key": "mode", "value": "alt" }
  ]
}
```

### 2. SVG Test
Create an SVG element with your cue ID:
```xml
<rect id="color(vals:[#f00,#0f0,#00f],dur:2)" width="100" height="100" fill="#f00"/>
```

### 3. Console Debug
```javascript
// Check animation registry
console.log(window.oscillaAnimRegistry);

// Check running animations
console.log([...window.runningAnimations.entries()]);
```

---

## Checklist

- [ ] Token added to `oscillaParser.js`
- [ ] Token added to `allTokens` array
- [ ] Parser rule created (`cue<Name>Top`)
- [ ] Rule added to `cueTop` alternatives
- [ ] AST extraction added to `cstToAst()`
- [ ] Handler module created (`oscilla<Name>.js`)
- [ ] Handler imported in `oscillaCueDispatcher.js`
- [ ] Case added to dispatcher switch
- [ ] Handler imported in `oscillaAnimation.js` (if animation cue)
- [ ] Case added to `animationAssign` switch (if animation cue)
- [ ] Hit labels configured
- [ ] OSC output implemented (if applicable)
- [ ] Documentation written

---

## File Locations Summary

```
public/js/
├── oscillaParser.js           # Token + grammar + AST
├── oscillaCueDispatcher.js    # Playhead dispatch
├── oscillaAnimation.js        # Load-time assignment
├── oscillaAnimationShared.js  # Shared utilities
├── oscillaAnimationColor.js   # Your new handler
├── oscillaHitLabels.js        # Hit label system
└── oscillaOSC.js              # OSC messaging
```

---

## Example: Complete color() Implementation

### DSL Syntax
```
color(vals:[#f00,#0f0,#00f], dur:2)
color(vals:Pseq([red,yellow,green],3), dur:0.5)
color(vals:hue, dur:10, loop:0)
color(vals:hue(120,240), dur:4, osc:1)
colour(vals:[#f80,#08f], mode:alt, dur:1.2)
```

### Files Modified
1. `oscillaParser.js` - Token, rule, AST
2. `oscillaAnimationColor.js` - New file
3. `oscillaCueDispatcher.js` - Import + case
4. `oscillaAnimation.js` - Import + case

### Total Lines Added
- Parser: ~15 lines
- Handler: ~600 lines
- Dispatcher: ~6 lines
- Animation: ~5 lines

---

*Document version: 1.0*
*Last updated: January 2026*
*Case study: color() / colour() animation cue*
