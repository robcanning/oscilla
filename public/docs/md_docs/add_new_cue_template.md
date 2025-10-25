## 🔧 Template for Adding a New Cue Type

Follow this pattern to introduce any new `cue:<type>(...)` construct, such as `cue:metronome`, `cue:light`, or `cue:harmony`.  
Each cue type requires **three small additions**: one in the grammar, one in the AST translator, and one in the runtime dispatcher.

---

### 🧱 Step 1 — Add Grammar Rule in `parser.js`

Define the cue-specific rule using the existing `cue:page` pattern.  
Use clear token labels for arguments so they can be extracted easily in `cstToAst()`.

```js
// ── cue:metronome(seq:7/16x2,3/4x4,bpm:92,style:pulse,showNumbers:1)
$.RULE("metronomeCue", () => {
  $.CONSUME(Identifier, { LABEL: "metronomeKeyword" }); // "metronome"
  $.CONSUME(LParen);

  $.MANY_SEP({
    SEP: Comma,
    DEF: () => {
      $.CONSUME(Identifier, { LABEL: "paramKey" }); // seq, bpm, style, etc.
      $.CONSUME(Colon);
      $.OR([
        { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "paramNumber" }) },
        { ALT: () => $.CONSUME(Identifier, { LABEL: "paramIdent" }) },
        { ALT: () => $.CONSUME(StringLiteral, { LABEL: "paramString" }) },
      ]);
    },
  });

  $.CONSUME(RParen);
});
```

Register it in your root cue selector:

```js
$.RULE("cueRoot", () => {
  $.CONSUME(Cue);
  $.CONSUME(Colon);
  $.OR([
    { ALT: () => $.SUBRULE($.pageCue) },
    { ALT: () => $.SUBRULE($.audioCue) },
    { ALT: () => $.SUBRULE($.metronomeCue) },   // ← new cue here
    // ...
  ]);
});
```

---

### 🧠 Step 2 — Extend `cstToAst()`

Transform the CST node into a simple, uniform AST object:

```js
if (c.metronomeCue) {
  const ch = c.metronomeCue[0].children;
  const params = [];

  const keys = ch.paramKey || [];
  keys.forEach((k, i) => {
    const key = k.image;
    const val =
      ch.paramNumber?.[i]?.image ||
      ch.paramIdent?.[i]?.image ||
      ch.paramString?.[i]?.image ||
      null;
    params.push({ type: key, value: val });
  });

  ast = { type: "cueMetronome", args: params };
}
```

---

### ⚙️ Step 3 — Add a Runtime Handler in `cues.js`

Create a function to execute the new cue’s behavior at runtime:

```js
export async function handleMetronomeCueFromAST(ast) {
  const args = Object.fromEntries(ast.args.map(a => [a.type, a.value]));
  console.log("[CueDSL] 🕒 Starting metronome with:", args);

  // Example: initialize or sync a visual metronome
  startNetworkMetronome({
    bpm: Number(args.bpm) || 90,
    sequence: args.seq || "4/4x4",
    style: args.style || "pulse",
    showNumbers: args.showNumbers === "1",
  });
}
```

And register it in the unified dispatcher:

```js
export async function handleCueFromAST(ast) {
  switch (ast.type) {
    case "cuePage":      return handlePageCueFromAST(ast);
    case "cueAudio":     return handleAudioCueFromAST(ast);
    case "cueMetronome": return handleMetronomeCueFromAST(ast);
    // ...
  }
}
```

---

### ✅ Result

After adding these three parts, you can use your new cue directly inside an SVG element ID:

```
id="cue:metronome(seq:7/16x2,3/4x4,bpm:92,style:pulse,showNumbers:1)"
```

and it will be parsed, converted to an AST like:

```js
{
  type: "cueMetronome",
  args: [
    { type: "seq", value: "7/16x2,3/4x4" },
    { type: "bpm", value: "92" },
    { type: "style", value: "pulse" },
    { type: "showNumbers", value: "1" }
  ]
}
```

and executed by `handleMetronomeCueFromAST()` in real time.
