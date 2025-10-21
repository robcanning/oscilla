// ============================================================================
// parser.js — OscillaScore CueDSL Parser (Chevrotain 11+)
// ============================================================================
//
// Supports:
//   • cue:page(...)  → full page / playlist syntax (loop, rand, choose, mode)
//   • cue:fade(...)  → simple parameterized fade cues (mode:in, dur:2, ...)
//
// The lexer → parser → CST → AST pipeline is completely deterministic
// and unambiguous. Keywords appear before Identifier tokens so that
// Chevrotain can distinguish branches by first token.
//
// ============================================================================

import {
  createToken,
  Lexer,
  CstParser,
} from "https://esm.sh/chevrotain@11.0.3/es2022/chevrotain.mjs";

// ─────────────────────────────────────────────────────────────
//  Helper: debug printer
// ─────────────────────────────────────────────────────────────
export function printCST(node, depth = 0) {
  if (!node) return;
  const pad = " ".repeat(depth * 2);
  if (node.image !== undefined && node.tokenType) {
    console.log(`${pad}- ${node.tokenType.name}: "${node.image}"`);
    return;
  }
  if (node.name) console.log(`${pad}${node.name}`);
  if (node.children) {
    for (const [k, v] of Object.entries(node.children)) {
      console.log(`${pad}  ${k}:`);
      if (Array.isArray(v)) v.forEach((c) => printCST(c, depth + 2));
      else printCST(v, depth + 2);
    }
  }
}

// ============================================================================
// 1️⃣ TOKEN DEFINITIONS
// ============================================================================

// Literals
const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /[0-9]+(\.[0-9]+)?/,
});

const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /"[^"]*"|'[^']*'/,
});

const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_][a-zA-Z0-9_-]*/
});

const WS = createToken({
  name: "WS",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// Keywords must precede Identifier.
const Cue    = createToken({ name: "Cue", pattern: /cue/ });
const Fade   = createToken({ name: "Fade",   pattern: /fade\b/,   longer_alt: Identifier });
const Page = createToken({ name: "Page", pattern: /\bpage\b/ });
const Stopwatch = createToken({ name: "Stopwatch", pattern: /\bstopwatch\b/ });

const Seq    = createToken({ name: "Seq", pattern: /seq/ });
const Loop   = createToken({ name: "Loop", pattern: /loop/ });
const Rand   = createToken({ name: "Rand", pattern: /rand/ });
const Choose = createToken({ name: "Choose", pattern: /choose/ });
const Mode   = createToken({ name: "Mode", pattern: /mode/ });

// Punctuation
const LParen = createToken({ name: "LParen", pattern: /\(/ });
const RParen = createToken({ name: "RParen", pattern: /\)/ });
const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
const Colon  = createToken({ name: "Colon",  pattern: /:/ });
const Comma  = createToken({ name: "Comma",  pattern: /,/ });
const At     = createToken({ name: "At",     pattern: /@/ });
const XParam = createToken({ name: "XParam", pattern: /x/ });



export const allTokens = [
  Cue, Fade, Page, Stopwatch, Seq, Loop, Rand, Choose, Mode,
  LParen, RParen, LBrace, RBrace, Colon, Comma, At, XParam,
  NumberLiteral, StringLiteral, Identifier, WS
];
export const CueLexer = new Lexer(allTokens);

// ============================================================================
// 2️⃣ PARSER
// ============================================================================
export class CueParser extends CstParser {
  constructor() {
    super(allTokens);
    const $ = this;




// -----------------------
// Generic key:value param list — reusable across cues
// -----------------------
$.RULE("genericParam", () => {
  $.CONSUME(Identifier, { LABEL: "key" });
  $.CONSUME(Colon);
  $.OR([
    { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "value" }) },
    { ALT: () => $.CONSUME(StringLiteral, { LABEL: "value" }) },
    { ALT: () => $.CONSUME1(Identifier, { LABEL: "value" }) },
  ]);
});

$.RULE("genericParamList", () => {
  $.CONSUME(LParen);
  $.AT_LEAST_ONE_SEP({
    SEP: Comma,
    DEF: () => $.SUBRULE($.genericParam),
  });
  $.CONSUME(RParen);
});


    // -----------------------
    // Base page elements
    // -----------------------
    $.RULE("pageItem", () => {
      $.CONSUME(Identifier, { LABEL: "page" });
      $.OPTION(() => {
        $.CONSUME(Colon);
        $.CONSUME(NumberLiteral, { LABEL: "dur" });
      });
    });

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

    $.RULE("controlItem", () => {
      $.CONSUME(Mode);
      $.CONSUME(Colon);
      $.CONSUME1(Identifier, { LABEL: "modeType" });
      $.OPTION(() => {
        $.CONSUME(At);
        $.CONSUME2(Identifier, { LABEL: "targetUid" });
      });
    });

    $.RULE("playlistItem", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.loopItem) },
        { ALT: () => $.SUBRULE($.chooseItem) },
        { ALT: () => $.SUBRULE($.randItem) },
        { ALT: () => $.SUBRULE($.controlItem) },
        { ALT: () => $.SUBRULE($.pageItem) },
      ]);
    });

    $.RULE("playlist", () => {
      $.CONSUME(Seq);
      $.CONSUME(Colon);
      $.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.playlistItem),
      });
    });

    // -----------------------
    // Fade params
    // -----------------------
