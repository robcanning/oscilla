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
const OSCILLA_DSL_DEBUG = true; // turn off by setting to false

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
const Rotate = createToken({ name: "Rotate", pattern: /\brotate\b/, longer_alt: Identifier });
const Scale = createToken({ name: "Scale", pattern: /\bscale\b/, longer_alt: Identifier });
const O2P = createToken({ name: "O2P", pattern: /\bo2p\b/, longer_alt: Identifier });



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
const True = createToken({ name: "True", pattern: /\btrue\b/ });
const False = createToken({ name: "False", pattern: /\bfalse\b/ });

export const PatternName = createToken({
  name: "PatternName",
  pattern: /P[A-Za-z_]\w*/,
});


export const allTokens = [
  Cue, Fade, Page, Stopwatch, Video, Text, Pause, Speed, Stop,
  Audio, Button, Nav,
  Rotate, Scale, O2P,
  After, PatternName, Choose,
  LParen, RParen, LBrace, RBrace, LBracket, RBracket, Colon, Comma, At, XParam,
  RangeLiteral, NumberLiteral, StringLiteral, True, False,
  Identifier, WS
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


    $.RULE("value", () => {
      $.OR([
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(True) },
        { ALT: () => $.CONSUME(False) },
        { ALT: () => $.CONSUME(Identifier) },
      ]);
    });


    // ----USED FOR PATTERNING ANIMATION ROTATE SCALE ETC -------------------
    $.RULE("animPatternCall", () => {
      $.CONSUME(PatternName);   // Pseq, Prand, Pshuf, etc.
      $.CONSUME(LParen);

      $.OR([
        // Case 1: Pseq([1,2,3], inf)
        {
          GATE: () => $.LA(1).tokenType.name === "LBracket",
          ALT: () => {
            $.CONSUME(LBracket);
            $.MANY_SEP({
              SEP: Comma,
              DEF: () => $.SUBRULE1($.animValue)
            });
            $.CONSUME(RBracket);

            // optional second arg e.g., Pseq([1,2], inf)
            $.OPTION(() => {
              $.CONSUME(Comma);
              $.SUBRULE2($.animValue);
            });
          }
        },

        // Case 2: Pseq(1,2,3, inf)
        {
          ALT: () => {
            $.AT_LEAST_ONE_SEP({
              SEP: Comma,
              DEF: () => $.SUBRULE3($.animValue)
            });
          }
        }
      ]);

      $.CONSUME(RParen);
    });




    // Accepts arrays, animation pattern calls (Pseq/Prand/...),
    // or plain literals.
    $.RULE("animValue", () => {
      return $.OR([
        { ALT: () => $.SUBRULE($.arrayValue) },

        {
          GATE: () =>
            $.LA(1).tokenType === PatternName,   // ✅ Fix
          ALT: () => $.SUBRULE($.patternCall)
        },

        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(True) },
        { ALT: () => $.CONSUME(False) },
        { ALT: () => $.CONSUME(Identifier) },
      ]);
    });


    // Simple recursive array that nests animValue (so arrays can hold patterns, pairs, etc.)
    $.RULE("arrayValue", () => {
      $.CONSUME(LBracket);
      const items = [];
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => items.push($.SUBRULE($.animValue))
      });
      $.CONSUME(RBracket);
      return items;
    });


    // Animation-specific key:value rule used in rotate(), scale(), o2p()
    // value may be: number, string, true/false, identifier, array, or pattern call (Pseq, Prand…)
    $.RULE("animGenericParam", () => {
      const keyTok = $.CONSUME(Identifier, { LABEL: "key" });
      $.CONSUME(Colon);

      // ✅ animValue already covers all possible types, including patterns and arrays.
      $.SUBRULE($.animValue, { LABEL: "value" });

      return { key: keyTok.image };
    });

    // A list of animation params using the rule above.
    $.RULE("animGenericParamList", () => {
      $.CONSUME(LParen);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.animGenericParam)
      });
      $.CONSUME(RParen);
    });


    // -----------------------


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
        { ALT: () => $.CONSUME(True, { LABEL: "value" }) },
        { ALT: () => $.CONSUME(False, { LABEL: "value" }) },
        //  { ALT: () => $.SUBRULE($.cueExpr, { LABEL: "cueCall" }) },
        { ALT: () => $.CONSUME1(Identifier, { LABEL: "value" }) },
      ]);
    });



    $.RULE("genericParamList", () => {
      $.CONSUME(LParen);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.genericParam),
      });
      $.OPTION(() => $.CONSUME(Comma)); // ✅ ALLOW final trailing comma
      $.CONSUME(RParen);
    });


    $.RULE("genericParamListNoParens", () => {
      $.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.genericParam)
      });
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
      // console.log(`[TRACE] patternExpr enter — ${$.LA(1).image}`);

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

      // console.log(`[TRACE] patternExpr exit — ${$.LA(1).image}`);
    });

    // ------------------------------------------------------------
    // patternCall — generic pattern function call
    // e.g. Pseq([page1:4], 1)  /  Prand([page1, page2], inf)
    // ------------------------------------------------------------
    $.RULE("patternCall", () => {
      // console.log(`[TRACE] patternCall enter — ${$.LA(1).image}`);

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

      // console.log(`[TRACE] patternCall exit — ${$.LA(1).image}`);
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
      // console.log(`[TRACE] patternExpr start — lookahead: ${$.LA(1)?.image || "EOF"}`);
      $.SUBRULE($.patternExpr, { LABEL: "pattern" });
      // console.log(`[TRACE] patternExpr end   — lookahead: ${$.LA(1)?.image || "EOF"}`);

      // Optional comma + after clause
      $.OPTION(() => {
        $.CONSUME(Comma);
        // console.log(`[TRACE] afterClause start — lookahead: ${$.LA(1)?.image || "EOF"}`);
        $.SUBRULE($.afterClause, { LABEL: "afterClause" });
        // console.log(`[TRACE] afterClause end   — lookahead: ${$.LA(1)?.image || "EOF"}`);
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
    // cueSpeedTop (grammar) — supports speed(3) and keyed params
    // ------------------------------------------------------------
    $.RULE("cueSpeedTop", () => {
      $.CONSUME(Speed);
      $.CONSUME(LParen);

      $.OPTION(() => {
        $.OR([
          // speed(3) or speed(3, dur:4, ease:linear)
          {
            ALT: () => {
              $.CONSUME(NumberLiteral, { LABEL: "shorthand" });
              $.OPTION1(() => {
                $.CONSUME(Comma);
                $.AT_LEAST_ONE_SEP({
                  SEP: Comma,
                  DEF: () => $.SUBRULE($.genericParam)
                });
              });
            }
          },
          // speed(value:..., add:..., dur:..., ease:..., uid:...)
          {
            ALT: () => {
              $.AT_LEAST_ONE_SEP1({
                SEP: Comma,
                DEF: () => $.SUBRULE1($.genericParam)
              });
            }
          }
        ]);
      });

      $.CONSUME(RParen);
    });

    $.RULE("cueNavTop", () => {
      $.CONSUME(Nav);
      $.CONSUME(LParen);

      // First token: scroll | scrollPaused | page names | rehearsal names
      $.CONSUME(Identifier, { LABEL: "navAction" });

      // Optional @Target
      $.OPTION(() => {
        $.CONSUME(At);
        $.CONSUME1(Identifier, { LABEL: "navTarget" });
      });

      // Optional param list (uid, etc.)
      $.OPTION1(() => {
        $.CONSUME(Comma);
        $.SUBRULE($.genericParamListNoParens);
      });

      $.CONSUME(RParen);
    });


    this.RULE("cueStopTop", () => {
      this.CONSUME(Stop);

      this.OPTION(() => {
        this.CONSUME(LParen);

        // --- allow zero or more params ---
        this.OPTION1(() => {
          this.SUBRULE(this.genericParam);
          this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.genericParam);
          });
        });

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

    // $.RULE("cueExpr", () => {
    //   $.CONSUME(Identifier, { LABEL: "fn" }); // e.g. nav, text, audio, metro, etc.
    //   $.CONSUME(LParen);
    //   $.CONSUME1(Identifier, { LABEL: "arg" }); // sectionB, msgHello, etc.
    //   $.CONSUME(RParen);
    // });


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

    $.RULE("cueAudioTop", () => {
      $.CONSUME(Audio);
      $.SUBRULE($.genericParamList);  // <-- (src:..., amp:..., loop:...)
    });

    // ------------------------------------------------------------

    $.RULE("cueButtonTop", () => {
      $.CONSUME(Button);
      $.CONSUME(LParen);

      // ✅ OPTIONAL label: "Something",
      $.OPTION(() => {
        $.CONSUME(Identifier, { LABEL: "labelKey" });
        $.CONSUME(Colon);
        $.CONSUME(StringLiteral, { LABEL: "labelValue" });
        $.CONSUME(Comma);
      });

      // ✅ REQUIRED: trigger: <any cue expression>
      $.CONSUME2(Identifier, { LABEL: "triggerKey" }); // must match "trigger"
      $.CONSUME2(Colon);
      $.SUBRULE($.cueTop, { LABEL: "triggerValue" });

      // ✅ OPTIONAL: , style(...)
      $.OPTION2(() => {
        $.CONSUME2(Comma);
        $.CONSUME3(Identifier, { LABEL: "styleKey" });
        $.CONSUME2(LParen);

        $.AT_LEAST_ONE_SEP({
          SEP: Comma,
          DEF: () => $.SUBRULE($.genericParam, { LABEL: "styleParam" })
        });

        $.CONSUME(RParen);
      });

      $.CONSUME2(RParen);
    });

    // ----ANIMATION CUE RULES ---------------------------------------

    // rotate(...)
    $.RULE("cueRotateTop", () => {
      console.log("[PARSE] cueRotateTop matched!");

      $.CONSUME(Rotate);
      $.SUBRULE($.animGenericParamList);
    });

    // scale(...)
    $.RULE("cueScaleTop", () => {
      console.log("[PARSE] cueScaleTop matched!");

      $.CONSUME(Scale);
      $.SUBRULE($.animGenericParamList);
    });

    // o2p(...)
    $.RULE("cueO2PTop", () => {
      console.log("[PARSE] cueO2PTop matched!");

      $.CONSUME(O2P);
      $.SUBRULE($.animGenericParamList);
    });

    // -----------------------
    // cueTop — only fade|page at top level
    // -----------------------
    $.RULE("cueTop", () => {
      console.log("[cueTop] LA(1):", $.LA(1).image, $.LA(1).tokenType.name);

      // Allow optional cue: prefix (backwards compatible)
      $.OPTION(() => {
        $.CONSUME(Cue);
        $.CONSUME(Colon);
      });

      $.OR([
        { ALT: () => $.SUBRULE($.cueFadeTop) },
        { ALT: () => $.SUBRULE($.cueNavTop) },
        { ALT: () => $.SUBRULE($.cuePageTop) },
        { ALT: () => $.SUBRULE($.cueStopwatchTop) },
        { ALT: () => $.SUBRULE($.cueVideoTop) },
        { ALT: () => $.SUBRULE($.cueTextTop) },
        { ALT: () => $.SUBRULE($.cueMetronomeTop) },
        { ALT: () => $.SUBRULE($.cuePauseTop) },
        { ALT: () => $.SUBRULE($.cueSpeedTop) },
        { ALT: () => $.SUBRULE($.cueStopTop) },
        { ALT: () => $.SUBRULE($.cueButtonTop) },
        { ALT: () => $.SUBRULE($.cueAudioTop) },
        { ALT: () => $.SUBRULE($.cueRotateTop) },
        { ALT: () => $.SUBRULE($.cueScaleTop) },
        { ALT: () => $.SUBRULE($.cueO2PTop) },

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

    const action = ch.navAction?.[0]?.image ?? null;
    const target = ch.navTarget?.[0]?.image ?? null;

    // extract uid if present
    const params =
      (ch.genericParamList || ch.genericParam || []).reduce((acc, p) => {
        const key = p.children.key?.[0]?.image;
        const raw = p.children.value?.[0]?.image;
        if (key && raw != null) acc[key] = raw.replace(/^["']|["']$/g, '');
        return acc;
      }, {});

    let uid = params.uid;
    if (!uid) {
      // Derive a stable default identity
      uid = target ? `${action}@${target}` : action;
    }

    return {
      type: "cueNav",
      action,
      target,
      uid
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
  // cue:speed(...)  CST → AST
  // ------------------------------------------------------------
  const speedNode =
    cst.children?.cueSpeedTop?.[0] ||
    (cst.name === "cueSpeedTop" ? cst : null);

  if (speedNode) {
    // shorthand: speed(3)
    const shorthandTok =
      speedNode.children?.shorthand?.[0] ||
      speedNode.children?.NumberLiteral?.[0];

    let value = shorthandTok ? Number(shorthandTok.image) : null;
    let add = null;
    let dur = null;
    let ease = null;
    let uid = null;

    const parseVal = (raw) => {
      if (raw == null) return null;
      const s = String(raw).trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
      if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
      if (!isNaN(s) && s !== "") return Number(s);
      return s;
    };

    // optional param list (works with genericParamList or bare genericParam[])
    const paramNodes =
      speedNode.children.genericParamList ||
      speedNode.children.genericParam || [];

    for (const p of paramNodes) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (!key) continue;
      const v = parseVal(raw);

      if (key === "value" || key === "speed" || key === "multiplier") value = Number(v);
      else if (key === "add") add = Number(v);
      else if (key === "dur") dur = Number(v);
      else if (key === "ease" || key === "easing") ease = String(v);
      else if (key === "uid") uid = v;
    }

    return { type: "cueSpeed", value, add, dur, ease, uid };
  }



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

    //  const triggerExpr = triggerAst.cueExpr;

    return {
      type: "cueButton",
      label,
      triggerAst: {
        ...triggerAst,        // ✅ real code, this copies src, amp, loop, cueExpr, toggle, uid, etc.
        uid: triggerAst.uid ?? null   // ✅ ensure uid exists (even if missing)
      },
      opt
    };
  }


  // ------------------------------------------------------------
  // cueAudio(...) AST Builder
  // ------------------------------------------------------------
  const audioNode =
    cst.children?.cueAudioTop?.[0] ||
    (cst.name === "cueAudioTop" ? cst : null);

  if (audioNode) {

    const list = audioNode.children.genericParamList?.[0];
    const items = list?.children?.genericParam || [];

    // Generic dictionary
    const params = {};

    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      const token =
        p.children.value?.[0] ||
        p.children.NumberLiteral?.[0] ||
        p.children.StringLiteral?.[0] ||
        p.children.True?.[0] ||
        p.children.False?.[0] ||
        p.children.Identifier?.[0] ||
        null;

      if (!key || !token) continue;

      let raw = token.image.replace(/^"|"$/g, ""); // strip quotes

      // Convert common numerics / bools automatically:
      let val =
        raw === "true" ? true :
          raw === "false" ? false :
            isNaN(raw) ? raw :
              Number(raw);

      params[key] = val;  // ← store generically
    }

    // ✅ Normalization layer — small & declarative
    const {
      src,
      amp = 1,
      loop = 1,
      toggle = false,
      fade,
      fadeIn = fade,
      fadeOut = fade,
      uid = src // <— default uid to src if not provided
    } = params;

    // const cueExpr = `audio(${Object.entries(params)
    //   .map(([k,v]) => `${k}:${v}`)
    //   .join(",")})`;

    return {
      type: "cueAudio",
      src,
      amp,
      loop,
      fadeIn: fadeIn ?? 0,
      fadeOut: fadeOut ?? 0,
      toggle,
      uid,
      //  cueExpr
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

    // --- Extract params (if any) from genericParamList ---
    const params = {};
    const paramNodes = node.children.genericParam || [];

    const parseRawValue = (raw) => {
      if (raw === undefined || raw === null) return raw;

      // Strip matching quotes if present
      const s = String(raw).trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
      }

      // Booleans
      if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);

      // Numbers (int/float)
      if (!isNaN(s) && s !== '') return Number(s);

      return s; // fallback as string
    };

    for (const p of paramNodes) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (key) params[key] = parseRawValue(raw);
    }

    // Return all params so handlers can use uid, next, scope, etc.
    return {
      type: "cueStop",
      ...params,        // e.g., uid, next, scope, all, label, etc.
    };
  }

  // ------------------------------------------------------------

  // ------------------------------------------------------------
  // extractValue(vNode) — unified value normalizer for animValue
  // ------------------------------------------------------------
  function extractValue(vNode) {
    if (!vNode || !vNode.children) return null;

    // --- NEW: unwrap nested animValue wrapper (this is the missing piece)
    if (vNode.children.animValue) {
      return extractValue(vNode.children.animValue[0]);
    }

    // --- NEW: unwrap value(...) wrapper
    if (vNode.children.value && vNode.children.value[0]?.children?.animValue) {
      return extractValue(vNode.children.value[0].children.animValue[0]);
    }

    // NumberLiteral
    if (vNode.children.NumberLiteral) {
      return Number(vNode.children.NumberLiteral[0].image);
    }

    // Identifier (including inf, true, false)
    if (vNode.children.Identifier) {
      const name = vNode.children.Identifier[0].image;
      if (name === "inf") return "inf";
      if (name === "true") return true;
      if (name === "false") return false;
      return name;
    }

    // ✅ LIST LITERAL (values:[0,120,240])
    if (vNode.children.LBracket) {
      const exprs = vNode.children.patternExpr || [];
      return exprs.map(extractValue);
    }

    // ✅ ARRAY LITERAL via arrayValue (the real case in your CST)
    if (vNode.children.arrayValue) {
      const arr = vNode.children.arrayValue[0];
      const items = arr.children.animValue || [];
      return items.map(extractValue);
    }

    // Pattern call (Pseq, Prand, Pxrand, Pshuf)
    if (vNode.children.patternCall) {
      const call = vNode.children.patternCall[0];
      const name = call.children.PatternName[0].image;

      const values = extractValue({
        children: {
          LBracket: call.children.LBracket,
          patternExpr: call.children.patternExpr,
        }
      });

      const repeats =
        extractValue(call.children.patternExpr?.slice(-1)[0]) ?? 1;

      return {
        type: "pattern",
        name,
        values,
        repeats
      };
    }

    return null;
  }


  // ============================================================================
  // shared helper animation AST builders (with instrumentation)
  // ============================================================================
  function extractAnimKvArgs(node) {
    if (OSCILLA_DSL_DEBUG) console.log("[OSCILLA_DSL] extractAnimKvArgs() ENTER:", node);

    const out = [];
    const list = node.children.animGenericParamList?.[0];
    const params = list?.children.animGenericParam || [];

    for (const p of params) {
      const key = p.children.key?.[0]?.image;

      // ✅ Unified animValue extraction (works for pattern & literal lists & numbers)
      let vNode =
        p.children.value?.[0]?.children?.animValue?.[0] || // value(animValue)
        p.children.animValue?.[0] ||                       // direct animValue
        p.children.value?.[0] ||                           // bare literal
        null;

      // ✅ NEW: unwrap nested value nodes (literal list case)
      if (vNode && vNode.children?.value?.[0]?.children?.animValue?.[0]) {
        vNode = vNode.children.value[0].children.animValue[0];
      }

      if (OSCILLA_DSL_DEBUG) {
        console.log("[OSCILLA_DSL] param:", p);
        console.log("[OSCILLA_DSL] key:", key);
        console.log("[OSCILLA_DSL] vNode:", vNode);
      }

      let val = null;
      try {
        val = extractValue(vNode);
      } catch (err) {
        console.warn("[OSCILLA_DSL] extractValue ERROR:", err);
        val = null;
      }

      if (OSCILLA_DSL_DEBUG) {
        console.log(`[OSCILLA_DSL] extracted "${key}" →`, val);
      }

      if (key) out.push({ type: key, value: val });
    }

    if (OSCILLA_DSL_DEBUG) console.log("[OSCILLA_DSL] extractAnimKvArgs() RETURN:", out);
    return out;
  }

  // ============================================================================
  // Build AST for animation cues
  // ============================================================================
  const rotNode = cst.children?.cueRotateTop?.[0] || (cst.name === "cueRotateTop" ? cst : null);
  if (rotNode) {
    console.log("%c[cstToAst] MATCH cueRotateTop", "color:#ff0;background:#000;padding:3px;");
    return { type: "cueRotate", args: extractAnimKvArgs(rotNode) };
  }

  const scNode = cst.children?.cueScaleTop?.[0] || (cst.name === "cueScaleTop" ? cst : null);
  if (scNode) {
    console.log("%c[cstToAst] MATCH cueScaleTop", "color:#ff0;background:#000;padding:3px;");
    return { type: "cueScale", args: extractAnimKvArgs(scNode) };
  }

  const o2pNode = cst.children?.cueO2PTop?.[0] || (cst.name === "cueO2PTop" ? cst : null);
  if (o2pNode) {
    console.log("%c[cstToAst] MATCH cueO2PTop", "color:#ff0;background:#000;padding:3px;");
    return { type: "cueO2P", args: extractAnimKvArgs(o2pNode) };
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