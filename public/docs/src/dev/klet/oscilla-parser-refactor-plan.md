# Oscilla Parser Refactoring Plan

**Document Version:** 1.0  
**Date:** January 2026  
**Status:** Planning Phase

---

## Executive Summary

The OscillaScore CueDSL parser (`oscillaParser.js`) has grown organically through bug fixes and feature additions, resulting in ~2500 lines of redundant code. This document outlines a comprehensive plan to refactor it into a unified, maintainable architecture of approximately 400-600 lines.

---

## Current State Analysis

### Parser Statistics
- **Total lines:** 2,505
- **Grammar rules:** 20+ separate `cueXxxTop` rules
- **Value extraction functions:** 5+ overlapping implementations
- **CST→AST handlers:** 15+ copy-paste blocks

### Identified Redundancy Patterns

1. **Grammar rules that are nearly identical:**
   - `cueAudioTop`, `cueAudioPoolTop`, `cueAudioImpulseTop`
   - `cueOscTop`, `cueOscCtrlTop`, `cueOscCtrlNodeTop`
   - `cueTextTop`, `cueMetronomeTop`, `cueStopwatchTop`
   - All follow: `KEYWORD + genericParamList`

2. **Duplicate value extraction logic:**
   - `extractValue()` (lines 2264-2343)
   - `extractValueExpr()` (lines 1491-1539)
   - `extractAnimKvArgs()` (lines 2377-2441)
   - `extractNumber()` (lines 1181-1188)
   - Inline `parseVal()` in cueSpeed handler
   - Multiple inline value parsing blocks

3. **Copy-paste CST→AST blocks:**
   - Audio/AudioPool/AudioImpulse handlers (~320 lines of near-identical code)
   - OscCtrl/OscCtrlNode handlers (~50 lines duplicated)

---

## Consumer Files Inventory

| File | Primary AST Access Pattern |
|------|---------------------------|
| oscillaFade.js | `ast.args[]` → Object.fromEntries |
| oscillaNav.js | `ast.action`, `ast.target`, `ast.params` |
| oscillaPage.js | `ast.pattern`, `ast.onCompletion` |
| oscillaButton.js | `ast.triggerAst`, `ast.label`, `ast.opt` |
| oscillaPause.js | `ast.dur`, `ast.next`, `ast.count` |
| oscillaStop.js | `ast.next` |
| oscillaVideo.js | `ast.params.*` |
| oscillaText.js | `ast.args[]` → params object |
| oscillaOSC.js | `ast.args[]` |
| oscillaOscCtrl.js | `args[]` with `.type`/`.value` |
| oscillaMetro.js | `ast.args[]` → params object |
| oscillaTimers.js | `ast.args[]` → params object |
| oscillaSpeed.js | `ast.value`, `ast.dur` (flat) |
| oscillaAudio.js | `ast.src`, `ast.amp` + `ast.params` |
| oscillaAnimationRotate.js | `astArgs[]` with `.key`/`.type`/`.value` |
| oscillaAnimationScale.js | `astArgs[]` with `.key`/`.type`/`.value` |
| oscillaAnimationO2p.js | (Similar to rotate/scale) |

### Two Main Consumption Patterns

**Pattern A (Array-based):** ~10 files
```javascript
const params = {};
for (const a of ast.args) {
  params[a.type] = a.value;
}
```

**Pattern B (Flat properties):** ~5 files
```javascript
const { src, amp, dur, uid } = ast;
```

---

## Proposed Architecture

### 1. Unified Grammar Structure

Replace 20+ `cueXxxTop` rules with:

```javascript
// Single token for all cue keywords
const CueKeyword = createToken({
  name: "CueKeyword",
  pattern: /fade|page|stopwatch|video|text|audio|audioPool|audioImpulse|osc|oscCtrl|oscCtrlNode|nav|stop|pause|rotate|scale|scaleXY|o2p|button|metro|metronome/,
  longer_alt: Identifier
});

// One rule to parse all cues
$.RULE("cueTop", () => {
  $.OPTION(() => {
    $.CONSUME(Cue);
    $.CONSUME(Colon);
  });
  $.CONSUME(CueKeyword, { LABEL: "cueType" });
  $.SUBRULE($.paramBlock);
});

// Unified parameter handling
$.RULE("paramBlock", () => {
  $.CONSUME(LParen);
  $.OPTION(() => $.SUBRULE($.paramList));
  $.CONSUME(RParen);
});

$.RULE("param", () => {
  $.OR([
    // Named: key:value
    { GATE: () => $.LA(2).tokenType === Colon,
      ALT: () => $.SUBRULE($.namedParam) },
    // Positional: just a value
    { ALT: () => $.SUBRULE($.valueExpr, { LABEL: "positional" }) }
  ]);
});
```

