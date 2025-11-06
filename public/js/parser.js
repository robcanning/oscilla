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
  // allow dots and hyphens inside identifiers (but not at start)
  pattern: /[a-zA-Z_][a-zA-Z0-9_.-]*/
});

const WS = createToken({
  name: "WS",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// Keywords must precede Identifier.
const Cue = createToken({ name: "Cue", pattern: /cue/ });
const Fade = createToken({ name: "Fade", pattern: /fade\b/, longer_alt: Identifier });
const Page = createToken({ name: "Page", pattern: /\bpage\b/ });
const Stopwatch = createToken({ name: "Stopwatch", pattern: /\bstopwatch\b/ });
const Video = createToken({ name: "Video", pattern: /\bvideo\b/ });
const Text = createToken({ name: "Text", pattern: /\btext\b/, longer_alt: Identifier });
const Pause = createToken({ name: "Pause", pattern: /\bpause\b/, longer_alt: Identifier });
const Speed = createToken({ name: "Speed", pattern: /\bspeed\b/, longer_alt: Identifier });
const Stop = createToken({ name: "Stop", pattern: /\bstop\b/, longer_alt: Identifier });
const Nav = createToken({ name: "Nav", pattern: /nav\b/, longer_alt: Identifier });
const Audio = createToken({ name: "Audio", pattern: /audio\b/ });
const Button = createToken({ name: "Button", pattern: /button\b/ });



const After = createToken({ name: "After", pattern: /after\b/ });



const RangeLiteral = createToken({
  name: "RangeLiteral",
  pattern: /[0-9]+(?:\.[0-9]+)?-[0-9]+(?:\.[0-9]+)?/
});

// const Seq = createToken({ name: "Seq", pattern: /seq/ });
// const Loop = createToken({ name: "Loop", pattern: /loop/ });
// const Rand = createToken({ name: "Rand", pattern: /rand/ });
const Choose = createToken({ name: "Choose", pattern: /choose/ });
// const Mode = createToken({ name: "Mode", pattern: /mode/ });

// Punctuation
const LParen = createToken({ name: "LParen", pattern: /\(/ });
const RParen = createToken({ name: "RParen", pattern: /\)/ });
const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
const LBracket = createToken({ name: "LBracket", pattern: /\[/ });
const RBracket = createToken({ name: "RBracket", pattern: /\]/ });
const Colon = createToken({ name: "Colon", pattern: /:/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });
const At = createToken({ name: "At", pattern: /@/ });
const XParam = createToken({ name: "XParam", pattern: /x/ });


export const PatternName = createToken({
  name: "PatternName",
  pattern: /P[A-Za-z_]\w*/,
});


export const allTokens = [
  Cue, Fade, Page, Stopwatch, Video, Text, Pause, Speed, Stop,
  Audio, Button,
  After, Nav, PatternName, Choose,
  LParen, RParen, LBrace, RBrace, LBracket, RBracket, Colon, Comma, At, XParam,
  RangeLiteral, NumberLiteral, StringLiteral, Identifier, WS
];


export const CueLexer = new Lexer(allTokens);

// ============================================================================
// 2️⃣ PARSER
// ============================================================================
export class CueParser extends CstParser {
  constructor() {
    super(allTokens);
    const $ = this;



    function logEnterExit(name) {
      return {
        enter: () => console.log(`➡️ Enter ${name} (next: ${$.LA(1).image})`),
        exit: () => console.log(`⬅️ Exit  ${name} (next: ${$.LA(1).image})`)
      };
    }



    function unquoteLiteral(tok) {
      if (!tok) return undefined;
      const s = tok.image;
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
        return s.slice(1, -1);
      return s;
    }

    $.RULE("cueValue", () => {
      return $.OR([
        { ALT: () => parseFloat($.CONSUME(NumberLiteral).image) },
        { ALT: () => unquoteLiteral($.CONSUME(StringLiteral)) },
        { ALT: () => $.SUBRULE($.cueTop) },
        { ALT: () => $.CONSUME(Identifier).image },
      ]);
    });

    $.RULE("genericParamKV", () => {
      const keyTok = $.CONSUME(Identifier);
      $.CONSUME(Colon);
      const value = $.SUBRULE($.cueValue);
      return { key: keyTok.image, value };
    });

    // -----------------------
    // Generic key:value param list — reusable across cues
    // -----------------------
    $.RULE("genericParam", () => {
      $.CONSUME(Identifier, { LABEL: "key" });
      $.CONSUME(Colon);
      $.OR([
        { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "value" }) },
        { ALT: () => $.CONSUME(StringLiteral, { LABEL: "value" }) },
        { ALT: () => $.CONSUME(RangeLiteral, { LABEL: "value" }) },
        { ALT: () => $.SUBRULE($.cueExpr, { LABEL: "cueCall" }) }, // <— NEW
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
    // Generic size pair (e.g. 480x270)
    // -----------------------
    $.RULE("sizePair", () => {
      $.CONSUME(NumberLiteral, { LABEL: "width" });
      $.CONSUME(XParam);
      $.CONSUME1(NumberLiteral, { LABEL: "height" });
    });

    //////////////////////////////////////

    $.RULE("pageWithDuration", () => {
      $.CONSUME(Identifier, { LABEL: "page" });
      $.CONSUME(Colon);
      $.CONSUME(NumberLiteral, { LABEL: "dur" });
    });

    // ------------------------------------------------------------
    // patternExpr — handles identifiers, numbers, page:dur, patterns, etc.
    // ------------------------------------------------------------
    $.RULE("patternExpr", () => {
      console.log(`[TRACE] patternExpr enter — ${$.LA(1).image}`);

      $.OR([
        // 🟢 Pattern call
        {
          GATE: () => $.LA(1).tokenType.name === "PatternName",
          ALT: () => $.SUBRULE($.patternCall)
        },

        // 🟢 Page with duration (e.g. page1:4)
        {
          GATE: () => $.LA(1).tokenType.name === "Identifier" &&
            $.LA(2).tokenType.name === "Colon",
          ALT: () => $.SUBRULE($.pageWithDuration)
        },

        // Simple identifier
        { ALT: () => $.CONSUME(Identifier) },

        // Number literal
        { ALT: () => $.CONSUME(NumberLiteral) },

        // Grouped expression
        {
          ALT: () => {
            $.CONSUME(LParen);
            $.SUBRULE2($.patternExpr);
            $.CONSUME(RParen);
          }
        },
      ]);

      console.log(`[TRACE] patternExpr exit — ${$.LA(1).image}`);
    });

    // ------------------------------------------------------------
    // patternCall — generic pattern function call
    // e.g. Pseq([page1:4], 1)  /  Prand([page1, page2], inf)
    // ------------------------------------------------------------
    $.RULE("patternCall", () => {
      console.log(`[TRACE] patternCall enter — ${$.LA(1).image}`);

      // 1️⃣ Allow any token identified as a PatternName
      $.CONSUME(PatternName); // token type covers Pseq, Prand, Pshuf, Pchoose, etc.

      // 2️⃣ Opening parenthesis
      $.CONSUME(LParen);

      // 3️⃣ Opening square bracket for the sequence/list
      $.CONSUME(LBracket);

      // 4️⃣ One or more comma-separated pattern expressions
      $.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE1($.patternExpr)
      });

      // 5️⃣ Close the list
      $.CONSUME(RBracket);

      // 6️⃣ Optional repeat or argument (e.g., , 1)
      $.OPTION(() => {
        $.CONSUME(Comma);
        $.SUBRULE($.patternExpr, { LABEL: "repeats" });
      });

      // 7️⃣ Close the parentheses
      $.CONSUME(RParen);

      console.log(`[TRACE] patternCall exit — ${$.LA(1).image}`);
    });



    $.RULE("controlExpr", () => {
      $.OR([
        { ALT: () => $.CONSUME(Nav, { LABEL: "controlName" }) },
        // { ALT: () => $.CONSUME(Mode, { LABEL: "controlName" }) },
        { ALT: () => $.CONSUME(Identifier, { LABEL: "controlName" }) },
      ]);
      $.CONSUME(LParen);
      $.CONSUME1(Identifier, { LABEL: "controlArg" });

      // 🆕 Optional @target (restored from your old rule)
      $.OPTION(() => {
        $.CONSUME(At, { LABEL: "At" });   // same token as before
        $.CONSUME2(Identifier, { LABEL: "targetUid" });
      });

      $.CONSUME(RParen);
    });


    $.RULE("afterClause", () => {
      $.CONSUME(After);
      $.CONSUME(Colon);
      $.OR([
        // preferred explicit controlExpr (e.g. nav(scroll))
        { ALT: () => $.SUBRULE($.controlExpr, { LABEL: "afterAction" }) },
        // fallback literal like after:scroll
        { ALT: () => $.CONSUME(Identifier, { LABEL: "afterSimple" }) }
      ]);
    });

    ////////////////////////////////////////


    // -----------------------
    // Fade params
    // -----------------------
    $.RULE("fadeParam", () => {
      // key can be Mode keyword or plain identifier
      $.OR([
        // { ALT: () => $.CONSUME(Mode, { LABEL: "keyMode" }) },
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



    // ------------------------------------------------------------
    // cuePageTop — full cue:page(...) rule
    // ------------------------------------------------------------
    $.RULE("cuePageTop", () => {
      const dbg = {
        enter: () => console.log(`➡️ Enter cuePageTop (next: ${$.LA(1)?.image || "EOF"})`),
        exit: () => console.log(`⬅️ Exit  cuePageTop (next: ${$.LA(1)?.image || "EOF"})`)
      };
      dbg.enter();

      $.CONSUME(Page);          // cue:page
      $.CONSUME(LParen);        // open (

      // Everything inside parentheses handled by pageBody
      $.SUBRULE($.pageBody, { LABEL: "body" });

      $.CONSUME(RParen);        // close )
      dbg.exit();
    });


    // ------------------------------------------------------------
    // pageBody — handles pattern + optional after clause
    // ------------------------------------------------------------
    $.RULE("pageBody", () => {
      const dbg = {
        enter: () => console.log(`  ↳ Enter pageBody (lookahead: ${$.LA(1)?.image || "EOF"})`),
        exit: () => console.log(`  ↲ Exit  pageBody (lookahead: ${$.LA(1)?.image || "EOF"})`)
      };
      dbg.enter();

      // Main pattern expression (Pseq(...), simple identifier, etc.)
      console.log(`[TRACE] patternExpr start — lookahead: ${$.LA(1)?.image || "EOF"}`);
      $.SUBRULE($.patternExpr, { LABEL: "pattern" });
      console.log(`[TRACE] patternExpr end   — lookahead: ${$.LA(1)?.image || "EOF"}`);

      // Optional comma + after clause
      $.OPTION(() => {
        $.CONSUME(Comma);
        console.log(`[TRACE] afterClause start — lookahead: ${$.LA(1)?.image || "EOF"}`);
        $.SUBRULE($.afterClause, { LABEL: "afterClause" });
        console.log(`[TRACE] afterClause end   — lookahead: ${$.LA(1)?.image || "EOF"}`);
      });

      dbg.exit();
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

    // ------------------------------------------------------------
    // 🎬 cue:video(...) — video playback cue
    // ------------------------------------------------------------

    this.RULE("cueVideoTop", () => {
      this.CONSUME(Video);
      this.CONSUME(LParen);
      this.OPTION(() => {
        this.SUBRULE(this.videoParamList);
      });
      this.CONSUME(RParen);
    });

    this.RULE("videoParamList", () => {
      this.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE(this.videoParam)
      });
    });

    this.RULE("videoParam", () => {
      this.CONSUME(Identifier);
      this.CONSUME(Colon);
      this.OR([
        { ALT: () => $.SUBRULE($.sizePair) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME1(Identifier) }
      ]);
    });

    // ------------------------------------------------------------
    // cue:text(...)
    // ------------------------------------------------------------
    this.RULE("cueTextTop", () => {
      this.CONSUME(Text);
      this.SUBRULE(this.genericParamList);
    });

    // ------------------------------------------------------------
    // cueSpeedTop
    // ------------------------------------------------------------
    $.RULE("cueSpeedTop", () => {
      $.CONSUME(Speed);
      $.CONSUME(LParen);

      $.OR([
        // speed(3) or speed(3, dur:4, easing:linear)
        {
          ALT: () => {
            $.CONSUME(NumberLiteral, { LABEL: "shorthand" });

            $.OPTION(() => {
              $.CONSUME(Comma);
              $.AT_LEAST_ONE_SEP({
                SEP: Comma,
                DEF: () => $.SUBRULE($.genericParam) // SUBRULE #1
              });
            });
          }
        },

        // speed(value:3, dur:4)
        {
          ALT: () => {
            $.AT_LEAST_ONE_SEP1({
              SEP: Comma,
              DEF: () => $.SUBRULE1($.genericParam) // SUBRULE #2
            });
          }
        }
      ]);

      $.CONSUME(RParen);
    });

    $.RULE("cueNavTop", () => {
      $.CONSUME(Nav);        // nav
      $.CONSUME(LParen);     // LParen[0]

      $.OR([
        // -------------------------------------------------------
        // nav(mode(scroll@F))
        // -------------------------------------------------------
        {
          ALT: () => {
            // key: Identifier | Page
            $.OR1([
              { ALT: () => $.CONSUME(Identifier, { LABEL: "navKey" }) },   // Identifier[1]
              { ALT: () => $.CONSUME(Page, { LABEL: "navKey" }) }    // Page[1]
            ]);

            $.CONSUME1(LParen);                                           // LParen[1]

            // value: Identifier | Page
            $.OR2([
              { ALT: () => $.CONSUME1(Identifier, { LABEL: "navValue" }) }, // Identifier[2]
              { ALT: () => $.CONSUME1(Page, { LABEL: "navValue" }) }  // Page[2]
            ]);

            // optional @Target
            $.OPTION(() => {
              $.CONSUME(At);                                              // At[0]
              $.CONSUME2(Identifier, { LABEL: "navTargetValue" });        // Identifier[3]
            });

            $.CONSUME(RParen);                                            // RParen[0] (inner )
          }
        },

        // -------------------------------------------------------
        // nav(mode:scroll@F)  |  nav(page:page3)
        // -------------------------------------------------------
        {
          ALT: () => {
            // key: Identifier | Page
            $.OR3([
              { ALT: () => $.CONSUME3(Identifier, { LABEL: "navKey" }) },  // Identifier[4]
              { ALT: () => $.CONSUME2(Page, { LABEL: "navKey" }) }   // Page[3]
            ]);

            $.CONSUME(Colon);                                             // Colon[0]

            // value: Identifier | Page
            $.OR4([
              { ALT: () => $.CONSUME4(Identifier, { LABEL: "navValue" }) }, // Identifier[5]
              { ALT: () => $.CONSUME3(Page, { LABEL: "navValue" }) }  // Page[4]
            ]);

            // optional @Target
            $.OPTION1(() => {
              $.CONSUME1(At);                                             // At[1]
              $.CONSUME5(Identifier, { LABEL: "navTargetValue" });        // Identifier[6]
            });
          }
        }
      ]);

      $.CONSUME1(RParen);                                                 // RParen[1] (final )
    });


    this.RULE("cueStopTop", () => {
      this.CONSUME(Stop);

      this.OPTION(() => {
        this.CONSUME(LParen);
        this.OPTION1(() => this.SUBRULE(this.genericParamList)); // allow zero OR more params
        this.CONSUME(RParen);
      });
    });




    $.RULE("cuePauseTop", () => {
      $.CONSUME(Pause);
      $.CONSUME(LParen);

      $.OR([
        // shorthand: cue:pause(3)
        { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "shorthandDur" }) },

        // explicit params: cue:pause(dur:3, count:true)
        {
          ALT: () => $.AT_LEAST_ONE_SEP({
            SEP: Comma,
            DEF: () => $.SUBRULE($.genericParam),
          })
        }
      ]);

      $.CONSUME(RParen);
    });

    // ------------------------------------------------------------
    // cue:metronome(...) / cue:metro(...)
    // ------------------------------------------------------------
    $.RULE("cueMetronomeTop", () => {
      $.CONSUME(Identifier, { LABEL: "metronomeName" }); // 'metro' or 'metronome'
      $.SUBRULE($.genericParamList); // genericParamList already handles ( ... )
    });

    $.RULE("cueExpr", () => {
      $.CONSUME(Identifier, { LABEL: "fn" }); // e.g. nav, text, audio, metro, etc.
      $.CONSUME(LParen);
      $.CONSUME1(Identifier, { LABEL: "arg" }); // sectionB, msgHello, etc.
      $.CONSUME(RParen);
    });


    // ------------------------------------------------------------
    // ------------------------------------------------------------

$.RULE("buttonStyleBlock", () => {
  $.CONSUME(LParen);

  const style = {};

  $.OPTION(() => {
    $.AT_LEAST_ONE_SEP({
      SEP: Comma,
      DEF: () => {
        const kv = $.SUBRULE($.genericParamKV);
        style[kv.key] = kv.value;
      }
    });
  });

  $.CONSUME(RParen);
  return style;
});
    // ------------------------------------------------------------
    // ------------------------------------------------------------

$.RULE("cueAudioTop", () => {
  $.CONSUME(Audio);
  $.SUBRULE($.genericParamList);  // <-- (src:..., amp:..., loop:...)
});


    // ------------------------------------------------------------
    // ------------------------------------------------------------

$.RULE("cueButtonTop", () => {
  $.CONSUME(Button);
  $.CONSUME(LParen);

  // label: "Kick"
  $.CONSUME(Identifier, { LABEL: "labelKey" });
  $.CONSUME(Colon);
  $.CONSUME(StringLiteral, { LABEL: "labelValue" });

  // optional: , trigger: audio(...)
  $.OPTION(() => {
    $.CONSUME(Comma);
    $.CONSUME2(Identifier, { LABEL: "triggerKey" });
    $.CONSUME2(Colon);
    $.SUBRULE($.cueAudioTop, { LABEL: "triggerValue" });
  });

  // optional: , style(...)
  $.OPTION2(() => {
    $.CONSUME3(Comma);
    $.CONSUME3(Identifier, { LABEL: "styleKey" });
    $.CONSUME2(LParen);

    $.AT_LEAST_ONE_SEP({
      SEP: Comma,
      DEF: () => {
        $.SUBRULE($.genericParam, { LABEL: "styleParam" });
      },
    });

    $.CONSUME(RParen);
  });

  $.CONSUME2(RParen);
});



    // ------------------------------------------------------------
    // ------------------------------------------------------------


    // -----------------------
    // cueTop — only fade|page at top level
    // -----------------------
    $.RULE("cueTop", () => {
      // Allow optional cue: prefix (backwards compatible)
      $.OPTION(() => {
        $.CONSUME(Cue);
        $.CONSUME(Colon);
      });

      $.OR([
        { ALT: () => $.SUBRULE($.cueFadeTop) },
        { ALT: () => $.SUBRULE($.cuePageTop) },
        { ALT: () => $.SUBRULE($.cueStopwatchTop) },
        { ALT: () => $.SUBRULE($.cueVideoTop) },
        { ALT: () => $.SUBRULE($.cueTextTop) },
        { ALT: () => $.SUBRULE($.cueMetronomeTop) },
        { ALT: () => $.SUBRULE($.cuePauseTop) },
        { ALT: () => $.SUBRULE($.cueSpeedTop) },
        { ALT: () => $.SUBRULE($.cueStopTop) },
        { ALT: () => $.SUBRULE($.cueNavTop) },
        { ALT: () => $.SUBRULE($.cueButtonTop) },
        { ALT: () => $.SUBRULE($.cueAudioTop) },
        
      ]);
    });

    this.performSelfAnalysis();
  }

}
// ------------------------------------
// 🔍 DEBUG TOKEN STREAM
// ------------------------------------
export function debugTokens(inputText) {
  const lex = CueLexer.tokenize(inputText);
  console.groupCollapsed("[LexerDebug] Tokens");
  console.table(
    lex.tokens.map(t => ({
      idx: t.startOffset,
      image: t.image,
      type: t.tokenType.name
    }))
  );
  console.groupEnd();
  return lex.tokens;
}




// Helpers ////////////////

// ------------------------------------------------------------
// convertPatternNodeToAST(node)
// ------------------------------------------------------------
//  Purpose:
// Recursively converts a Chevrotain CST node produced by the
// unified patternExpr grammar into a lightweight AST object.
//
//  Supports:
//   • Single identifiers → wraps as { type:'Pseq', list:[id], repeats:1 }
//   • Numeric / string literals
//   • Pattern calls (Pseq, Prand, Pshuf, Pchoose) with nested lists
//   • Optional repeat argument (numeric, 'inf', or pattern)
//
//  Usage:
// Used by cue:page, cue:fade, cue:video, and any other cues that
// accept pattern-based parameters. Keeps the AST format consistent
// across all cue types.
//
//  Example:
//   cue:page(Pseq([page1,page2],2))
//
//   → {
//        type: "cuePage",
//        pattern: {
//          type: "Pseq",
//          list: ["page1","page2"],
//          repeats: 2
//        }
//     }
//
//   Notes:
//   • Safe to call recursively — handles nested patternExpr nodes.
//   • Returns simple { type:'Literal', value:... } for unmatched nodes.
//   • Designed to normalise single values into 1-element Pseq patterns.
//
// ------------------------------------------------------------
// ------------------------------------------------------------
// convertPatternNodeToAST(node)
// ------------------------------------------------------------
// Converts CST nodes for pattern constructs (Pseq, Prand, etc.)
// into clean AST objects. Works with a single generic PatternName
// token that matches any “Pxxx” form — no need for explicit Pseq/Prand definitions.
// ------------------------------------------------------------
function convertPatternNodeToAST(node) {
  if (!node) {
    console.warn("[convertPatternNodeToAST] ⚠️ Node is null");
    return { type: "Literal", value: null };
  }

  // Debug (optional, can comment out later)
  console.log("[convertPatternNodeToAST] 🧩 Node:", node.name || node.type, node.children);

  // --- patternExpr wrapper ---
  if (node.name === "patternExpr") {
    if (node.children?.patternCall)
      return convertPatternNodeToAST(node.children.patternCall[0]);

    if (node.children?.pageWithDuration)
      return convertPatternNodeToAST(node.children.pageWithDuration[0]);

    if (node.children?.Identifier)
      return { type: "Literal", value: node.children.Identifier[0].image };

    if (node.children?.NumberLiteral)
      return { type: "Literal", value: Number(node.children.NumberLiteral[0].image) };
  }

  // --- pageWithDuration support ---
  if (node.name === "pageWithDuration") {
    const id =
      node.children.Identifier?.[0]?.image ||
      node.children.page?.[0]?.image ||
      null;
    const dur =
      node.children.NumberLiteral?.[0]?.image ||
      node.children.dur?.[0]?.image ||
      0;
    return { type: "Literal", value: { page: id, dur: Number(dur) } };
  }

  // --- Number or String literal ---
  if (node.name === "NumberLiteral" || node.name === "StringLiteral") {
    return { type: "Literal", value: node.image };
  }

  // --- Generic pattern call (Pseq, PRand, etc.) ---
  if (node.name === "patternCall") {
    const name = node.children?.PatternName?.[0]?.image ?? "Pseq";

    // Recurse into all child patternExpr nodes (including nested Pseqs)
    const exprs = (node.children.patternExpr || []).map(convertPatternNodeToAST);

    // Handle repeats argument if present
    let repeats = 1;
    if (node.children.repeats?.[0]) {
      const repNode = node.children.repeats[0];
      const num = repNode.children?.NumberLiteral?.[0]?.image;
      if (num) repeats = Number(num);
    }

    // Flatten nested Literals inside list
    const list = exprs.map(e => {
      if (e.type === "Literal" && e.value?.page) return e; // page literal
      return e; // keep nested pattern objects intact
    });

    return { type: name, list, repeats };
  }

  // --- Fallback recursion ---
  if (node.children?.patternExpr)
    return convertPatternNodeToAST(node.children.patternExpr[0]);

  return { type: "Literal", value: node.image || null };
}


// ------------------------------------------------------------
// extractNumber(children, fallback = 0)
// ------------------------------------------------------------
//  Purpose:
// Utility helper to safely extract a numeric value from a CST
// node’s children object, handling optional or missing fields.
//
//  Supports:
//   • children.NumberLiteral   – standard numeric tokens
//   • children.dur             – duration fields (e.g. cue:fade(dur:2))
//   • children.xVal            – custom numeric parameters (e.g. x:3)
//
//  Behaviour:
// Returns the first valid numeric token as a JavaScript Number.
// If no valid numeric token is found, returns the provided fallback.
//
//  Example:
//   extractNumber(node.children)      → 1.25
//   extractNumber(node.children, 0)   → 0  (if no number found)
//
//  Notes:
//   • Prevents “undefined → NaN” propagation in AST construction.
//   • Used throughout CST→AST conversion for cue parameters
//     like dur, x, hold, speed, etc.
//
// ------------------------------------------------------------

function extractNumber(children, fallback = 0) {
  if (!children) return fallback;
  const num =
    children.NumberLiteral?.[0]?.image ||
    children.dur?.[0]?.image ||
    children.xVal?.[0]?.image;
  return num ? Number(num) : fallback;
}


// ------------------------------------------------------------
// extractAfterClause — safely extracts the "after" clause
// ------------------------------------------------------------
// ------------------------------------------------------------
// Extract `after:` clause as a normalized object:
//
//   { control: "nav", arg: "scroll", target: "F" | null }
//
// Works with CSTs where `afterAction` either IS the controlExpr
// or wraps it. Also tolerates missing pieces without throwing.
// ------------------------------------------------------------
export function extractAfterClause(children) {
  const clause = children?.afterClause?.[0];
  const action = clause?.children?.afterAction?.[0];
  const ctrl = action?.children?.controlExpr?.[0] || action;

  if (!ctrl?.children) return null;

  const control = ctrl.children.controlName?.[0]?.image || null;
  const arg = ctrl.children.controlArg?.[0]?.image || null;
  const target = ctrl.children.targetUid?.[0]?.image || null;

  if (!control) return null;
  console.log("[extractAfterClause] ✅ control:", control, "arg:", arg, "target:", target);
  return { control, arg, target };
}



// ============================================================================
// 3: CST → AST
// ============================================================================

// ------------------------------------------------------------
// cstToAst(cst)
// ------------------------------------------------------------
//  Purpose:
// Converts a full Chevrotain Concrete Syntax Tree (CST) produced
// by the Oscilla CueDSL parser into a lightweight, normalised AST
// used internally by cueHandlers (e.g. cue:page, cue:fade, cue:video).
//
//  Responsibilities:
//   • Detect the cue type from the CST root (e.g. cuePageTop, cueFadeTop)
//   • Extract and flatten relevant parameter blocks
//   • Convert child CST nodes via helper functions
//       → extractNumber()            for numeric params
//       → convertPatternNodeToAST()  for patternExpr-based params
//   • Return a minimal JSON-style object describing cue type + args
//
//  Behaviour:
// Each cue type is handled in its own conditional block, ensuring
// consistent AST format and easy extensibility when adding new cues.
//
//  Example:
//
//   cue:fade(mode:in, dur:2, from:0, to:1)
//
//   → {
//        type: "cueFade",
//        params: { mode: "in", dur: 2, from: 0, to: 1 }
//     }
//
//   cue:page(Pseq([page1, page2], 2))
//
//   → {
//        type: "cuePage",
//        pattern: {
//          type: "Pseq",
//          list: ["page1", "page2"],
//          repeats: 2
//        }
//     }
//
//  Notes:
//   • Acts as the main interface between the parser (Chevrotain) and
//     runtime logic in cues.js.
//   • All cue-specific extractors follow the same pattern:
//         const node = cst.children?.cueTypeTop?.[0] || (cst.name === "cueTypeTop" ? cst : null);
//   • Returns null if parsing fails or cue type is unrecognised.
//
// ------------------------------------------------------------



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


  // ------------------------------------------------------------
  // cueNav()
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // cueNav(...) AST builder
  // ------------------------------------------------------------
  const navNode =
    cst.children?.cueNavTop?.[0] ||
    (cst.name === "cueNavTop" ? cst : null);

  if (navNode) {
    const ch = navNode.children;

    // navKey may be Identifier or Page token
    const keyToken =
      ch.navKey?.[0] ||
      ch.Identifier?.[0] || // fallback safety
      null;

    const key = keyToken?.image ?? null;

    // navValue is always Identifier in our design
    const valueToken = ch.navValue?.[0] || null;
    const value = valueToken?.image ?? null;

    // Optional @target
    const targetToken = ch.navTargetValue?.[0] || null;
    const target = targetToken?.image ?? null;

    return {
      type: "cueNav",
      key,
      value,
      target
    };
  }


  // ------------------------------------------------------------
  // cue:page(...) — unified pattern + after clause support
  // ------------------------------------------------------------
  // --- cue:page ---
  const ast = {};

  const pageNode = cst.children?.cuePageTop?.[0];
  if (pageNode) {
    const bodyNode = pageNode.children?.body?.[0];
    const patternNode = bodyNode?.children?.pattern?.[0];
    const afterNode = bodyNode?.children?.afterClause?.[0];

    ast.type = "cuePage";
    ast.pattern = patternNode ? convertPatternNodeToAST(patternNode) : null;
    ast.onCompletion = afterNode
      ? extractAfterClause(bodyNode.children)
      : null;

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

  // ------------------------------------------------------------
  // 🎬 cue:video(...) → AST
  // ------------------------------------------------------------
  const videoNode = cst.children?.cueVideoTop?.[0] || (cst.name === "cueVideoTop" ? cst : null);
  if (videoNode) {
    const params = {};
    const list = videoNode.children?.videoParamList?.[0];
    const items = list?.children?.videoParam || [];

    for (const p of items) {
      const key = p.children.Identifier[0].image;
      const valueToken =
        p.children.NumberLiteral?.[0] ||
        p.children.StringLiteral?.[0] ||
        p.children.Identifier?.[1]; // second identifier (if present)
      const rawVal = valueToken?.image ?? null;

      const val = isNaN(rawVal) ? rawVal?.replace(/^"|"$/g, "") : Number(rawVal);
      params[key] = val;
    }

    return { type: "cueVideo", params };
  }

  // ------------------------------------------------------------
  // cue:text(...)
  // ------------------------------------------------------------
  const textNode =
    cst.children?.cueTextTop?.[0] ||
    (cst.name === "cueTextTop" ? cst : null);

  if (textNode) {
    const args = [];
    const list = textNode.children.genericParamList?.[0];
    const items = list?.children.genericParam || [];

    for (const p of items) {
      const keyNode = p.children.key?.[0];
      const valNode = p.children.value?.[0];

      const key =
        keyNode?.image ||
        keyNode?.children?.Identifier?.[0]?.image ||
        "unknown";
      let val = null;
      if (valNode?.children?.StringLiteral?.[0]) {
        val = valNode.children.StringLiteral[0].image;
      } else if (valNode?.children?.NumberLiteral?.[0]) {
        val = valNode.children.NumberLiteral[0].image;
      } else if (valNode?.children?.RangeLiteral?.[0]) {
        val = valNode.children.RangeLiteral[0].image;
      } else if (valNode?.image) {
        val = valNode.image;
      }


      args.push({ type: key, value: val });
    }

    return { type: "cueText", args };
  }


  // ============================================================================
  // 🔹 cue:metronome(...) / cue:metro(...)
  // ============================================================================
  const metroNode = cst.children?.cueMetronomeTop?.[0]
    || (cst.name === "cueMetronomeTop" ? cst : null);

  if (metroNode) {
    const args = [];
    const list = metroNode.children.genericParamList?.[0];
    const params = list?.children.genericParam || [];
    for (const p of params) {
      const key = p.children.key?.[0]?.image;
      const val = p.children.value?.[0]?.image;
      if (key) args.push({
        type: key,
        value: isNaN(Number(val)) ? val : Number(val)
      });
    }

    return { type: "cueMetronome", args };
  }




  // ------------------------------------------------------------
  // cue:speed(...)
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // cue:speed(...)  AST Builder
  // ------------------------------------------------------------
  const speedNode =
    cst.children?.cueSpeedTop?.[0] ||
    (cst.name === "cueSpeedTop" ? cst : null);

  if (speedNode) {
    // shorthand: speed(3)
    const shorthandTok = speedNode.children?.shorthand?.[0] ||
      speedNode.children?.NumberLiteral?.[0];

    let value = shorthandTok ? Number(shorthandTok.image) : null;
    let dur = null;
    let easing = null;

    // optional param list
    const paramNodes =
      speedNode.children.genericParamList ||
      speedNode.children.genericParam || [];

    for (const p of paramNodes) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (!key || raw == null) continue;

      const num = Number(raw);

      if (key === "dur" && !isNaN(num)) dur = num;
      else if (key === "easing") easing = raw;
      else if (!isNaN(num) && (key === "value" || key === "speed" || key === "multiplier")) {
        value = num;
      }
    }

    return { type: "cueSpeed", value, dur, easing };
  }


// ------------------------------------------------------------
// cue:button(...) AST Builder (returns legacy { cueExpr, opt })
// ------------------------------------------------------------
// ------------------------------------------------------------
// cue:button(...) AST Builder  (Clean + Future-Safe)
// ------------------------------------------------------------
// ------------------------------------------------------------
// cue:button(...) AST Builder
// ------------------------------------------------------------
const buttonNode =
  cst.children?.cueButtonTop?.[0] ||
  (cst.name === "cueButtonTop" ? cst : null);

if (buttonNode) {
  const labelTok = buttonNode.children.labelValue?.[0];
  const label = labelTok ? labelTok.image.replace(/^"|"$/g, "") : "";

  const triggerAst = buttonNode.children.triggerValue?.[0]
    ? cstToAst(buttonNode.children.triggerValue[0])
    : null;

  const opt = {};
  const styleList = buttonNode.children.styleParam || [];
  for (const p of styleList) {
    const key = p.children.key?.[0]?.image;
    let val = p.children.value?.[0]?.image || "";
    val = val.replace(/^"|"$/g, "");
    opt[key] = val;
  }

  return {
    type: "cueButton",
    label,        // ✅ keep raw label
    triggerAst,   // ✅ keep raw AST
    opt           // ✅ raw style map
  };
}





// ------------------------------------------------------------
// cue:audio(...)  AST Builder
// ------------------------------------------------------------
// ------------------------------------------------------------
// cue:audio(...)  AST Builder
// ------------------------------------------------------------
const audioNode =
  cst.children?.cueAudioTop?.[0] ||
  (cst.name === "cueAudioTop" ? cst : null);

if (audioNode) {
  let src = null;
  let amp = null;
  let loop = null;

  const list = audioNode.children.genericParamList?.[0];
  const params = list?.children?.genericParam || [];

  for (const p of params) {
    const key = p.children.key?.[0]?.image;
    let val = p.children.value?.[0]?.image || "";
    val = val.replace(/^"|"$/g, ""); // strip quotes

    if (key === "src") src = val;
    else if (key === "amp") amp = Number(val);
    else if (key === "loop") loop = Number(val);
  }

  // ✅ Construct trigger expression string for handleCueTrigger()
  const exprParts = [];
  if (src) exprParts.push(`src:${src}`);
  if (amp != null) exprParts.push(`amp:${amp}`);
  if (loop != null) exprParts.push(`loop:${loop}`);

  return {
    type: "cueAudio",
    src,
    amp,
    loop,
    cueExpr: `audio(${exprParts.join(", ")})` // ✅ correct output
  };
}


  // ------------------------------------------------------------
  // cue:pause(...)
  // ------------------------------------------------------------
  const pauseNode =
    cst.children?.cuePauseTop?.[0] ||
    (cst.name === "cuePauseTop" ? cst : null);

  if (pauseNode) {
    let dur = null;
    let count = false;
    let next = null;

    const params = pauseNode.children.genericParam || [];
    for (const p of params) {
      const key = p.children.key[0].image;

      // cueExpr form e.g. next:nav(sectionB)
      if (p.children.cueCall) {
        const call = p.children.cueCall[0].children;
        const fn = call.fn[0].image;
        const arg = call.arg[0].image;
        next = `${fn}(${arg})`;
        continue;
      }

      // Standard values
      const raw = p.children.value?.[0]?.image;
      if (key === "dur") dur = Number(raw);
      if (key === "count") count = (raw === "true" || raw === "1");
    }

    return { type: "cuePause", dur, count, next };
  }

  // ------------------------------------------------------------
  // cueStopTop → AST
  // ------------------------------------------------------------
  if (cst.children?.cueStopTop?.[0]) {
    const node = cst.children.cueStopTop[0];

    // Extract params if any:
    const params = {};
    const paramNodes = node.children.genericParam || [];

    for (const p of paramNodes) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (key && raw !== undefined) {
        params[key] = isNaN(raw) ? raw : Number(raw);
      }
    }

    return {
      type: "cueStop",
      next: params.next ?? null
    };
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
  debugTokens(input);  // 👈 add this

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

window.parseCueToAST = parseCueToAST;