$.RULE("fadeParam", () => {
  // key can be Mode keyword or plain identifier
  $.OR([
    { ALT: () => $.CONSUME(Mode, { LABEL: "keyMode" }) },
    { ALT: () => $.CONSUME(Identifier, { LABEL: "keyIdent" }) },
  ]);
  $.CONSUME(Colon);
  // value can be number or identifier (second OR → must be OR1)
  $.OR1([
    { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "num" }) },
    { ALT: () => $.CONSUME1(Identifier, { LABEL: "ident" }) },
  ]);
});

    $.RULE("fadeParamList", () => {
      $.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.fadeParam),
      });
    });

    // -----------------------
    // cue:fade(...)
    // -----------------------
    $.RULE("cueFadeTop", () => {
      $.CONSUME(Fade);
      $.CONSUME(LParen);
      $.OPTION(() => $.SUBRULE($.fadeParamList));
      $.CONSUME(RParen);
    });

    // -----------------------
    // cue:page(...)
    // -----------------------
    $.RULE("cuePageTop", () => {
      $.CONSUME(Page);
      $.CONSUME(LParen);
      $.OPTION(() => {
        $.OR([
          { ALT: () => $.SUBRULE($.playlist) },
          { ALT: () => $.SUBRULE($.pageItem) },
          { ALT: () => $.SUBRULE($.controlItem) },
        ]);
      });
      $.CONSUME(RParen);
    });


// -----------------------
// cue:stopwatch(...)
// -----------------------
$.RULE("cueStopwatchTop", () => {
  $.CONSUME(Stopwatch);
  $.CONSUME(LParen);
  $.OPTION(() => {
    $.AT_LEAST_ONE_SEP({
      SEP: Comma,
      DEF: () => $.SUBRULE($.genericParam),
    });
  });
  $.CONSUME(RParen);
});






    // -----------------------
    // cueTop — only fade|page at top level
    // -----------------------
    $.RULE("cueTop", () => {
      $.CONSUME(Cue);
      $.CONSUME(Colon);
      $.OR([
        { ALT: () => $.SUBRULE($.cueFadeTop) },
        { ALT: () => $.SUBRULE($.cuePageTop) },
        { ALT: () => $.SUBRULE($.cueStopwatchTop) },

      ]);
    });

    this.performSelfAnalysis();
  }
}

// ============================================================================
// 3️⃣ CST → AST
// ============================================================================

function extractNumber(children, fallback = 0) {
  if (!children) return fallback;
  const num =
    children.NumberLiteral?.[0]?.image ||
    children.dur?.[0]?.image ||
    children.xVal?.[0]?.image;
  return num ? Number(num) : fallback;
}