### 2. Unified Value Expression

One rule to handle all value types:

```javascript
$.RULE("valueExpr", () => {
  $.OR([
    // Pattern call: Pseq([...], n)
    { GATE: () => $.LA(1).tokenType === PatternName,
      ALT: () => $.SUBRULE($.patternCall) },
    
    // Function call: rand(1, 10), fadein(500)
    { GATE: () => $.LA(1).tokenType === Identifier && $.LA(2).tokenType === LParen,
      ALT: () => $.SUBRULE($.funcCall) },
    
    // Nested cue (for button triggers)
    { GATE: () => $.LA(1).tokenType === CueKeyword,
      ALT: () => $.SUBRULE($.cueTop) },
    
    // Style block: style:{bg:"red", font:"mono"}
    { GATE: () => $.LA(1).image === "style" && $.LA(2).tokenType === Colon,
      ALT: () => $.SUBRULE($.styleBlock) },
    
    // Array: [1, 2, 3]
    { ALT: () => $.SUBRULE($.arrayLiteral) },
    
    // Primitives
    { ALT: () => $.CONSUME(NumberLiteral) },
    { ALT: () => $.CONSUME(StringLiteral) },
    { ALT: () => $.CONSUME(RangeLiteral) },
    { ALT: () => $.CONSUME(True) },
    { ALT: () => $.CONSUME(False) },
    { ALT: () => $.CONSUME(Identifier) },
  ]);
});
```

### 3. Normalized AST Shape

Every cue produces a consistent structure:

```typescript
interface UnifiedAST {
  type: string;                    // "cueFade", "cueNav", etc.
  params: Record<string, any>;     // ALL params as flat object
  uid: string;                     // Always present
  
  // Optional nested structures (only when needed):
  pattern?: PatternAST;            // For page, rotate, scale, o2p
  after?: UnifiedAST;              // Nested cue for chaining
  trigger?: UnifiedAST;            // For button
  style?: Record<string, any>;     // Parsed style block
}

interface PatternAST {
  type: "Pseq" | "Prand" | "Pxrand" | "Pshuf" | "Pchoose";
  list: (string | number | PatternAST)[];
  repeats: number | "inf";
}
```

### 4. Data-Driven CST→AST Conversion

Replace giant if/else chains with configuration:

```javascript
const CUE_DEFINITIONS = {
  fade: {
    positionalKey: "mode",
    defaults: { dur: 1, from: 0, to: 1 },
    deriveUid: (p) => `fade_${p.mode || 'in'}_${Date.now()}`
  },
  
  audio: {
    positionalKey: "src",
    defaults: { amp: 1, loop: 1, toggle: false, fadeIn: 0, fadeOut: 0 },
    deriveUid: (p) => p.uid || p.src
  },
  
  nav: {
    positionalKey: "action",
    defaults: {},
    deriveUid: (p) => p.target ? `${p.action}@${p.target}` : p.action
  },
  
  page: {
    positionalKey: "pattern",
    supportsPatterns: true,
    defaults: {},
    deriveUid: (p) => `page_${Date.now()}`
  },
  
  pause: {
    positionalKey: "dur",
    defaults: { count: false },
    deriveUid: (p) => `pause_${p.dur || 0}`
  },
  
  stop: {
    positionalKey: "scope",
    defaults: {},
    deriveUid: (p) => p.uid || "stop"
  },
  
  rotate: {
    positionalKey: "values",
    supportsPatterns: true,
    defaults: { dur: 1, mode: "loop", ease: "linear" },
    deriveUid: (p) => p.uid || `rotate_${Date.now()}`
  },
  
  scale: {
    positionalKey: "values",
    supportsPatterns: true,
    defaults: { dur: 1, mode: "loop", ease: "linear" },
    deriveUid: (p) => p.uid || `scale_${Date.now()}`
  },
  
  // ... etc for all 18 cue types
};

function cstToAst(cst) {
  const cueType = cst.children.cueType[0].image;
  const def = CUE_DEFINITIONS[cueType] || {};
  
  const params = extractParams(cst.children.paramBlock[0], def.positionalKey);
  
  // Handle patterns if supported
  let pattern = null;
  if (def.supportsPatterns && params[def.positionalKey]?.type === "pattern") {
    pattern = params[def.positionalKey];
    delete params[def.positionalKey];
  }
  
  // Handle nested cues (after/trigger)
  let after = null;
  if (params.after) {
    after = params.after;
    delete params.after;
  }
  
  return {
    type: `cue${capitalize(cueType)}`,
    params: { ...def.defaults, ...params },
    uid: def.deriveUid?.(params) || params.uid || generateUid(),
    ...(pattern && { pattern }),
    ...(after && { after })
  };
}
```

