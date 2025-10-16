// ============================================================================
// parser.js — OscillaScore CueDSL Parser (Chevrotain 11+)
// ============================================================================
//
// This module defines the formal grammar and parser for OscillaScore’s
// compact CueDSL syntax. It uses Chevrotain (a high-performance PEG-style
// parser toolkit) to transform cue strings like:
//
//     cue:page(seq: page1:4,
//                   loop(page1:3,page2:2){x:2},
//                   rand(page1:2,page2:2,page3:2){x:4},
//                   choose(page2,page3):3,
//                   mode:scroll)
//
// into a structured Abstract Syntax Tree (AST) that can be executed
// programmatically by the runtime (see cues.js → handlePageCueFromAST).
//
// ---------------------------------------------------------------------------
// PARSER FLOW:
//
// 1  LEXING STAGE
//     Token definitions (keywords, punctuation, identifiers, numbers)
//     break the raw cue string into typed tokens.
//
// 2  PARSING STAGE
//     The CueParser (a Chevrotain CstParser subclass) applies grammar rules
//     to generate a Concrete Syntax Tree (CST) representing nested cue
//     elements: pageItem, loopItem, randItem, chooseItem, controlItem, etc.
//
// 3  CST → AST TRANSLATION
//     The cstToAst() function walks the CST and produces a simplified,
//     semantically meaningful AST of the form:
//
//         {
//           type: "cuePage",
//           args: [
//             { type: "page", name: "page1", dur: 4 },
//             {
//               type: "loop",
//               pages: [ {page1,3}, {page2,2} ],
//               repeat: 2
//             },
//             { type: "rand", pages: [...], repeat: 4 },
//             { type: "choose", options: [...], dur: 3 },
//             { type: "control", name: "mode", value: "scroll" }
//           ]
//         }
//
// 4  EXECUTION
//     The resulting AST is passed to handlePageCueFromAST() in cues.js,
//     which iterates through its nodes and calls handlePageCue() to display
//     or transition between pages at the correct timing.
//
// ---------------------------------------------------------------------------
// DEBUGGING:
//
// • The printCST() helper prints a readable tree of CST nodes and token
//   images for diagnosing grammar or tokenization issues.
// • parseCueToAST() logs parse errors and CST structure before conversion.
//
// ---------------------------------------------------------------------------
// SUPPORTED CONSTRUCTS:
//
// • cue:page(seq: ...)
// • loop(pageA:3,pageB:2){x:2}
// • rand(page1:2,page2:2,page3:2){x:4}
// • choose(page1,page2,page3):4
// • mode:scroll
//
// ---------------------------------------------------------------------------
// OUTPUT TARGET:
//
// Exports:
//   - CueLexer  → Chevrotain lexer instance
//   - CueParser → Chevrotain parser subclass
//   - parseCueToAST(input) → runs full pipeline (string → AST)
//   - printCST(node) → debugging tree printer
//   - cstToAst(cst) → translation to runtime-executable AST
//
// ============================================================================

import {
  createToken,
  Lexer,
  CstParser,
} from "https://esm.sh/chevrotain@11.0.3/es2022/chevrotain.mjs";


// ─────────────────────────────────────────────────────────────
// Debug: pretty-print a Chevrotain CST subtree to the console.
// Call: printCST(cst) after parsing to see the actual structure.
// ─────────────────────────────────────────────────────────────

export function printCST(node, depth = 0) {
  if (!node) return;
  const pad = " ".repeat(depth * 2);

  // Token node
  if (node.image !== undefined && node.tokenType) {
    console.log(`${pad}- ${node.tokenType.name}: "${node.image}"`);
    return;
  }

  // Rule node
  if (node.name) {
    console.log(`${pad}${node.name}`);
  }

  // Children
  if (node.children) {
    for (const [k, v] of Object.entries(node.children)) {
      if (Array.isArray(v)) {
        console.log(`${pad}  ${k}:`);
        v.forEach((child) => printCST(child, depth + 2));
      } else {
        console.log(`${pad}  ${k}:`);
        printCST(v, depth + 2);
      }
    }
  }
}


// ------------------------------------------------------------
// 1️⃣  TOKEN DEFINITIONS
// ------------------------------------------------------------