export function cstToAst(cst) {
  // ============================================================================
  // 🔹 cue:fade(mode:in,dur:2,from:0,to:1)
  // ============================================================================
  // Note: when parsed via parser.cueTop(), the CST root is "cueTop"
  // with child node "cueFadeTop". So we check both.
  // ----------------------------------------------------------------------------
  const fadeNode = cst.children?.cueFadeTop?.[0] || (cst.name === "cueFadeTop" ? cst : null);
  if (fadeNode) {
    const params = [];
    const list = fadeNode.children.fadeParamList?.[0];
    const items = list?.children.fadeParam || [];

    for (const p of items) {
      const ch = p.children;
      const key = ch.keyMode?.[0]?.image || ch.keyIdent?.[0]?.image || "";
      let value = null;
      if (ch.num) value = Number(ch.num[0].image);
      else if (ch.ident) value = ch.ident[0].image;
      params.push({ type: key, value });
    }

    return { type: "cueFade", args: params };
  }

  // ============================================================================
  // 🔹 cue:page(...) — full playlist, control, loop, choose, rand support
  // ============================================================================
  const pageNode = cst.children?.cuePageTop?.[0] || (cst.name === "cuePageTop" ? cst : null);
  if (pageNode) {
    const ast = { type: "cuePage", args: [] };
    const items = pageNode.children.playlist?.[0]?.children.playlistItem || [];

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

      // randItem
      if (c.randItem) {
        const ch = c.randItem[0].children;
        const pages = (ch.pageItem || []).map(p => {
          const pg = p.children;
          const name = pg.page?.[0]?.image;
          const dur =
            Number(pg.dur?.[0]?.image) ||
            Number(pg.NumberLiteral?.[0]?.image) ||
            0;
          return { type: "page", name, dur };
        });
        const repeat = extractNumber(ch, 1);
        ast.args.push({ type: "rand", pages, repeat });
        continue;
      }

      // controlItem
      if (c.controlItem) {
        const ch = c.controlItem[0].children;
        const value = ch.modeType?.[0]?.image;
        const target = ch.targetUid?.[0]?.image || null;
        ast.args.push({ type: "control", name: "mode", value, target });
        continue;
      }
    }

    // bare cue:page(page1)
    if (ast.args.length === 0 && pageNode.children.pageItem) {
      const ch = pageNode.children.pageItem[0].children;
      const name = ch.page?.[0]?.image;
      const dur = extractNumber(ch);
      ast.args.push({ type: "page", name, dur });
    }

    return ast;
  }

// ============================================================================
// 🔹 cue:stopwatch(hold:10)
// ============================================================================
const stopwatchNode = cst.children?.cueStopwatchTop?.[0] 
                   || (cst.name === "cueStopwatchTop" ? cst : null);

if (stopwatchNode) {
  const args = [];
  const items = stopwatchNode.children.genericParam || [];
  for (const p of items) {
    const key = p.children.key?.[0]?.image;
    const val = p.children.value?.[0]?.image;
    if (key) args.push({ type: key, value: isNaN(Number(val)) ? val : Number(val) });
  }

  return { type: "cueStopwatch", args };
}


  // ============================================================================
  // 🔹 Fallback (unknown cue)
  // ============================================================================
  console.warn("[CueDSL] ⚠️ Unrecognized CST structure:", cst.name);
  return { type: "cueUnknown", args: [] };
}


// ============================================================================
// 4️⃣ MAIN ENTRY
// ============================================================================
export function parseCueToAST(input) {
  const lexResult = CueLexer.tokenize(input);
  console.log("[LexerDebug] Tokens:", lexResult.tokens.map(t => t.image));
  console.log("[LexerDebug] Errors:", lexResult.errors);

  const parser = new CueParser();
  parser.input = lexResult.tokens;
  const cst = parser.cueTop();

  if (parser.errors.length) {
    console.error("[CueDSL] ❌ Parse errors:", parser.errors);
    throw new Error("Parsing failed");
  }

  console.log("✅ Parsed CST structure ↓↓↓");
  printCST(cst);
  const ast = cstToAst(cst);
  console.log("[CueDSL] ✅ Parsed AST:", ast);
  return ast;
}