### 5. Single Value Extractor

```javascript
function extractValue(node) {
  if (!node) return null;
  
  // Unwrap CST wrappers
  if (node.children?.valueExpr) return extractValue(node.children.valueExpr[0]);
  if (node.children?.animValue) return extractValue(node.children.animValue[0]);
  
  // Handle tokens directly
  if (node.image !== undefined) {
    const img = node.image;
    const typeName = node.tokenType?.name;
    
    if (typeName === "StringLiteral") return unquote(img);
    if (typeName === "NumberLiteral") return Number(img);
    if (typeName === "True") return true;
    if (typeName === "False") return false;
    if (typeName === "RangeLiteral") return parseRange(img);
    if (img === "inf") return "inf";
    return img; // Identifier
  }
  
  // Handle composite nodes
  if (node.name === "funcCall") return extractFuncCall(node);
  if (node.name === "patternCall") return extractPatternCall(node);
  if (node.name === "arrayLiteral") return node.children.valueExpr.map(extractValue);
  if (node.name === "cueTop") return cstToAst(node); // Nested cue
  if (node.name === "styleBlock") return extractStyleBlock(node);
  
  // Recurse into children
  for (const key of Object.keys(node.children || {})) {
    const child = node.children[key]?.[0];
    if (child) return extractValue(child);
  }
  
  return null;
}
```

---

## Decisions Made

### Syntax Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| First positional | Allowed, maps to cue-specific key | Preserves `speed(3)`, `pause(12)` shorthand |
| Pattern location | First positional or any value | Maintains flexibility for animation cues |
| Style syntax | `style:{bg:"red", font:"mono"}` | Follows CSS-like convention with quotes |
| After/next unification | Use `after:` everywhere | Clearer semantics than "next" |
| Nested cues | Full cue expression required | `after:nav(scroll)` not `after:scroll` |

### AST Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Params structure | Always `params: {}` object | Consistency across all cue types |
| UID | Always present, derived if not explicit | Simplifies consumer code |
| Pattern storage | Separate `pattern` field when present | Clear separation from scalar params |
| Style storage | Separate `style` field | Matches CSS mental model |

---

## Migration Strategy

### Phase 1: Parallel Parser
1. Create `oscillaParserV2.js` alongside existing parser
2. Implement unified grammar
3. Implement data-driven CST→AST
4. Add comprehensive test suite comparing outputs

### Phase 2: Consumer Adapter
1. Create adapter layer that converts V2 AST to V1 shapes
2. Test each consumer with adapter
3. Identify any edge cases

### Phase 3: Consumer Migration
1. Update consumers one at a time to use V2 AST directly
2. Order by complexity (simplest first):
   - oscillaStop.js
   - oscillaPause.js
   - oscillaSpeed.js
   - oscillaFade.js
   - oscillaNav.js
   - oscillaMetro.js
   - oscillaTimers.js
   - oscillaText.js
   - oscillaOSC.js
   - oscillaOscCtrl.js
   - oscillaVideo.js
   - oscillaAudio.js
   - oscillaAnimationRotate.js
   - oscillaAnimationScale.js
   - oscillaAnimationO2p.js
   - oscillaPage.js
   - oscillaButton.js

### Phase 4: Cleanup
1. Remove V1 parser
2. Remove adapter layer
3. Final documentation update

---

## Consumer Migration Patterns

### From Array-style to Params Object

**Before:**
```javascript
const params = {};
for (const p of (ast.args || [])) {
  params[p.type] = p.value;
}
const dur = Number(params.dur || 1);
```

**After:**
```javascript
const { dur = 1 } = ast.params;
```

### From Flat Properties to Params Object

**Before:**
```javascript
const { src, amp = 1, loop = 1, uid } = ast;
```

**After:**
```javascript
const { src, amp = 1, loop = 1 } = ast.params;
const { uid } = ast;
```

### From onCompletion to after

**Before:**
```javascript
if (ast.onCompletion) {
  const { control, arg, target } = ast.onCompletion;
  handleCueTrigger(`${control}(${arg})`);
}
```

**After:**
```javascript
if (ast.after) {
  handleCueTrigger(ast.after);
}
```

---

## Test Cases

### Basic Cues