// Keywords
const Cue = createToken({ name: "Cue", pattern: /cue/ });
const Seq = createToken({ name: "Seq", pattern: /seq/ });
const Loop = createToken({ name: "Loop", pattern: /loop/ });
const Rand = createToken({ name: "Rand", pattern: /rand/ });
const Choose = createToken({ name: "Choose", pattern: /choose/ });
const Mode = createToken({ name: "Mode", pattern: /mode/ });

// Symbols
const LParen = createToken({ name: "LParen", pattern: /\(/ });
const RParen = createToken({ name: "RParen", pattern: /\)/ });
const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
const Colon = createToken({ name: "Colon", pattern: /:/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });
const At = createToken({ name: "At", pattern: /@/ });

// Parameters like x:2 inside braces
const XParam = createToken({ name: "XParam", pattern: /x/ });

// Literals and identifiers
const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /[0-9]+(\.[0-9]+)?/,
});
const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_][a-zA-Z0-9_-]*/,
});
const WS = createToken({
  name: "WS",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// Token order matters!  Keywords before Identifier.
const allTokens = [
  Cue, Seq, Loop, Rand, Choose, Mode,
  LParen, RParen, LBrace, RBrace, Colon, Comma,
  XParam, NumberLiteral, Identifier, WS, At
];

export const CueLexer = new Lexer(allTokens);

// ------------------------------------------------------------
// 2️⃣  PARSER DEFINITION
// ------------------------------------------------------------
export class CueParser extends CstParser {
  constructor() {
    super(allTokens);
    const $ = this;

    // ---- pageItem ----
    $.RULE("pageItem", () => {
      $.CONSUME(Identifier, { LABEL: "page" });   // e.g. "page1"
      $.OPTION(() => {
        $.CONSUME(Colon);
        $.CONSUME(NumberLiteral, { LABEL: "dur" });  // optional duration (seconds)
      });
    });


    // ---- loopItem ----
    $.RULE("loopItem", () => {
      $.CONSUME(Loop);
      $.CONSUME(LParen);
      $.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.pageItem),
      });
      $.CONSUME(RParen);
      $.OPTION(() => {
        $.CONSUME(LBrace);
        $.CONSUME(XParam);
        $.CONSUME(Colon);
        $.CONSUME(NumberLiteral, { LABEL: "xVal" });
        $.CONSUME(RBrace);
      });
    });

    // ---- chooseItem ----
    $.RULE("chooseItem", () => {
      $.CONSUME(Choose);
      $.CONSUME(LParen);
      $.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.CONSUME(Identifier, { LABEL: "choicePage" }),
      });
      $.CONSUME(RParen);
      $.OPTION(() => {
        $.CONSUME(Colon);
        $.CONSUME(NumberLiteral, { LABEL: "dur" });
      });
    });

    // ---- randItem ----
    $.RULE("randItem", () => {
      $.CONSUME(Rand);
      $.CONSUME(LParen);
      $.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.pageItem),
      });
      $.CONSUME(RParen);
      $.OPTION(() => {
        $.CONSUME(LBrace);
        $.CONSUME(XParam);
        $.CONSUME(Colon);
        $.CONSUME(NumberLiteral, { LABEL: "xVal" });
        $.CONSUME(RBrace);
      });
    });

    // ---- controlItem ----
    this.RULE("controlItem", () => {
      this.CONSUME(Mode);
      this.CONSUME(Colon);
      // First Identifier → mode type (e.g. "scroll")
      this.CONSUME1(Identifier, { LABEL: "modeType" });

      // Optional target with "@"
      this.OPTION(() => {
        this.CONSUME(At);
        // Second Identifier → target UID (e.g. "mark42")
        this.CONSUME2(Identifier, { LABEL: "targetUid" });
      });
    });



    // ---- playlistItem ----
    $.RULE("playlistItem", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.loopItem) },
        { ALT: () => $.SUBRULE($.chooseItem) },
        { ALT: () => $.SUBRULE($.randItem) },
        { ALT: () => $.SUBRULE($.controlItem) },
        { ALT: () => $.SUBRULE($.pageItem) },
      ]);
    });

    // ---- playlist ----
    $.RULE("playlist", () => {
      $.CONSUME(Seq);
      $.CONSUME(Colon);
      $.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.playlistItem),
      });
    });

    // ------------------------------------------------------------
    // cue:page(...) — supports both simple and sequenced page calls
    // ------------------------------------------------------------
    $.RULE("cuePage", () => {
      $.CONSUME(Cue);                                   // "cue"
      $.CONSUME(Colon);                                 // ":"
      $.CONSUME(Identifier, { LABEL: "pageKeyword" });  // "page"
      $.CONSUME(LParen);

      // Allow either full seq: syntax or single bare page
      $.OPTION(() => {
        $.OR([
          { ALT: () => $.SUBRULE($.playlist) },  // seq: page1:4, loop(...), mode:scroll
          { ALT: () => $.SUBRULE($.pageItem) }   // bare page form: cue:page(page1)
        ]);
      });

      $.CONSUME(RParen);
    });


    this.performSelfAnalysis();
  }
}

