// ============================================================================
// parser.js — OscillaScore CueDSL Parser (Chevrotain 11+) — FIXED VERSION v2
// ============================================================================
//
// FIXES in this version:
// 1. LCurly/RCurly → LBrace/RBrace (tokens that actually exist)
// 2. objectPair uses objectValue (rule that exists)
// 3. cueSynthTop doesn't double-consume parentheses
// 4. Proper nested object extraction in cstToAst for synth env:{a:4}
//
// ============================================================================
const OSCILLA_DSL_DEBUG = true;

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
    console.log(`${pad}- TOKEN ${node.tokenType.name}: "${node.image}"`);
    return;
  }
  if (node.name) console.log(`${pad}${node.name}`);
  if (node.children) {
    for (const [k, v] of Object.entries(node.children)) {
      console.log(`${pad}  [${k}]:`);
      if (Array.isArray(v)) v.forEach((c) => printCST(c, depth + 2));
      else printCST(v, depth + 2);
    }
  }
}

// ============================================================================
// 1️⃣ TOKEN DEFINITIONS
// ============================================================================

const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /[-+]?[0-9]+(?:\.[0-9]+)?/,
});

const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /"[^"]*"|'[^']*'/,
});

const Identifier = createToken({
  name: "Identifier",
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
const Stop = createToken({ name: "Stop", pattern: /\bstop\b/, longer_alt: Identifier });
const Nav = createToken({ name: "Nav", pattern: /nav\b/, longer_alt: Identifier });
const Audio = createToken({ name: "Audio", pattern: /audio\b/ });
const AudioPool = createToken({ name: "AudioPool", pattern: /audioPool\b/ });
const AudioImpulse = createToken({ name: "AudioImpulse", pattern: /audioImpulse\b/ });
const Synth = createToken({ name: "Synth", pattern: /synth\b/ });

const Button = createToken({ name: "Button", pattern: /button\b/ });
const Rotate = createToken({ name: "Rotate", pattern: /\brotate\b/, longer_alt: Identifier });
const Scale = createToken({ name: "Scale", pattern: /\bscale\b/, longer_alt: Identifier });
const ScaleXY = createToken({ name: "ScaleXY", pattern: /\bscaleXY\b/, longer_alt: Identifier });
const Osc = createToken({ name: "Osc", pattern: /\bosc\b/, longer_alt: Identifier });
const OscCtrl = createToken({ name: "OscCtrl", pattern: /\boscCtrl\b/, longer_alt: Identifier });
const OscCtrlNode = createToken({ name: "OscCtrlNode", pattern: /\boscCtrlNode\b/, longer_alt: Identifier });

const O2P = createToken({ name: "O2P", pattern: /\bo2p\b/, longer_alt: Identifier });

const After = createToken({ name: "After", pattern: /after\b/ });

const RangeLiteral = createToken({
  name: "RangeLiteral",
  pattern: /[0-9]+(?:\.[0-9]+)?-[0-9]+(?:\.[0-9]+)?/
});

const Choose = createToken({ name: "Choose", pattern: /choose/ });

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

const PatternName = createToken({
  name: "PatternName",
  pattern: /P(seq|rand|xrand|shuf|scale|every)\b/
});

export const allTokens = [
  Cue, Fade, Page, Stopwatch, Video, Text, Pause, Stop,
  Audio, AudioPool, AudioImpulse, Synth, Button, Nav,
  Rotate, Scale, ScaleXY, O2P,
  Osc, OscCtrl, OscCtrlNode,
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
      $.CONSUME(PatternName);
      $.CONSUME(LParen);

      $.OR([
        {
          GATE: () => $.LA(1).tokenType.name === "LBracket",
          ALT: () => {
            $.CONSUME(LBracket);
            $.MANY_SEP({
              SEP: Comma,
              DEF: () => $.SUBRULE1($.animValue)
            });
            $.CONSUME(RBracket);

            $.OPTION(() => {
              $.CONSUME(Comma);
              $.SUBRULE2($.animValue);
            });
          }
        },
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

    $.RULE("animValue", () => {
      return $.OR([
        { ALT: () => $.SUBRULE($.arrayValue) },
        {
          GATE: () => $.LA(1).tokenType === PatternName,
          ALT: () => $.SUBRULE($.patternCall)
        },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(True) },
        { ALT: () => $.CONSUME(False) },
        {
          GATE: () => $.LA(1).tokenType.name === "Identifier" &&
            $.LA(2).tokenType.name === "LParen",
          ALT: () => $.SUBRULE($.simpleFuncCall)
        },
        { ALT: () => $.CONSUME(Identifier) },
      ]);
    });

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

    $.RULE("animGenericParam", () => {
      const keyTok = $.OR([
        { ALT: () => $.CONSUME(Identifier, { LABEL: "key" }) },
        { ALT: () => $.CONSUME(Rotate, { LABEL: "key" }) },
        { ALT: () => $.CONSUME(Osc, { LABEL: "key" }) },
      ]);

      $.CONSUME(Colon);
      $.SUBRULE($.animValue, { LABEL: "value" });

      return { key: keyTok.image };
    });

    $.RULE("animGenericParamList", () => {
      $.CONSUME(LParen);

      $.OR([
        {
          GATE: () =>
            !($.LA(1).tokenType === Identifier && $.LA(2).tokenType === Colon),

          ALT: () => {
            $.SUBRULE($.animValue, { LABEL: "firstValue" });
            $.OPTION(() => $.CONSUME(Comma));
            $.MANY_SEP({
              SEP: Comma,
              DEF: () => $.SUBRULE($.animGenericParam, { LABEL: "restParams" })
            });
          }
        },
        {
          ALT: () => {
            $.AT_LEAST_ONE_SEP({
              SEP: Comma,
              DEF: () => $.SUBRULE2($.animGenericParam, { LABEL: "kvParams" })
            });
          }
        }
      ]);

      $.CONSUME(RParen);
    });

    // ─────────────────────────────────────────────────────────────
    // ✅ Object literal support for synth env:{a:4, d:0.1}
    // ─────────────────────────────────────────────────────────────

    // Value inside an object: number, string, bool, identifier, pattern, or function call
    $.RULE("objectValue", () => {
      $.OR([
        // Pattern call: Pseq(...), Prand(...), etc.
        {
          GATE: () => $.LA(1).tokenType === PatternName,
          ALT: () => $.SUBRULE($.patternCall)
        },
        // Function call: rand(1, 10), etc.
        {
          GATE: () => $.LA(1).tokenType === Identifier && $.LA(2).tokenType === LParen,
          ALT: () => $.SUBRULE($.simpleFuncCall)
        },
        // Array literal [...]
        {
          GATE: () => $.LA(1).tokenType === LBracket,
          ALT: () => $.SUBRULE($.arrayValue)
        },
        // Atomic values
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(True) },
        { ALT: () => $.CONSUME(False) },
        { ALT: () => $.CONSUME(Identifier) },
      ]);
    });

    // key:value pair inside { }
    $.RULE("objectPair", () => {
      $.CONSUME(Identifier, { LABEL: "key" });
      $.CONSUME(Colon);
      $.SUBRULE($.objectValue, { LABEL: "value" });
    });

    // { key:val, key:val, ... }
    $.RULE("objectLiteral", () => {
      $.CONSUME(LBrace);
      $.OPTION(() => {
        $.SUBRULE($.objectPair);
        $.MANY(() => {
          $.CONSUME(Comma);
          $.SUBRULE2($.objectPair);
        });
      });
      $.CONSUME(RBrace);
    });

    // -----------------------
    // Generic key:value param list — reusable across cues
    // -----------------------
    $.RULE("genericParam", () => {
      $.OR1([
        { ALT: () => $.CONSUME(Identifier, { LABEL: "key" }) },
        { ALT: () => $.CONSUME(Osc, { LABEL: "key" }) },
        { ALT: () => $.CONSUME(OscCtrl, { LABEL: "key" }) },
        { ALT: () => $.CONSUME(OscCtrlNode, { LABEL: "key" }) },
      ]);

      $.CONSUME(Colon);

      $.OR2([
        // ✅ object literal { ... }
        {
          GATE: () => $.LA(1).tokenType === LBrace,
          ALT: () => $.SUBRULE($.objectLiteral, { LABEL: "value" })
        },

        // ✅ Pattern call: Pseq(...), Prand(...), etc.
        {
          GATE: () => $.LA(1).tokenType === PatternName,
          ALT: () => $.SUBRULE($.patternCall, { LABEL: "value" })
        },

        // ✅ Array literal [...]
        {
          GATE: () => $.LA(1).tokenType === LBracket,
          ALT: () => $.SUBRULE($.arrayValue, { LABEL: "value" })
        },

        // function call: Identifier '('
        {
          GATE: () =>
            $.LA(1).tokenType === Identifier &&
            $.LA(2).tokenType === LParen,
          ALT: () => $.SUBRULE($.simpleFuncCall, { LABEL: "value" })
        },

        // atomic values
        { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "value" }) },
        { ALT: () => $.CONSUME(StringLiteral, { LABEL: "value" }) },
        { ALT: () => $.CONSUME(RangeLiteral, { LABEL: "value" }) },
        { ALT: () => $.CONSUME(True, { LABEL: "value" }) },
        { ALT: () => $.CONSUME(False, { LABEL: "value" }) },
        { ALT: () => $.CONSUME1(Identifier, { LABEL: "value" }) },
      ]);
    });

    $.RULE("genericParamList", () => {
      $.CONSUME(LParen);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.genericParam),
      });
      $.OPTION(() => $.CONSUME(Comma));
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

    $.RULE("pageWithDuration", () => {
      $.CONSUME(Identifier, { LABEL: "page" });
      $.CONSUME(Colon);
      $.CONSUME(NumberLiteral, { LABEL: "dur" });
    });

    $.RULE("simpleFuncCall", () => {
      const name = $.CONSUME(Identifier).image;
      $.CONSUME(LParen);

      const args = [];
      $.OPTION(() => {
        args.push($.SUBRULE($.animValue));
        $.MANY(() => {
          $.CONSUME(Comma);
          args.push($.SUBRULE2($.animValue));
        });
      });

      $.CONSUME(RParen);

      return { type: "funcCall", name, args };
    });

    // ------------------------------------------------------------
    // patternExpr — handles identifiers, numbers, page:dur, patterns, etc.
    // ------------------------------------------------------------
    $.RULE("patternExpr", () => {
      $.OR([
        {
          GATE: () => $.LA(1).tokenType.name === "PatternName",
          ALT: () => $.SUBRULE($.patternCall)
        },
        {
          GATE: () => $.LA(1).tokenType.name === "Identifier" &&
            $.LA(2).tokenType.name === "Colon",
          ALT: () => $.SUBRULE($.pageWithDuration)
        },
        { ALT: () => $.CONSUME(Identifier) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        {
          ALT: () => {
            $.CONSUME(LParen);
            $.SUBRULE2($.patternExpr);
            $.CONSUME(RParen);
          }
        },
      ]);
    });

    // ------------------------------------------------------------
    // patternCall — generic pattern function call
    // Supports both: Pseq([220, 330], inf) and Pseq(220, 330, 440)
    // ------------------------------------------------------------
    $.RULE("patternCall", () => {
      $.CONSUME(PatternName);
      $.CONSUME(LParen);

      $.OR([
        // Case 1: Pseq([...], repeats) - with brackets
        {
          GATE: () => $.LA(1).tokenType === LBracket,
          ALT: () => {
            $.CONSUME(LBracket);
            $.AT_LEAST_ONE_SEP({
              SEP: Comma,
              DEF: () => $.SUBRULE1($.patternExpr)
            });
            $.CONSUME(RBracket);

            // Optional repeats argument
            $.OPTION(() => {
              $.CONSUME(Comma);
              $.SUBRULE($.patternExpr, { LABEL: "repeats" });
            });
          }
        },

        // Case 2: Pseq(220, 330, 440) - without brackets (values only, no explicit repeats)
        {
          ALT: () => {
            $.AT_LEAST_ONE_SEP1({
              SEP: Comma,
              DEF: () => $.SUBRULE2($.patternExpr, { LABEL: "flatValues" })
            });
          }
        }
      ]);

      $.CONSUME(RParen);
    });

    $.RULE("controlExpr", () => {
      $.OR([
        { ALT: () => $.CONSUME(Nav, { LABEL: "controlName" }) },
        { ALT: () => $.CONSUME(Identifier, { LABEL: "controlName" }) },
      ]);
      $.CONSUME(LParen);
      $.CONSUME1(Identifier, { LABEL: "controlArg" });

      $.OPTION(() => {
        $.CONSUME(At, { LABEL: "At" });
        $.CONSUME2(Identifier, { LABEL: "targetUid" });
      });

      $.CONSUME(RParen);
    });

    $.RULE("afterClause", () => {
      $.CONSUME(After);
      $.CONSUME(Colon);
      $.OR([
        { ALT: () => $.SUBRULE($.controlExpr, { LABEL: "afterAction" }) },
        { ALT: () => $.CONSUME(Identifier, { LABEL: "afterSimple" }) }
      ]);
    });

    // -----------------------
    // Fade params
    // -----------------------
    $.RULE("fadeParam", () => {
      $.OR([
        { ALT: () => $.CONSUME(Identifier, { LABEL: "keyIdent" }) },
      ]);
      $.CONSUME(Colon);
      $.OR1([
        { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "num" }) },
        { ALT: () => $.CONSUME1(Identifier, { LABEL: "ident" }) },
        { ALT: () => $.CONSUME(Stop, { LABEL: "kwStop" }) },
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
      $.CONSUME(Page);
      $.CONSUME(LParen);
      $.SUBRULE($.pageBody, { LABEL: "body" });
      $.CONSUME(RParen);
    });

    // ------------------------------------------------------------
    // pageBody — handles pattern + optional after clause
    // ------------------------------------------------------------
    $.RULE("pageBody", () => {
      $.SUBRULE($.patternExpr, { LABEL: "pattern" });

      $.MANY(() => {
        $.CONSUME(Comma);
        $.OR([
          { ALT: () => $.SUBRULE($.afterClause, { LABEL: "afterClause" }) },
          { ALT: () => $.SUBRULE($.genericParam, { LABEL: "param" }) },
        ]);
      });
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
        DEF: () => {
          this.SUBRULE(this.videoParam);
        }
      });
    });

    this.RULE("videoParam", () => {
      this.CONSUME(Identifier);
      this.CONSUME(Colon);

      this.OR([
        { ALT: () => this.SUBRULE(this.sizePair) },
        { ALT: () => this.CONSUME(NumberLiteral) },
        { ALT: () => this.CONSUME(StringLiteral) },
        { ALT: () => this.CONSUME1(Identifier) }
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
    // cue:osc(...)
    // ------------------------------------------------------------
    $.RULE("trailingParamList", () => {
      $.SUBRULE($.genericParam);
      $.MANY(() => {
        $.CONSUME(Comma);
        $.SUBRULE2($.genericParam);
      });
    });

    $.RULE("cueOscTop", () => {
      $.CONSUME(Osc);
      $.SUBRULE($.genericParamList, { LABEL: "genericParamList" });

      $.OPTION(() => {
        $.CONSUME(Comma);
        $.SUBRULE($.trailingParamList, { LABEL: "trailingParamList" });
      });
    });

    $.RULE("cueOscCtrlTop", () => {
      $.CONSUME(OscCtrl);
      $.SUBRULE($.genericParamList);
    });

    $.RULE("cueOscCtrlNodeTop", () => {
      $.CONSUME(OscCtrlNode);
      $.SUBRULE($.genericParamList);
    });

    // ------------------------------------------------------------
    // cueSpeedTop (grammar) — supports speed(3) and keyed params
    // ------------------------------------------------------------
    $.RULE("cueSpeedTop", () => {
      $.CONSUME(Identifier, { LABEL: "speedFn" });
      $.CONSUME(LParen);

      $.OPTION(() => {
        $.OR([
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
      $.CONSUME(Identifier, { LABEL: "navAction" });

      $.OPTION(() => {
        $.CONSUME(At);
        $.CONSUME1(Identifier, { LABEL: "navTarget" });
      });

      $.OPTION1(() => {
        $.CONSUME(Comma);
        $.SUBRULE($.genericParamListNoParens, { LABEL: "params" });
      });

      $.CONSUME(RParen);
    });

    this.RULE("cueStopTop", () => {
      this.CONSUME(Stop);

      this.OPTION(() => {
        this.CONSUME(LParen);
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
        { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "shorthandDur" }) },
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
      $.CONSUME(Identifier, { LABEL: "metronomeName" });
      $.SUBRULE($.genericParamList);
    });

    // ------------------------------------------------------------
    // buttonStyleBlock
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
    // cue:audio(...)
    // ------------------------------------------------------------
    $.RULE("cueAudioTop", () => {
      $.CONSUME(Audio);
      $.SUBRULE($.genericParamList);
    });

    $.RULE("cueAudioPoolTop", () => {
      $.CONSUME(AudioPool);
      $.SUBRULE($.genericParamList);
    });

    $.RULE("cueAudioImpulseTop", () => {
      $.CONSUME(AudioImpulse);
      $.SUBRULE($.genericParamList);
    });

    // ─────────────────────────────────────────────────────────────
    // ✅ FIXED: cue:synth(...) — uses genericParamList directly
    // ─────────────────────────────────────────────────────────────
    $.RULE("cueSynthTop", () => {
      $.CONSUME(Synth);
      $.SUBRULE($.genericParamList);  // handles ( ... ) internally
    });

    // ------------------------------------------------------------
    // cue:button(...)
    // ------------------------------------------------------------
    $.RULE("cueButtonTop", () => {
      $.CONSUME(Button);
      $.CONSUME(LParen);

      $.OPTION(() => {
        $.CONSUME(Identifier, { LABEL: "labelKey" });
        $.CONSUME(Colon);
        $.CONSUME(StringLiteral, { LABEL: "labelValue" });
        $.CONSUME(Comma);
      });

      $.CONSUME2(Identifier, { LABEL: "triggerKey" });
      $.CONSUME2(Colon);
      $.SUBRULE($.cueTop, { LABEL: "triggerValue" });

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
    $.RULE("cueRotateTop", () => {
      $.CONSUME(Rotate);
      $.SUBRULE($.animGenericParamList);
    });

    $.RULE("cueScaleTop", () => {
      $.OR([
        { ALT: () => $.CONSUME(Scale) },
        { ALT: () => $.CONSUME2(ScaleXY) }
      ]);
      $.SUBRULE($.animGenericParamList);
    });

    $.RULE("cueO2PTop", () => {
      $.CONSUME(O2P);
      $.SUBRULE($.animGenericParamList);
    });

    // -----------------------
    // cueTop — main entry point
    // -----------------------
    $.RULE("cueTop", () => {
      $.OPTION(() => {
        $.CONSUME(Cue);
        $.CONSUME(Colon);
      });

      $.OR([
        { ALT: () => $.SUBRULE($.cueTextTop) },
        { ALT: () => $.SUBRULE($.cueFadeTop) },
        { ALT: () => $.SUBRULE($.cueNavTop) },
        { ALT: () => $.SUBRULE($.cuePageTop) },
        { ALT: () => $.SUBRULE($.cueStopwatchTop) },
        { ALT: () => $.SUBRULE($.cueVideoTop) },

        {
          GATE: () =>
            $.LA(1).tokenType === Identifier &&
            ($.LA(1).image === "metro" || $.LA(1).image === "metronome"),
          ALT: () => $.SUBRULE($.cueMetronomeTop)
        },

        { ALT: () => $.SUBRULE($.cuePauseTop) },

        {
          GATE: () =>
            $.LA(1).tokenType === Identifier &&
            $.LA(1).image === "speed",
          ALT: () => $.SUBRULE($.cueSpeedTop)
        },

        { ALT: () => $.SUBRULE($.cueStopTop) },
        { ALT: () => $.SUBRULE($.cueButtonTop) },
        { ALT: () => $.SUBRULE($.cueAudioTop) },
        { ALT: () => $.SUBRULE($.cueAudioPoolTop) },
        { ALT: () => $.SUBRULE($.cueAudioImpulseTop) },
        { ALT: () => $.SUBRULE($.cueSynthTop) },
        { ALT: () => $.SUBRULE($.cueRotateTop) },
        { ALT: () => $.SUBRULE($.cueScaleTop) },
        { ALT: () => $.SUBRULE($.cueO2PTop) },
        { ALT: () => $.SUBRULE($.cueOscTop) },
        { ALT: () => $.SUBRULE($.cueOscCtrlTop) },
        { ALT: () => $.SUBRULE($.cueOscCtrlNodeTop) },
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function convertPatternNodeToAST(node) {
  if (!node) {
    console.warn("[convertPatternNodeToAST] ⚠️ Node is null");
    return { type: "Literal", value: null };
  }

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

  if (node.name === "NumberLiteral" || node.name === "StringLiteral") {
    return { type: "Literal", value: node.image };
  }

  if (node.name === "patternCall") {
    const name = node.children?.PatternName?.[0]?.image ?? "Pseq";

    const exprs = (node.children.patternExpr || []).map(convertPatternNodeToAST);

    let repeats = 1;
    if (node.children.repeats?.[0]) {
      const repNode = node.children.repeats[0];
      const num = repNode.children?.NumberLiteral?.[0]?.image;
      if (num) repeats = Number(num);
    }

    const list = exprs.map(e => {
      if (e.type === "Literal" && e.value?.page) return e;
      return e;
    });

    return { type: name, list, repeats };
  }

  if (node.children?.patternExpr)
    return convertPatternNodeToAST(node.children.patternExpr[0]);

  return { type: "Literal", value: node.image || null };
}

function extractNumber(children, fallback = 0) {
  if (!children) return fallback;
  const num =
    children.NumberLiteral?.[0]?.image ||
    children.dur?.[0]?.image ||
    children.xVal?.[0]?.image;
  return num ? Number(num) : fallback;
}

export function extractAfterClause(children) {
  const clause = children?.afterClause?.[0];
  const action = clause?.children?.afterAction?.[0];
  const ctrl = action?.children?.controlExpr?.[0] || action;

  if (!ctrl?.children) return null;

  const control = ctrl.children.controlName?.[0]?.image || null;
  const arg = ctrl.children.controlArg?.[0]?.image || null;
  const target = ctrl.children.targetUid?.[0]?.image || null;

  if (!control) return null;
  return { control, arg, target };
}

// ─────────────────────────────────────────────────────────────
// ✅ HELPER: Extract object literal from CST node
// ─────────────────────────────────────────────────────────────
function extractObjectLiteral(objNode) {
  if (!objNode || objNode.name !== "objectLiteral") return null;

  const result = {};
  const pairs = objNode.children?.objectPair || [];

  for (const pair of pairs) {
    const keyToken = pair.children?.key?.[0];
    const valueNode = pair.children?.value?.[0];

    if (!keyToken || !valueNode) continue;

    const key = keyToken.image;

    // Extract value from objectValue rule
    let val = null;
    const vChildren = valueNode.children || {};

    if (vChildren.NumberLiteral?.[0]) {
      val = Number(vChildren.NumberLiteral[0].image);
    } else if (vChildren.StringLiteral?.[0]) {
      val = vChildren.StringLiteral[0].image.replace(/^["']|["']$/g, "");
    } else if (vChildren.True?.[0]) {
      val = true;
    } else if (vChildren.False?.[0]) {
      val = false;
    } else if (vChildren.Identifier?.[0]) {
      val = vChildren.Identifier[0].image;
    } else if (valueNode.image) {
      // Direct token
      const raw = valueNode.image.replace(/^["']|["']$/g, "");
      val = raw === "true" ? true :
            raw === "false" ? false :
            (!isNaN(raw) && raw !== "") ? Number(raw) : raw;
    }

    result[key] = val;
  }

  if (OSCILLA_DSL_DEBUG) {
    console.log("[extractObjectLiteral] Extracted:", result);
  }

  return result;
}

// ============================================================================
// 3: CST → AST
// ============================================================================

export function cstToAst(cst) {
  // ============================================================================
  // 🔹 cue:fade(mode:in,dur:2,from:0,to:1)
  // ============================================================================
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
  const navNode =
    cst.children?.cueNavTop?.[0] ||
    (cst.name === "cueNavTop" ? cst : null);

  if (navNode) {
    const ch = navNode.children;
    const action = ch.navAction?.[0]?.image ?? null;
    const target = ch.navTarget?.[0]?.image ?? null;

    let params = {};

    if (ch.params && ch.params[0] && ch.params[0].children.genericParam) {
      const paramNodes = ch.params[0].children.genericParam;
      for (const p of paramNodes) {
        const key = p.children.key?.[0]?.image;
        const raw = p.children.value?.[0]?.image;
        if (key && raw !== undefined) {
          params[key] = raw.replace(/^["']|["']$/g, "");
        }
      }
    }

    let uid = params.uid;
    if (!uid) {
      uid = target ? `${action}@${target}` : action;
    }

    return {
      type: "cueNav",
      action,
      target,
      uid: params.uid || uid,
      params
    };
  }

  // ------------------------------------------------------------
  // cue:page(...) — unified pattern + after clause support
  // ------------------------------------------------------------
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
        p.children.Identifier?.[1];
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

      if (valNode?.name === "simpleFuncCall" || valNode?.children?.Identifier) {
        const funcName =
          valNode.children?.Identifier?.[0]?.image ?? "unknown";

        const argNodes =
          valNode.children?.animValue ??
          valNode.children?.NumberLiteral ??
          [];

        const funcArgs = argNodes.map(a => {
          if (a.children?.NumberLiteral?.[0]) {
            return Number(a.children.NumberLiteral[0].image);
          }
          if (a.children?.StringLiteral?.[0]) {
            return a.children.StringLiteral[0].image.replace(/^["']|["']$/g, "");
          }
          if (a.image) return a.image;
          return null;
        });

        val = { type: "func", name: funcName, args: funcArgs };
      } else if (valNode?.children?.StringLiteral?.[0]) {
        val = valNode.children.StringLiteral[0].image.replace(/^["']|["']$/g, "");
      } else if (valNode?.children?.NumberLiteral?.[0]) {
        val = Number(valNode.children.NumberLiteral[0].image);
      } else if (valNode?.image) {
        val = valNode.image;
      }

      args.push({ type: key, value: val });
    }

    return { type: "cueText", args };
  }

  // ------------------------------------------------------------
  // cue:osc(...) AST builder
  // ------------------------------------------------------------
  function extractValueExpr(v) {
    if (!v) return null;

    if (v.name === "animValue") {
      const child =
        v.children?.NumberLiteral?.[0] ||
        v.children?.simpleFuncCall?.[0] ||
        null;
      return extractValueExpr(child);
    }

    if (v.image != null && !isNaN(v.image)) {
      return Number(v.image);
    }

    if (v.name === "simpleFuncCall") {
      const fname = v.children.Identifier[0].image.toLowerCase();
      const args = v.children.animValue ?? [];

      if ((fname === "rand" || fname === "irand") && args.length === 2) {
        const min = extractValueExpr(args[0]);
        const max = extractValueExpr(args[1]);
        if (Number.isFinite(min) && Number.isFinite(max)) {
          return { type: fname, min, max };
        }
      }

      return {
        type: "func",
        name: fname,
        args: args.map(extractValueExpr)
      };
    }

    return null;
  }

  const oscNode =
    cst.children?.cueOscTop?.[0] ||
    (cst.name === "cueOscTop" ? cst : null);

  if (oscNode) {
    const args = [];
    const items = [];

    const mainList = oscNode.children.genericParamList?.[0];
    if (mainList?.children?.genericParam) {
      items.push(...mainList.children.genericParam);
    }

    const trailingList = oscNode.children.trailingParamList?.[0];
    if (trailingList?.children?.genericParam) {
      items.push(...trailingList.children.genericParam);
    }

    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      if (!key) continue;

      let val = null;
      const v = p.children.value?.[0];

      if (v?.name === "simpleFuncCall") {
        const fname = v.children.Identifier[0].image.toLowerCase();
        const argsCst = v.children.animValue ?? [];

        if (fname === "deg" && argsCst.length === 2) {
          const degree = extractValueExpr(argsCst[0]);
          const octave = extractValueExpr(argsCst[1]);
          if (degree != null && octave != null) {
            val = { type: "deg", degree, octave };
          }
        } else if ((fname === "rand" || fname === "irand") && argsCst.length === 2) {
          const min = extractValueExpr(argsCst[0]);
          const max = extractValueExpr(argsCst[1]);
          if (Number.isFinite(min) && Number.isFinite(max)) {
            val = { type: fname, min, max };
          }
        } else if ((fname === "hz" || fname === "midi") && argsCst.length === 1) {
          const value = extractValueExpr(argsCst[0]);
          if (Number.isFinite(value)) {
            val = { type: fname, value };
          }
        }
      }

      if (val === null && v?.image != null) {
        const s = String(v.image).replace(/^"|"$/g, "");
        val =
          s === "true" ? true :
            s === "false" ? false :
              (!isNaN(s) && s !== "") ? Number(s) :
                s;
      }

      args.push({ type: key, value: val });
    }

    return { type: "cueOsc", args };
  }

  // ------------------------------------------------------------
  // cue:oscCtrl(...)
  // ------------------------------------------------------------
  const oscCtrlNode =
    cst.children?.cueOscCtrlTop?.[0] ||
    (cst.name === "cueOscCtrlTop" ? cst : null);

  if (oscCtrlNode) {
    const args = [];
    const list = oscCtrlNode.children.genericParamList?.[0];
    const items = list?.children.genericParam || [];

    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (!key) continue;

      let val =
        raw === "true" ? true :
          raw === "false" ? false :
            (!isNaN(raw)) ? Number(raw) :
              raw?.replace(/^"|"$/g, "");

      args.push({ type: key, value: val });
    }

    return { type: "oscCtrl", args };
  }

  const oscCtrlNodeNode =
    cst.children?.cueOscCtrlNodeTop?.[0] ||
    (cst.name === "cueOscCtrlNodeTop" ? cst : null);

  if (oscCtrlNodeNode) {
    const args = [];
    const list = oscCtrlNodeNode.children.genericParamList?.[0];
    const items = list?.children.genericParam || [];

    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (!key) continue;

      let val =
        raw === "true" ? true :
          raw === "false" ? false :
            (!isNaN(raw)) ? Number(raw) :
              raw?.replace(/^"|"$/g, "");

      args.push({ type: key, value: val });
    }

    return { type: "oscCtrlNode", args };
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
    const fnName = speedNode.children?.speedFn?.[0]?.image;
    if (fnName !== "speed") return null;

    const shorthandTok = speedNode.children?.shorthand?.[0] || null;

    let value = shorthandTok ? Number(shorthandTok.image) : null;
    let add = null;
    let dur = null;
    let ease = null;
    let uid = null;

    const parseVal = (raw) => {
      if (raw == null) return null;
      const s = String(raw).trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
        return s.slice(1, -1);
      if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
      if (!isNaN(s) && s !== "") return Number(s);
      return s;
    };

    const paramNodes =
      speedNode.children.genericParamList ||
      speedNode.children.genericParam || [];

    for (const p of paramNodes) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (!key) continue;

      const v = parseVal(raw);

      if (key === "value" || key === "speed" || key === "multiplier") {
        value = Number(v);
      } else if (key === "add") {
        add = Number(v);
      } else if (key === "dur") {
        dur = Number(v);
      } else if (key === "ease" || key === "easing") {
        ease = String(v);
      } else if (key === "uid") {
        uid = v;
      }
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
    const params = buttonNode.children.styleParam || [];

    params.forEach((p, idx) => {
      const keyNode = p.children.key?.[0];
      const valNode = p.children.value?.[0];

      if (!keyNode || !valNode) return;

      const key = keyNode.image;
      let val = valNode.image.replace(/^"|"$/g, "");
      opt[key] = val;
    });

    return {
      type: "cueButton",
      label,
      triggerAst: {
        ...triggerAst,
        uid: triggerAst?.uid ?? null
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

    const params = {};

    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      if (!key) continue;

      const valNode = p.children.value?.[0];

      if (valNode?.name === "simpleFuncCall") {
        const fname = valNode.children.Identifier?.[0]?.image?.toLowerCase();
        const argsCst = valNode.children.animValue ?? [];

        if ((fname === "rand" || fname === "irand") && argsCst.length === 2) {
          const getNum = (node) => {
            if (node?.children?.NumberLiteral?.[0]) {
              return Number(node.children.NumberLiteral[0].image);
            }
            return NaN;
          };
          const min = getNum(argsCst[0]);
          const max = getNum(argsCst[1]);

          if (Number.isFinite(min) && Number.isFinite(max)) {
            params[key] = { type: "funcCall", name: fname, args: [min, max] };
            continue;
          }
        }
        params[key] = { type: "funcCall", name: fname, args: [] };
        continue;
      }

      const token =
        valNode ||
        p.children.NumberLiteral?.[0] ||
        p.children.StringLiteral?.[0] ||
        p.children.True?.[0] ||
        p.children.False?.[0] ||
        p.children.Identifier?.[0] ||
        null;

      if (!token) continue;

      let raw;
      if (token.children?.NumberLiteral?.[0]) {
        raw = token.children.NumberLiteral[0].image;
      } else if (token.children?.StringLiteral?.[0]) {
        raw = token.children.StringLiteral[0].image?.replace?.(/^"|"$/g, "");
      } else if (token.children?.Identifier?.[0]) {
        raw = token.children.Identifier[0].image;
      } else {
        raw = token.image?.replace?.(/^"|"$/g, "") ?? token.image;
      }

      if (raw === undefined || raw === null) continue;

      let val =
        raw === "true" ? true :
          raw === "false" ? false :
            isNaN(raw) ? raw :
              Number(raw);

      params[key] = val;
    }

    const {
      src,
      amp = 1,
      loop = 1,
      toggle = false,
      fade,
      fadeIn = fade,
      fadeOut = fade,
      uid = src
    } = params;

    return {
      type: "cueAudio",
      src,
      amp,
      loop,
      fadeIn: fadeIn ?? 0,
      fadeOut: fadeOut ?? 0,
      toggle,
      uid,
      params
    };
  }

  // ------------------------------------------------------------
  // audioPool(...)  AST Builder
  // ------------------------------------------------------------
  const audioPoolNode =
    cst.children?.cueAudioPoolTop?.[0] ||
    (cst.name === "cueAudioPoolTop" ? cst : null);

  if (audioPoolNode) {
    const list = audioPoolNode.children.genericParamList?.[0];
    const items = list?.children?.genericParam || [];

    const params = {};

    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      if (!key) continue;

      const valNode = p.children.value?.[0];

      if (valNode?.name === "simpleFuncCall") {
        const fname = valNode.children.Identifier?.[0]?.image?.toLowerCase();
        const argsCst = valNode.children.animValue ?? [];

        if ((fname === "rand" || fname === "irand") && argsCst.length === 2) {
          const getNum = (node) => {
            if (node?.children?.NumberLiteral?.[0]) {
              return Number(node.children.NumberLiteral[0].image);
            }
            return NaN;
          };
          const min = getNum(argsCst[0]);
          const max = getNum(argsCst[1]);

          if (Number.isFinite(min) && Number.isFinite(max)) {
            params[key] = { type: "funcCall", name: fname, args: [min, max] };
            continue;
          }
        }
        params[key] = { type: "funcCall", name: fname, args: [] };
        continue;
      }

      const token =
        valNode ||
        p.children.NumberLiteral?.[0] ||
        p.children.StringLiteral?.[0] ||
        p.children.True?.[0] ||
        p.children.False?.[0] ||
        p.children.Identifier?.[0] ||
        null;

      if (!token) continue;

      let raw;
      if (token.children?.NumberLiteral?.[0]) {
        raw = token.children.NumberLiteral[0].image;
      } else if (token.children?.StringLiteral?.[0]) {
        raw = token.children.StringLiteral[0].image?.replace?.(/^"|"$/g, "");
      } else if (token.children?.Identifier?.[0]) {
        raw = token.children.Identifier[0].image;
      } else {
        raw = token.image?.replace?.(/^"|"$/g, "") ?? token.image;
      }

      if (raw === undefined || raw === null) continue;

      let val =
        raw === "true" ? true :
          raw === "false" ? false :
            isNaN(raw) ? raw :
              Number(raw);

      params[key] = val;
    }

    const {
      path,
      glob,
      format = "wav",
      mode = "shuffle",
      uid,
      group
    } = params;

    return {
      type: "cueAudioPool",
      path,
      glob,
      format,
      mode,
      uid,
      group,
      params
    };
  }

  // ------------------------------------------------------------
  // audioImpulse(...)  AST Builder
  // ------------------------------------------------------------
  const audioImpulseNode =
    cst.children?.cueAudioImpulseTop?.[0] ||
    (cst.name === "cueAudioImpulseTop" ? cst : null);

  if (audioImpulseNode) {
    const list = audioImpulseNode.children.genericParamList?.[0];
    const items = list?.children?.genericParam || [];

    const params = {};

    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      if (!key) continue;

      const valNode = p.children.value?.[0];

      if (valNode?.name === "simpleFuncCall") {
        const fname = valNode.children.Identifier?.[0]?.image?.toLowerCase();
        const argsCst = valNode.children.animValue ?? [];

        const args = argsCst.map(arg => {
          if (arg.children?.NumberLiteral?.[0]) {
            return Number(arg.children.NumberLiteral[0].image);
          }
          if (arg.children?.StringLiteral?.[0]) {
            const str = arg.children.StringLiteral[0].image;
            return str.replace(/^["']|["']$/g, "");
          }
          if (arg.image !== undefined) {
            const img = arg.image;
            if ((img.startsWith('"') && img.endsWith('"')) ||
              (img.startsWith("'") && img.endsWith("'"))) {
              return img.slice(1, -1);
            }
            const num = Number(img);
            return isNaN(num) ? img : num;
          }
          return null;
        });

        params[key] = {
          type: "funcCall",
          name: fname,
          args: args
        };

        console.log(`[audioImpulse parser] ${key} = ${fname}(${args.join(", ")})`);
        continue;
      }

      const token =
        valNode ||
        p.children.NumberLiteral?.[0] ||
        p.children.StringLiteral?.[0] ||
        p.children.True?.[0] ||
        p.children.False?.[0] ||
        p.children.Identifier?.[0] ||
        null;

      if (!token) continue;

      let raw;
      if (token.children?.NumberLiteral?.[0]) {
        raw = token.children.NumberLiteral[0].image;
      } else if (token.children?.StringLiteral?.[0]) {
        raw = token.children.StringLiteral[0].image?.replace?.(/^["']|["']$/g, "");
      } else if (token.children?.Identifier?.[0]) {
        raw = token.children.Identifier[0].image;
      } else {
        raw = token.image?.replace?.(/^["']|["']$/g, "") ?? token.image;
      }

      if (raw === undefined || raw === null) continue;

      let val =
        raw === "true" ? true :
          raw === "false" ? false :
            isNaN(raw) ? raw :
              Number(raw);

      params[key] = val;
    }

    const {
      path,
      glob,
      format = "wav",
      mode = "shuffle",
      rate = 30,
      jitter = 0,
      lifetime = "region",
      uid,
      group
    } = params;

    return {
      type: "cueAudioImpulse",
      path,
      glob,
      format,
      mode,
      rate,
      jitter,
      lifetime,
      uid,
      group,
      params
    };
  }

  // ─────────────────────────────────────────────────────────────
  // ✅ Helper: Extract value from objectValue CST node
  // Handles: patterns, arrays, function calls, and atomic values
  // ─────────────────────────────────────────────────────────────
  function extractObjectValue(node) {
    if (!node) return null;

    // Pattern call: Pseq(...), Prand(...)
    if (node.name === "patternCall") {
      const patternName = node.children?.PatternName?.[0]?.image ?? "Pseq";
      
      const extractPatternValue = (expr) => {
        if (!expr) return null;
        if (expr.children?.NumberLiteral?.[0]) {
          return Number(expr.children.NumberLiteral[0].image);
        }
        if (expr.children?.Identifier?.[0]) {
          const id = expr.children.Identifier[0].image;
          return id === "inf" ? Infinity : id;
        }
        return null;
      };

      let values = [];
      let repeats = Infinity;

      const bracketedExprs = node.children?.patternExpr || [];
      const flatExprs = node.children?.flatValues || [];

      if (bracketedExprs.length > 0) {
        values = bracketedExprs.map(extractPatternValue);
        if (node.children?.repeats?.[0]) {
          repeats = extractPatternValue(node.children.repeats[0]) ?? Infinity;
        }
      } else if (flatExprs.length > 0) {
        values = flatExprs.map(extractPatternValue);
      }

      return { type: "pattern", name: patternName, values, repeats };
    }

    // Function call: rand(1, 10)
    if (node.name === "simpleFuncCall") {
      const fname = node.children?.Identifier?.[0]?.image;
      const argsCst = node.children?.animValue || [];
      const funcArgs = argsCst.map(arg => {
        if (arg.children?.NumberLiteral?.[0]) return Number(arg.children.NumberLiteral[0].image);
        if (arg.children?.StringLiteral?.[0]) return arg.children.StringLiteral[0].image.replace(/^["']|["']$/g, "");
        if (arg.children?.Identifier?.[0]) {
          const id = arg.children.Identifier[0].image;
          return id === "inf" ? Infinity : id;
        }
        return null;
      });
      return { type: "func", name: fname, args: funcArgs };
    }

    // Array literal [...]
    if (node.name === "arrayValue") {
      const items = node.children?.animValue || [];
      return items.map(item => {
        if (item.children?.NumberLiteral?.[0]) return Number(item.children.NumberLiteral[0].image);
        if (item.children?.StringLiteral?.[0]) return item.children.StringLiteral[0].image.replace(/^["']|["']$/g, "");
        if (item.children?.Identifier?.[0]) {
          const id = item.children.Identifier[0].image;
          return id === "inf" ? Infinity : id;
        }
        return null;
      });
    }

    // objectValue wrapper (contains nested rule)
    if (node.name === "objectValue") {
      // Check for nested complex types
      if (node.children?.patternCall?.[0]) return extractObjectValue(node.children.patternCall[0]);
      if (node.children?.simpleFuncCall?.[0]) return extractObjectValue(node.children.simpleFuncCall[0]);
      if (node.children?.arrayValue?.[0]) return extractObjectValue(node.children.arrayValue[0]);
      
      // Atomic values
      if (node.children?.NumberLiteral?.[0]) return Number(node.children.NumberLiteral[0].image);
      if (node.children?.StringLiteral?.[0]) return node.children.StringLiteral[0].image.replace(/^["']|["']$/g, "");
      if (node.children?.True?.[0]) return true;
      if (node.children?.False?.[0]) return false;
      if (node.children?.Identifier?.[0]) return node.children.Identifier[0].image;
    }

    // Direct token
    if (node.image != null) {
      const raw = node.image.replace(/^["']|["']$/g, "");
      return raw === "true" ? true :
             raw === "false" ? false :
             (!isNaN(raw) && raw !== "") ? Number(raw) : raw;
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // ✅ FIXED: cue:synth(...) → AST with PROPER object literal support
  // ─────────────────────────────────────────────────────────────
  const synthNode =
    cst.children?.cueSynthTop?.[0] ||
    (cst.name === "cueSynthTop" ? cst : null);

  if (synthNode) {
    if (OSCILLA_DSL_DEBUG) {
      console.log("[cueSynth] CST node:", synthNode);
    }

    const args = [];
    const list = synthNode.children.genericParamList?.[0];
    const items = list?.children?.genericParam || [];

    if (OSCILLA_DSL_DEBUG) {
      console.log("[cueSynth] Found", items.length, "genericParam items");
    }

    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      if (!key) continue;

      const v = p.children.value?.[0];
      let val = null;

      if (OSCILLA_DSL_DEBUG) {
        console.log(`[cueSynth] Processing key="${key}", value node:`, v?.name || v?.image || v);
      }

      // ✅ CASE 1: objectLiteral { a:4, d:0.1, s:0.5, r:2 }
      if (v?.name === "objectLiteral") {
        val = {};
        const pairs = v.children?.objectPair || [];

        if (OSCILLA_DSL_DEBUG) {
          console.log(`[cueSynth] objectLiteral found with ${pairs.length} pairs`);
        }

        for (const pair of pairs) {
          const pairKey = pair.children?.key?.[0]?.image;
          const pairValNode = pair.children?.value?.[0];

          if (!pairKey) continue;

          // Extract from objectValue rule - now supports patterns, arrays, funcs
          let pairVal = extractObjectValue(pairValNode);

          if (OSCILLA_DSL_DEBUG) {
            console.log(`[cueSynth]   objectPair: ${pairKey} =`, pairVal);
          }

          val[pairKey] = pairVal;
        }
      }
      // ✅ CASE 2: patternCall like Pseq([220, 330, 440], inf) or Pseq(220, 330, 440)
      else if (v?.name === "patternCall") {
        const patternName = v.children?.PatternName?.[0]?.image ?? "Pseq";
        
        // Helper to extract value from patternExpr
        const extractPatternValue = (expr) => {
          if (!expr) return null;
          if (expr.children?.NumberLiteral?.[0]) {
            return Number(expr.children.NumberLiteral[0].image);
          }
          if (expr.children?.Identifier?.[0]) {
            const id = expr.children.Identifier[0].image;
            return id === "inf" ? Infinity : id;
          }
          if (expr.children?.pageWithDuration?.[0]) {
            const pwd = expr.children.pageWithDuration[0];
            return {
              page: pwd.children?.Identifier?.[0]?.image,
              dur: Number(pwd.children?.NumberLiteral?.[0]?.image || 0)
            };
          }
          return null;
        };

        let values = [];
        let repeats = Infinity; // default to infinite for synth patterns

        // Check for bracket syntax: patternExpr (from AT_LEAST_ONE_SEP)
        const bracketedExprs = v.children?.patternExpr || [];
        
        // Check for flat syntax: flatValues
        const flatExprs = v.children?.flatValues || [];

        if (bracketedExprs.length > 0) {
          // Bracket syntax: Pseq([a, b, c], repeats)
          values = bracketedExprs.map(extractPatternValue);
          
          // Check for repeats
          if (v.children?.repeats?.[0]) {
            repeats = extractPatternValue(v.children.repeats[0]) ?? Infinity;
          }
        } else if (flatExprs.length > 0) {
          // Flat syntax: Pseq(a, b, c) - all args are values, default inf repeats
          values = flatExprs.map(extractPatternValue);
        }

        val = {
          type: "pattern",
          name: patternName,
          values: values,
          repeats: repeats
        };

        if (OSCILLA_DSL_DEBUG) {
          console.log(`[cueSynth] patternCall: ${patternName}`, values, `repeats=${repeats}`);
        }
      }
      // ✅ CASE 3: arrayValue like [220, 330, 440]
      else if (v?.name === "arrayValue") {
        const items = v.children?.animValue || [];
        val = items.map(item => {
          if (item.children?.NumberLiteral?.[0]) {
            return Number(item.children.NumberLiteral[0].image);
          }
          if (item.children?.StringLiteral?.[0]) {
            return item.children.StringLiteral[0].image.replace(/^["']|["']$/g, "");
          }
          if (item.children?.Identifier?.[0]) {
            const id = item.children.Identifier[0].image;
            return id === "inf" ? Infinity : id;
          }
          return null;
        });

        if (OSCILLA_DSL_DEBUG) {
          console.log(`[cueSynth] arrayValue:`, val);
        }
      }
      // ✅ CASE 4: simpleFuncCall like rand(100, 500)
      else if (v?.name === "simpleFuncCall") {
        const fname = v.children?.Identifier?.[0]?.image;
        const argsCst = v.children?.animValue || [];

        const funcArgs = argsCst.map(arg => {
          if (arg.children?.NumberLiteral?.[0]) {
            return Number(arg.children.NumberLiteral[0].image);
          }
          if (arg.children?.StringLiteral?.[0]) {
            return arg.children.StringLiteral[0].image.replace(/^["']|["']$/g, "");
          }
          if (arg.children?.Identifier?.[0]) {
            const id = arg.children.Identifier[0].image;
            return id === "inf" ? Infinity : id;
          }
          return null;
        });

        val = { type: "func", name: fname, args: funcArgs };
      }
      // ✅ CASE 5: Direct token (number, string, identifier, bool)
      else if (v?.image != null) {
        const raw = v.image.replace(/^["']|["']$/g, "");
        val = raw === "true" ? true :
              raw === "false" ? false :
              (!isNaN(raw) && raw !== "") ? Number(raw) : raw;
      }
      // ✅ CASE 6: Wrapped token in children (from generic value handling)
      else if (v?.children) {
        if (v.children.NumberLiteral?.[0]) {
          val = Number(v.children.NumberLiteral[0].image);
        } else if (v.children.StringLiteral?.[0]) {
          val = v.children.StringLiteral[0].image.replace(/^["']|["']$/g, "");
        } else if (v.children.True?.[0]) {
          val = true;
        } else if (v.children.False?.[0]) {
          val = false;
        } else if (v.children.Identifier?.[0]) {
          val = v.children.Identifier[0].image;
        }
      }

      if (OSCILLA_DSL_DEBUG) {
        console.log(`[cueSynth] Final: ${key} =`, val);
      }

      args.push({ type: key, value: val });
    }

    if (OSCILLA_DSL_DEBUG) {
      console.log("[cueSynth] Final AST args:", args);
    }

    return {
      type: "cueSynth",
      args
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

      if (p.children.cueCall) {
        const call = p.children.cueCall[0].children;
        const fn = call.fn[0].image;
        const arg = call.arg[0].image;
        next = `${fn}(${arg})`;
        continue;
      }

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

    const params = {};
    const paramNodes = node.children.genericParam || [];

    const parseRawValue = (raw) => {
      if (raw === undefined || raw === null) return raw;

      const s = String(raw).trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
      }

      if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
      if (!isNaN(s) && s !== '') return Number(s);

      return s;
    };

    for (const p of paramNodes) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (key) params[key] = parseRawValue(raw);
    }

    return {
      type: "cueStop",
      ...params,
    };
  }

  // ------------------------------------------------------------
  // extractValue(vNode) — unified value normalizer for animValue
  // ------------------------------------------------------------
  function extractValue(vNode) {
    if (!vNode || !vNode.children) return null;

    if (vNode.children.animValue) {
      return extractValue(vNode.children.animValue[0]);
    }
    if (vNode.children.value && vNode.children.value[0]?.children?.animValue) {
      return extractValue(vNode.children.value[0].children.animValue[0]);
    }

    if (vNode.children.NumberLiteral) {
      return Number(vNode.children.NumberLiteral[0].image);
    }

    if (vNode.children.Identifier) {
      const name = vNode.children.Identifier[0].image;
      if (name === "inf") return "inf";
      if (name === "true") return true;
      if (name === "false") return false;
      return name;
    }

    if (vNode.children.arrayValue) {
      const arr = vNode.children.arrayValue[0];
      const items = arr.children.animValue || [];
      return items.map(extractValue);
    }

    if (vNode.children.patternCall) {
      const call = vNode.children.patternCall[0];
      const name = call.children.PatternName[0].image;

      const exprs = call.children.patternExpr || [];
      const values = exprs.slice(0, -1).map(extractValue);

      let repeats = 1;
      if (exprs.length > values.length) {
        repeats = extractValue(exprs[exprs.length - 1]);
      }

      return {
        type: "pattern",
        name,
        values,
        repeats
      };
    }

    if (vNode.children.simpleFuncCall) {
      const call = vNode.children.simpleFuncCall[0];

      const nameTok = call.children?.Identifier?.[0];
      const name = nameTok?.image || "unknown";

      const argNodes = call.children?.animValue || [];
      const args = argNodes.map(a => extractValue(a));

      if (OSCILLA_DSL_DEBUG) {
        console.log("[extractValue] simpleFuncCall →", { name, args, callChildren: call.children });
      }

      return {
        type: "func",
        name,
        args
      };
    }

    return null;
  }

  function extractPatternCall(node) {
    if (!node) return null;
    try {
      return convertPatternNodeToAST(node);
    } catch (err) {
      console.warn("[extractPatternCall] ERROR:", err);
      return null;
    }
  }

  function extractFuncCall(node) {
    if (!node || !node.children) return null;

    const id = node.children.Identifier?.[0];
    if (!id) return null;

    return {
      name: id.image.toLowerCase(),
      args: node.children.animValue ?? []
    };
  }

  // ============================================================================
  // shared helper animation AST builders
  // ============================================================================
  function extractAnimKvArgs(node) {
    if (OSCILLA_DSL_DEBUG) console.log("[OSCILLA_DSL] extractAnimKvArgs() ENTER:", node);

    const out = [];

    const firstValueNode = node.children.animGenericParamList?.[0]?.children?.firstValue?.[0];
    if (firstValueNode) {
      const val = extractValue(firstValueNode);
      out.push({ type: "values", value: val });
    }

    const restParams = node.children.animGenericParamList?.[0]?.children?.restParams ||
      node.children.animGenericParamList?.[0]?.children?.kvParams || [];

    for (const p of restParams) {
      const key = p.children.key?.[0]?.image || p.key;
      if (!key) continue;

      let vNode =
        p.children.value?.[0] ||
        p.children.animValue?.[0] ||
        p.children.NumberLiteral?.[0] ||
        p.children.StringLiteral?.[0] ||
        p.children.Identifier?.[0] ||
        null;

      if (vNode?.children?.StringLiteral) {
        vNode = vNode.children.StringLiteral[0];
      }

      if (vNode?.children?.NumberLiteral) {
        vNode = vNode.children.NumberLiteral[0];
      }

      let val;

      if (vNode?.tokenType?.name === "StringLiteral") {
        val = vNode.image.replace(/^"(.*)"$/, "$1");
      } else {
        val = extractValue({
          children: vNode
            ? { ...(vNode.children || {}), [vNode.tokenType?.name]: [vNode] }
            : {}
        });
      }

      if (val === null || val === undefined) {
        const img = vNode?.image;

        if (img === "true") val = true;
        else if (img === "false") val = false;
        else if (img !== undefined && !isNaN(img)) val = Number(img);
        else val = img ?? null;
      }

      out.push({ type: key, value: val });
    }

    if (OSCILLA_DSL_DEBUG) console.log("[OSCILLA_DSL] extractAnimKvArgs() RETURN:", out);
    return out;
  }

  // ============================================================================
  // Build AST for animation cues
  // ============================================================================
  const rotNode = cst.children?.cueRotateTop?.[0] || (cst.name === "cueRotateTop" ? cst : null);
  if (rotNode) {
    return { type: "cueRotate", args: extractAnimKvArgs(rotNode) };
  }

  const scNode = cst.children?.cueScaleTop?.[0] || (cst.name === "cueScaleTop" ? cst : null);
  if (scNode) {
    return { type: "cueScale", args: extractAnimKvArgs(scNode) };
  }

  const o2pNode = cst.children?.cueO2PTop?.[0] || (cst.name === "cueO2PTop" ? cst : null);
  if (o2pNode) {
    return { type: "cueO2P", args: extractAnimKvArgs(o2pNode) };
  }

  // ============================================================================
  // 🔹 Fallback (unknown cue)
  // ============================================================================
  console.warn("[CueDSL] Unrecognized CST structure:", cst.name);
  return { type: "cueUnknown", args: [] };
}

// ============================================================================
// 4️⃣ MAIN ENTRY
// ============================================================================
export function parseCueToAST(input) {
  if (input.trim().startsWith("use(")) {
    return null;
  }

  const lexResult = CueLexer.tokenize(input);

  if (OSCILLA_DSL_DEBUG) {
    console.log("[LexerDebug] Input:", input);
    console.log("[LexerDebug] Tokens:", lexResult.tokens.map(t => `${t.tokenType.name}:"${t.image}"`));
    console.log("[LexerDebug] Errors:", lexResult.errors);
  }

  const parser = new CueParser();
  parser.input = lexResult.tokens;
  const cst = parser.cueTop();

  if (parser.errors.length) {
    console.error("[CueDSL] ❌ Parse errors:", parser.errors);
    throw new Error("Parsing failed");
  }

  if (OSCILLA_DSL_DEBUG) {
    console.log("✅ Parsed CST structure:");
    printCST(cst);
  }

  const ast = cstToAst(cst);

  if (OSCILLA_DSL_DEBUG) {
    console.log("[CueDSL] ✅ Final AST:", JSON.stringify(ast, null, 2));
  }

  return ast;
}

window.parseCueToAST = parseCueToAST;