```javascript
// Input
"fade(in)"
// Expected AST
{ type: "cueFade", params: { mode: "in", dur: 1, from: 0, to: 1 }, uid: "fade_in_..." }

// Input
"audio(src:\"click.wav\", amp:0.5)"
// Expected AST
{ type: "cueAudio", params: { src: "click.wav", amp: 0.5, loop: 1, ... }, uid: "click.wav" }

// Input
"pause(5)"
// Expected AST
{ type: "cuePause", params: { dur: 5, count: false }, uid: "pause_5" }
```

### Pattern Cues

```javascript
// Input
"page(Pseq([page1, page2], 2))"
// Expected AST
{
  type: "cuePage",
  params: {},
  pattern: { type: "Pseq", list: ["page1", "page2"], repeats: 2 },
  uid: "page_..."
}

// Input
"rotate(Prand([0, 90, 180], inf), dur:2)"
// Expected AST
{
  type: "cueRotate",
  params: { dur: 2, mode: "loop", ease: "linear" },
  pattern: { type: "Prand", list: [0, 90, 180], repeats: "inf" },
  uid: "rotate_..."
}
```

### Nested Cues

```javascript
// Input
"button(label:\"Go\", trigger:nav(scroll))"
// Expected AST
{
  type: "cueButton",
  params: { label: "Go" },
  trigger: { type: "cueNav", params: { action: "scroll" }, uid: "scroll" },
  uid: "button_..."
}

// Input
"stop(after:nav(sectionB))"
// Expected AST
{
  type: "cueStop",
  params: {},
  after: { type: "cueNav", params: { action: "sectionB" }, uid: "sectionB" },
  uid: "stop"
}
```

### Style Blocks

```javascript
// Input
"button(label:\"Go\", trigger:nav(scroll), style:{bg:\"red\", font:\"mono\"})"
// Expected AST
{
  type: "cueButton",
  params: { label: "Go" },
  trigger: { type: "cueNav", params: { action: "scroll" }, uid: "scroll" },
  style: { bg: "red", font: "mono" },
  uid: "button_..."
}
```

---

## Estimated Effort

| Task | Lines of Code | Time Estimate |
|------|---------------|---------------|
| Unified grammar | ~150 lines | 2-3 hours |
| Value extractor | ~80 lines | 1-2 hours |
| Cue definitions config | ~100 lines | 1-2 hours |
| CST→AST converter | ~100 lines | 2-3 hours |
| Test suite | ~200 lines | 2-3 hours |
| Consumer migrations | ~100 changes | 4-6 hours |
| **Total** | **~600 lines** (down from 2500) | **12-19 hours** |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Edge cases in existing cues | Comprehensive test suite comparing V1 vs V2 output |
| Pattern handling complexity | Keep pattern extraction as separate, well-tested module |
| Consumer breakage | Parallel parser + adapter layer enables gradual migration |
| Undocumented syntax variations | Run both parsers in parallel during transition, log differences |

---

## Files Reference

### Parser
- `oscillaParser.js` (current, 2505 lines)

### Consumers (17 files)
- oscillaFade.js
- oscillaNav.js
- oscillaPage.js
- oscillaButton.js
- oscillaPause.js
- oscillaStop.js
- oscillaVideo.js
- oscillaText.js
- oscillaOSC.js
- oscillaOscCtrl.js
- oscillaMetro.js
- oscillaTimers.js
- oscillaSpeed.js
- oscillaAudio.js
- oscillaAnimationRotate.js
- oscillaAnimationScale.js
- oscillaAnimationO2p.js

### Preprocessors (separate system, unchanged)
- oscillaPropagate.js
- (reuse.js)

---

## Appendix: Full Cue Type Inventory

| Cue Type | Positional Key | Supports Patterns | Has Nested Cue |
|----------|---------------|-------------------|----------------|
| fade | mode | No | No |
| audio | src | No | No |
| audioPool | path | No | No |
| audioImpulse | path | No | No |
| nav | action | No | No |
| page | pattern | Yes | after |
| pause | dur | No | after |
| stop | scope | No | after |
| text | content | No | No |
| video | file | No | No |
| osc | addr | No | No |
| oscCtrl | addr | No | No |
| oscCtrlNode | addr | No | No |
| button | (none) | No | trigger |
| metronome | (none) | No | No |
| stopwatch | (none) | No | No |
| rotate | values | Yes | No |
| scale | values | Yes | No |
| o2p | values | Yes | No |

---

## Next Steps When Resuming

1. Review this document
2. Decide on implementation order (recommend: grammar first, then tests, then consumers)
3. Set up a test harness to compare V1 vs V2 parser output
4. Begin with Phase 1: Parallel Parser implementation

---

*Document generated from analysis session, January 2026*
