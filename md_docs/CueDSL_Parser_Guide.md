# 🎼 OscillaScore CueDSL Parser and Runtime Integration
**Technical Overview & Migration Guide**

---

## 1️⃣ Purpose

OscillaScore’s **CueDSL** (Cue Domain-Specific Language) provides a unified textual syntax for describing time-based or event-based actions within SVG scores — e.g.:

```
cue:page(seq: page1:4, loop(page2:2,page3:3){x:2}, mode:scroll)
```

This system replaces a collection of independent regex parsers (`cueAudio(...)`, `cueRepeat_*`, etc.) with a single robust grammar built using **Chevrotain 11+**.  
The parser translates human-readable cue strings into **structured AST objects** that drive runtime behavior in `cues.js`.

---

## 2️⃣ Architecture Overview

### Flow Diagram

```
┌────────────┐        ┌────────────┐        ┌──────────────┐        ┌─────────────┐
│ SVG cue ID │ ─────▶ │ parser.js  │ ─────▶ │ AST object   │ ─────▶ │ cues.js     │
│ e.g. cue:page(...) │             │ CST→AST│ e.g. {type:"cuePage",…}│ runtime exec│
└────────────┘        └────────────┘        └──────────────┘        └─────────────┘
```

### Components

| Component | Description |
|------------|--------------|
| **`parser.js`** | Chevrotain-based grammar definition. Produces CST (Concrete Syntax Tree). |
| **`cstToAst()`** | Simplifies the verbose CST into a usable AST. |
| **`handleCueFromAST(ast)`** | Central dispatcher that routes to a cue-specific runtime (e.g. `handlePageCueFromAST`). |
| **`handlePageCueFromAST()`** | Executes sequenced, looped, and random page changes defined in the AST. |

---

## 3️⃣ Why CST → AST

Chevrotain generates a **CST** that mirrors the grammar hierarchy.  
This is verbose but precise — great for debugging.

The **AST** is a simplified domain model used by the runtime.  
Example:

**CST fragment:**
```json
{
  "name": "loopItem",
  "children": {
    "Loop": [ { "image": "loop" } ],
    "pageItem": [...],
    "xVal": [ { "image": "3" } ]
  }
}
```

**AST result:**
```json
{ "type": "loop", "pages": [{ "name": "page1", "dur": 2 }], "repeat": 3 }
```

This separation makes the system:
- Easier to debug (`printCST()` is extremely valuable during design)
- Easier to evolve (grammar and runtime can change independently)
- Safe for multiple cue families using one parser

---

## 4️⃣ Example: `cue:page` DSL

### Input

```
cue:page(seq: page1:4, loop(page2:2,page3:3){x:2}, mode:scroll)
```

### Parsed AST

```js
{
  type: "cuePage",
  args: [
    { type: "page", name: "page1", dur: 4 },
    { type: "loop", pages: [
        { name: "page2", dur: 2 },
        { name: "page3", dur: 3 }
      ], repeat: 2
    },
    { type: "control", name: "mode", value: "scroll" }
  ]
}
```

### Runtime behavior

- Displays `page1` for 4 s  
- Loops `page2` + `page3` twice  
- Returns to scroll mode at the end

This is managed by:

```js
export async function handlePageCueFromAST(ast) {
  for (const item of ast.args) {
    switch (item.type) {
      case "page":   await handlePageCue(...); break;
      case "loop":   await handleLoop(...); break;
      case "rand":   await handleRand(...); break;
      case "choose": await handleChoose(...); break;
    }
  }
}
```

---

## 5️⃣ Adding a New Cue Type

Adding a new cue (e.g. `cue:audio`, `cue:traverse`, `cue:repeat`) involves **three layers**:

### 🧱 Step 1: Grammar in `parser.js`

Add a new sub-rule:

```js
$.RULE("audioCue", () => {
  $.CONSUME(Identifier, { LABEL: "audioKeyword" }); // "audio"
  $.CONSUME(LParen);
  $.CONSUME(Identifier, { LABEL: "filename" });
  $.CONSUME(RParen);

  // optional parameters in {...}
  $.OPTION(() => {
    $.CONSUME(LBrace);
    $.CONSUME(Identifier, { LABEL: "param" });
    $.CONSUME(Colon);
    $.CONSUME(NumberLiteral, { LABEL: "value" });
    $.CONSUME(RBrace);
  });
});
```