// ------------------------------------------------------------
// 3️⃣  CST → AST CONVERSION
// ------------------------------------------------------------
export function extractNumber(children, fallback = 0) {
  if (!children) return fallback;
  const num =
    children.NumberLiteral?.[0]?.image ||
    children.dur?.[0]?.image ||
    children.xVal?.[0]?.image;
  return num ? Number(num) : fallback;
}
export function cstToAst(cst) {
  const ast = { type: "cuePage", args: [] };

  // 1) Normal case: seq: ... → parse playlist items
  const items = cst.children.playlist?.[0]?.children.playlistItem || [];
  for (const i of items) {
    const c = i.children;

    // pageItem
    if (c.pageItem) {
      const ch = c.pageItem[0].children;
      const name = ch.page?.[0]?.image;
      const dur = extractNumber(ch);
      ast.args.push({ type: "page", name, dur });
      continue;
    }

    // loopItem
    if (c.loopItem) {
      const ch = c.loopItem[0].children;
      const pages = (ch.pageItem || []).map(p => {
        const pg = p.children;
        return { type: "page", name: pg.page?.[0]?.image, dur: extractNumber(pg) };
      });
      const repeat = extractNumber(ch, 1);
      ast.args.push({ type: "loop", pages, repeat });
      continue;
    }

    // chooseItem
    if (c.chooseItem) {
      const ch = c.chooseItem[0].children;
      const options = (ch.choicePage || []).map(t => t.image);
      const dur = extractNumber(ch, 0);
      ast.args.push({ type: "choose", options, dur });
      continue;
    }

    // randItem  --- rand(...){x:N}
    if (c.randItem) {
      const randNode = c.randItem[0];
      const ch = randNode.children;

      console.log("[AST] 🧩 randItem children:", Object.keys(ch));

      // pages inside rand(...)
      const pages = (ch.pageItem || []).map(p => {
        const pg = p.children;
        const name = pg.page?.[0]?.image;
        const dur =
          Number(pg.dur?.[0]?.image) ||
          Number(pg.NumberLiteral?.[0]?.image) ||
          0;
        return { type: "page", name, dur };
      });

      // repeat from {x:N}
      let repeat = 1;
      if (ch.xVal?.[0]?.image) repeat = Number(ch.xVal[0].image);

      console.log("[AST] ✅ randItem parsed →", { pages, repeat });
      ast.args.push({ type: "rand", pages, repeat });
      continue;
    }

    // controlItem
    if (c.controlItem) {
      const ch = c.controlItem[0].children;
      const name = "mode";
      const value = ch.modeType?.[0]?.image;    // Identifier #1
      const target = ch.targetUid?.[0]?.image || null; // Identifier #2
      ast.args.push({ type: "control", name, value, target });
      continue;
    }

  }

  // 2) Fallback: bare form cue:page(page1) or cue:page(page1:4)
  //    (No seq:, so no playlist node. The top-level has pageItem directly.)
  if (ast.args.length === 0 && cst.children.pageItem) {
    const ch = cst.children.pageItem[0].children;
    const name = ch.page?.[0]?.image;
    const dur = extractNumber(ch); // 0 if no NumberLiteral
    ast.args.push({ type: "page", name, dur });
  }

  return ast;
}


// ------------------------------------------------------------
// 4️⃣  MAIN ENTRY
// ------------------------------------------------------------
export function parseCueToAST(input) {
  const lexResult = CueLexer.tokenize(input);
  const parser = new CueParser();
  parser.input = lexResult.tokens;

  const cst = parser.cuePage();

  if (parser.errors.length) {
    console.error("[CueDSL] ❌ Parse errors:", parser.errors);
    throw new Error("Parsing failed");
  }

  console.log("✅ Parsed CST structure ↓↓↓");
  printCST(cst);

  const ast = cstToAst(cst);
  console.log("[CueDSL] ✅ Parsed CST:", cst);
  return ast;
}