And register it in the root:

```js
$.RULE("cueRoot", () => {
  $.CONSUME(Cue);
  $.CONSUME(Colon);
  $.OR([
    { ALT: () => $.SUBRULE($.pageCue) },
    { ALT: () => $.SUBRULE($.audioCue) },
    { ALT: () => $.SUBRULE($.traverseCue) },
  ]);
});
```

---

### 🧠 Step 2: Extend `cstToAst()`

Transform that CST into a clean AST node:

```js
if (c.audioCue) {
  const file = c.audioCue[0].children.filename[0].image;
  const params = extractParams(c.audioCue[0]);
  ast = { type: "cueAudio", file, params };
}
```

---

### ⚙️ Step 3: Add a runtime handler in `cues.js`

```js
export async function handleAudioCueFromAST(ast) {
  const { file, params } = ast;
  console.log(`[CueDSL] 🎧 Playing ${file} with`, params);
  // play audio via native Web Audio or WaveSurfer
}
```

And register it in the unified dispatcher:

```js
export async function handleCueFromAST(ast) {
  switch (ast.type) {
    case "cuePage":    return handlePageCueFromAST(ast);
    case "cueAudio":   return handleAudioCueFromAST(ast);
    case "cueTraverse":return handleTraverseCueFromAST(ast);
    case "cueRepeat":  return handleRepeatCueFromAST(ast);
    default: console.warn("Unhandled cue type:", ast.type);
  }
}
```

---

## 6️⃣ Debugging Tips

Use the built-in CST logger at any time:

```js
console.log("✅ Parsed CST structure ↓↓↓");
printCST(cst);
```

You’ll see hierarchical token traces like:

```
cuePage
  Cue: "cue"
  Colon: ":"
  pageKeyword: "page"
  playlist
    loopItem
      Loop: "loop"
      ...
```

This shows exactly what the parser recognized and helps pinpoint rule mismatches.

---

## 7️⃣ Migration Strategy for Legacy Cues

| Legacy cue | Current format | Target format | Migration strategy |
|-------------|----------------|----------------|---------------------|
| `cueAudio(file)_loop(3)_amp(1)` | flat regex | `cue:audio(file:"file.wav"){loop:3,amp:1}` | new grammar + runtime |
| `cueRepeat_s_a_e_b_x_3` | namespace | `cue:repeat(start:a,end:b,x:3)` | map fields to structured args |
| `cueTraverse(p(p1,p2,p3),o(obj),s(1),d(2))` | parameterized | `cue:traverse(points:[p1,p2,p3],object:obj,speed:1,dir:2)` | direct parameter parsing |
| `cueText(...)`, `cueChoice(...)`, etc. | mixed | unified under parser | progressive migration |

Each migration simply adds a grammar rule + small runtime adapter —  
no more regex chains or duplicated logic.

---

## 8️⃣ Best Practices for New Grammar Design

- **Start small:** one top-level token per cue (`Audio`, `Page`, `Repeat`, etc.)
- **Avoid ambiguity:** ensure unique prefixes so Chevrotain doesn’t raise “Ambiguous Alternatives”.
- **Reuse existing rules:** for numbers, parentheses, braces, and colon-delimited pairs.
- **Always test with `printCST()` first**, then verify AST shape before touching runtime.
- **Keep AST consistent:** every cue should produce `{type, args}` or `{type, params}` objects.

---

## 9️⃣ Refactoring Outlook

Once all cues migrate:
- You can remove the `cstToAst()` step if the grammar stabilizes and you prefer direct AST returns.
- The parser will become a single, declarative description of the entire CueDSL syntax.
- Runtime logic across cues will share common structures for looping, timing, randomization, etc.

---

## 🔚 Summary

✅ **You now have:**
- A working, extensible DSL architecture for Oscilla cues.  
- Robust debugging and validation via Chevrotain’s CST.  
- Modular runtime logic that can handle any cue type through a shared AST schema.

🛠️ **Next steps:**
1. Migrate remaining cue families (`audio`, `repeat`, `traverse`, `text`).
2. Centralize all runtime handlers in `cues.js`.
3. Write one unified `handleCueFromAST(ast)` dispatcher.

---

### 💡 TL;DR

> Each cue string → CST → AST → runtime.  
> Add one grammar rule, one AST extractor, one runtime function.  
> The rest — parsing, debugging, and sequencing — is already done.
