// ============================================================================
// parser.js — OscillaScore CueDSL Parser (Chevrotain 11+) — REFACTORED v3
// ============================================================================
//
// Refactored from v2 (~2680 lines) to eliminate redundancy in CST→AST.
// Same tokens, same grammar, same DSL syntax, same AST output.
//
// Key changes:
//  - Single extractVal() replaces 5+ overlapping value extractors
//  - Single extractGenericArgs() replaces 10+ copy-paste param loops
//  - Data-driven cstToAst() replaces 1500+ lines of per-cue handlers
//  - Audio/AudioPool/AudioImpulse share one extraction path
//
// ============================================================================
const OSCILLA_DSL_DEBUG = true;

import {
  createToken,
  Lexer,
  CstParser,
} from "https://esm.sh/chevrotain@11.0.3/es2022/chevrotain.mjs";

import { maybeConvertToSignalRef, isBindableParam } from './parserSignalRef.js';

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
// 1️⃣ TOKEN DEFINITIONS (unchanged from v2)
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
const ControlXY = createToken({ name: "ControlXY", pattern: /\bcontrolXY\b/, longer_alt: Identifier });
const O2P = createToken({ name: "O2P", pattern: /\bo2p\b/, longer_alt: Identifier });
const Color = createToken({
  name: "Color",
  pattern: /\b(color|colour)(?=\s*\()/,
  longer_alt: Identifier
});
const Ui = createToken({ name: "Ui", pattern: /\bui\b/, longer_alt: Identifier });
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
  Rotate, Scale, ScaleXY, O2P, Color, Ui,
  Osc, OscCtrl, OscCtrlNode, ControlXY,
  After, PatternName, Choose,
  LParen, RParen, LBrace, RBrace, LBracket, RBracket, Colon, Comma, At, XParam,
  RangeLiteral, NumberLiteral, StringLiteral, True, False,
  Identifier, WS
];

export const CueLexer = new Lexer(allTokens);

// ============================================================================
// 2️⃣ PARSER (grammar rules — same structure, minor cleanup)
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

    // ---- ANIMATION PATTERN/VALUE RULES ----
    $.RULE("animPatternCall", () => {
      $.CONSUME(PatternName);
      $.CONSUME(LParen);
      $.OR([
        {
          GATE: () => $.LA(1).tokenType.name === "LBracket",
          ALT: () => {
            $.CONSUME(LBracket);
            $.MANY_SEP({ SEP: Comma, DEF: () => $.SUBRULE1($.animValue) });
            $.CONSUME(RBracket);
            $.OPTION(() => { $.CONSUME(Comma); $.SUBRULE2($.animValue); });
          }
        },
        {
          ALT: () => {
            $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE3($.animValue) });
          }
        }
      ]);
      $.CONSUME(RParen);
    });

    $.RULE("animValue", () => {
      return $.OR([
        { ALT: () => $.SUBRULE($.arrayValue) },
        { GATE: () => $.LA(1).tokenType === PatternName, ALT: () => $.SUBRULE($.patternCall) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(True) },
        { ALT: () => $.CONSUME(False) },
        {
          GATE: () => $.LA(1).tokenType.name === "Identifier" && $.LA(2).tokenType.name === "LParen",
          ALT: () => $.SUBRULE($.simpleFuncCall)
        },
        { ALT: () => $.CONSUME(Identifier) },
      ]);
    });

    $.RULE("arrayValue", () => {
      $.CONSUME(LBracket);
      const items = [];
      $.MANY_SEP({ SEP: Comma, DEF: () => items.push($.SUBRULE($.animValue)) });
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
          GATE: () => !($.LA(1).tokenType === Identifier && $.LA(2).tokenType === Colon),
          ALT: () => {
            $.SUBRULE($.animValue, { LABEL: "firstValue" });
            $.OPTION(() => $.CONSUME(Comma));
            $.MANY_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.animGenericParam, { LABEL: "restParams" }) });
          }
        },
        {
          ALT: () => {
            $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE2($.animGenericParam, { LABEL: "kvParams" }) });
          }
        }
      ]);
      $.CONSUME(RParen);
    });

    // ---- Object literal support ----
    $.RULE("objectValue", () => {
      $.OR([
        { GATE: () => $.LA(1).tokenType === PatternName, ALT: () => $.SUBRULE($.patternCall) },
        { GATE: () => $.LA(1).tokenType === Identifier && $.LA(2).tokenType === LParen, ALT: () => $.SUBRULE($.simpleFuncCall) },
        { GATE: () => $.LA(1).tokenType === LBracket, ALT: () => $.SUBRULE($.arrayValue) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(True) },
        { ALT: () => $.CONSUME(False) },
        { ALT: () => $.CONSUME(Identifier) },
      ]);
    });

    $.RULE("objectPair", () => {
      $.CONSUME(Identifier, { LABEL: "key" });
      $.CONSUME(Colon);
      $.SUBRULE($.objectValue, { LABEL: "value" });
    });

    $.RULE("objectLiteral", () => {
      $.CONSUME(LBrace);
      $.OPTION(() => {
        $.SUBRULE($.objectPair);
        $.MANY(() => { $.CONSUME(Comma); $.SUBRULE2($.objectPair); });
      });
      $.CONSUME(RBrace);
    });

    // ---- Generic param rules (reusable across cues) ----
    $.RULE("genericParam", () => {
      $.OR1([
        { ALT: () => $.CONSUME(Identifier, { LABEL: "key" }) },
        { ALT: () => $.CONSUME(Osc, { LABEL: "key" }) },
        { ALT: () => $.CONSUME(OscCtrl, { LABEL: "key" }) },
        { ALT: () => $.CONSUME(OscCtrlNode, { LABEL: "key" }) },
      ]);
      $.CONSUME(Colon);
      $.OR2([
        { GATE: () => $.LA(1).tokenType === LBrace, ALT: () => $.SUBRULE($.objectLiteral, { LABEL: "value" }) },
        { GATE: () => $.LA(1).tokenType === PatternName, ALT: () => $.SUBRULE($.patternCall, { LABEL: "value" }) },
        { GATE: () => $.LA(1).tokenType === LBracket, ALT: () => $.SUBRULE($.arrayValue, { LABEL: "value" }) },
        { GATE: () => $.LA(1).tokenType === Identifier && $.LA(2).tokenType === LParen, ALT: () => $.SUBRULE($.simpleFuncCall, { LABEL: "value" }) },
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
      $.MANY_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.genericParam) });
      $.OPTION(() => $.CONSUME(Comma));
      $.CONSUME(RParen);
    });

    $.RULE("genericParamListNoParens", () => {
      $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.genericParam) });
    });

    // ---- Utility rules ----
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
        $.MANY(() => { $.CONSUME(Comma); args.push($.SUBRULE2($.animValue)); });
      });
      $.CONSUME(RParen);
      return { type: "funcCall", name, args };
    });

    // ---- Pattern rules ----
    $.RULE("patternExpr", () => {
      $.OR([
        { GATE: () => $.LA(1).tokenType.name === "PatternName", ALT: () => $.SUBRULE($.patternCall) },
        { GATE: () => $.LA(1).tokenType.name === "Identifier" && $.LA(2).tokenType.name === "Colon", ALT: () => $.SUBRULE($.pageWithDuration) },
        { ALT: () => $.CONSUME(Identifier) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => { $.CONSUME(LParen); $.SUBRULE2($.patternExpr); $.CONSUME(RParen); } },
      ]);
    });

    $.RULE("patternCall", () => {
      $.CONSUME(PatternName);
      $.CONSUME(LParen);
      $.OR([
        {
          GATE: () => $.LA(1).tokenType === LBracket,
          ALT: () => {
            $.CONSUME(LBracket);
            $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE1($.patternExpr) });
            $.CONSUME(RBracket);
            $.OPTION(() => { $.CONSUME(Comma); $.SUBRULE($.patternExpr, { LABEL: "repeats" }); });
          }
        },
        {
          ALT: () => {
            $.AT_LEAST_ONE_SEP1({ SEP: Comma, DEF: () => $.SUBRULE2($.patternExpr, { LABEL: "flatValues" }) });
          }
        }
      ]);
      $.CONSUME(RParen);
    });

    // ---- Control/after clause rules ----
    $.RULE("controlExpr", () => {
      $.OR([
        { ALT: () => $.CONSUME(Nav, { LABEL: "controlName" }) },
        { ALT: () => $.CONSUME(Identifier, { LABEL: "controlName" }) },
      ]);
      $.CONSUME(LParen);
      $.CONSUME1(Identifier, { LABEL: "controlArg" });
      $.OPTION(() => { $.CONSUME(At, { LABEL: "At" }); $.CONSUME2(Identifier, { LABEL: "targetUid" }); });
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

    // ============================================================
    // CUE-SPECIFIC GRAMMAR RULES
    // ============================================================

    // ---- fade ----
    $.RULE("fadeParam", () => {
      $.OR([{ ALT: () => $.CONSUME(Identifier, { LABEL: "keyIdent" }) }]);
      $.CONSUME(Colon);
      $.OR1([
        { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "num" }) },
        { ALT: () => $.CONSUME1(Identifier, { LABEL: "ident" }) },
        { ALT: () => $.CONSUME(Stop, { LABEL: "kwStop" }) },
      ]);
    });

    $.RULE("fadeParamList", () => {
      $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.fadeParam) });
    });

    $.RULE("cueFadeTop", () => {
      $.CONSUME(Fade);
      $.CONSUME(LParen);
      $.OPTION(() => $.SUBRULE($.fadeParamList));
      $.CONSUME(RParen);
    });

    // ---- page ----
    $.RULE("cuePageTop", () => {
      $.CONSUME(Page);
      $.CONSUME(LParen);
      $.SUBRULE($.pageBody, { LABEL: "body" });
      $.CONSUME(RParen);
    });

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

    // ---- video (has special sizePair support) ----
    this.RULE("cueVideoTop", () => {
      this.CONSUME(Video);
      this.CONSUME(LParen);
      this.OPTION(() => this.SUBRULE(this.videoParamList));
      this.CONSUME(RParen);
    });

    this.RULE("videoParamList", () => {
      this.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => this.SUBRULE(this.videoParam) });
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

    // ---- simple keyword + genericParamList cues ----
    $.RULE("cueTextTop", () => { $.CONSUME(Text); $.SUBRULE($.genericParamList); });
    $.RULE("cueAudioTop", () => { $.CONSUME(Audio); $.SUBRULE($.genericParamList); });
    $.RULE("cueAudioPoolTop", () => { $.CONSUME(AudioPool); $.SUBRULE($.genericParamList); });
    $.RULE("cueAudioImpulseTop", () => { $.CONSUME(AudioImpulse); $.SUBRULE($.genericParamList); });
    $.RULE("cueSynthTop", () => { $.CONSUME(Synth); $.SUBRULE($.genericParamList); });
    $.RULE("cueOscCtrlTop", () => { $.CONSUME(OscCtrl); $.SUBRULE($.genericParamList); });
    $.RULE("cueOscCtrlNodeTop", () => { $.CONSUME(OscCtrlNode); $.SUBRULE($.genericParamList); });
    $.RULE("cueControlXYTop", () => { $.CONSUME(ControlXY); $.SUBRULE($.genericParamList); });

    $.RULE("cueStopwatchTop", () => {
      $.CONSUME(Stopwatch);
      $.CONSUME(LParen);
      $.OPTION(() => { $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.genericParam) }); });
      $.CONSUME(RParen);
    });

    // ---- osc (has trailing param list) ----
    $.RULE("trailingParamList", () => {
      $.SUBRULE($.genericParam);
      $.MANY(() => { $.CONSUME(Comma); $.SUBRULE2($.genericParam); });
    });

    $.RULE("cueOscTop", () => {
      $.CONSUME(Osc);
      $.SUBRULE($.genericParamList, { LABEL: "genericParamList" });
      $.OPTION(() => { $.CONSUME(Comma); $.SUBRULE($.trailingParamList, { LABEL: "trailingParamList" }); });
    });

    // ---- speed (shorthand number support) ----
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
                $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.genericParam) });
              });
            }
          },
          {
            ALT: () => {
              $.AT_LEAST_ONE_SEP1({ SEP: Comma, DEF: () => $.SUBRULE1($.genericParam) });
            }
          }
        ]);
      });
      $.CONSUME(RParen);
    });

    // ---- nav ----
    $.RULE("cueNavTop", () => {
      $.CONSUME(Nav);
      $.CONSUME(LParen);
      $.CONSUME(Identifier, { LABEL: "navAction" });
      $.OPTION(() => { $.CONSUME(At); $.CONSUME1(Identifier, { LABEL: "navTarget" }); });
      $.OPTION1(() => { $.CONSUME(Comma); $.SUBRULE($.genericParamListNoParens, { LABEL: "params" }); });
      $.CONSUME(RParen);
    });

    // ---- stop ----
    this.RULE("cueStopTop", () => {
      this.CONSUME(Stop);
      this.OPTION(() => {
        this.CONSUME(LParen);
        this.OPTION1(() => {
          this.SUBRULE(this.genericParam);
          this.MANY(() => { this.CONSUME(Comma); this.SUBRULE2(this.genericParam); });
        });
        this.CONSUME(RParen);
      });
    });

    // ---- pause ----
    $.RULE("cuePauseTop", () => {
      $.CONSUME(Pause);
      $.CONSUME(LParen);
      $.OR([
        { ALT: () => $.CONSUME(NumberLiteral, { LABEL: "shorthandDur" }) },
        { ALT: () => $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.genericParam) }) }
      ]);
      $.CONSUME(RParen);
    });

    // ---- metronome ----
    $.RULE("cueMetronomeTop", () => {
      $.CONSUME(Identifier, { LABEL: "metronomeName" });
      $.SUBRULE($.genericParamList);
    });

    // ---- button ----
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
        $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.genericParam, { LABEL: "styleParam" }) });
        $.CONSUME(RParen);
      });
      $.CONSUME2(RParen);
    });

    // ---- animation cues ----
    $.RULE("cueRotateTop", () => { $.CONSUME(Rotate); $.SUBRULE($.animGenericParamList); });
    $.RULE("cueScaleTop", () => {
      $.OR([{ ALT: () => $.CONSUME(Scale) }, { ALT: () => $.CONSUME2(ScaleXY) }]);
      $.SUBRULE($.animGenericParamList);
    });
    $.RULE("cueO2PTop", () => { $.CONSUME(O2P); $.SUBRULE($.animGenericParamList); });
    $.RULE("cueColorTop", () => { $.CONSUME(Color); $.SUBRULE($.animGenericParamList); });

    // ---- ui ----
    $.RULE("cueUiTop", () => {
      $.CONSUME(Ui);
      $.CONSUME(LParen);
      $.OPTION(() => { $.CONSUME(StringLiteral, { LABEL: "selector" }); });
      $.OPTION2(() => {
        $.OPTION3(() => $.CONSUME(Comma));
        $.AT_LEAST_ONE_SEP({ SEP: Comma, DEF: () => $.SUBRULE($.genericParam) });
      });
      $.CONSUME(RParen);
    });

    // ============================================================
    // cueTop — main entry point
    // ============================================================
    $.RULE("cueTop", () => {
      $.OPTION(() => { $.CONSUME(Cue); $.CONSUME(Colon); });
      $.OR([
        { ALT: () => $.SUBRULE($.cueTextTop) },
        { ALT: () => $.SUBRULE($.cueFadeTop) },
        { ALT: () => $.SUBRULE($.cueNavTop) },
        { ALT: () => $.SUBRULE($.cuePageTop) },
        { ALT: () => $.SUBRULE($.cueStopwatchTop) },
        { ALT: () => $.SUBRULE($.cueVideoTop) },
        {
          GATE: () => $.LA(1).tokenType === Identifier &&
            ($.LA(1).image === "metro" || $.LA(1).image === "metronome"),
          ALT: () => $.SUBRULE($.cueMetronomeTop)
        },
        { ALT: () => $.SUBRULE($.cuePauseTop) },
        { ALT: () => $.SUBRULE($.cueUiTop) },
        {
          GATE: () => $.LA(1).tokenType === Identifier && $.LA(1).image === "speed",
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
        { ALT: () => $.SUBRULE($.cueColorTop) },
        { ALT: () => $.SUBRULE($.cueOscTop) },
        { ALT: () => $.SUBRULE($.cueOscCtrlTop) },
        { ALT: () => $.SUBRULE($.cueOscCtrlNodeTop) },
        { ALT: () => $.SUBRULE($.cueControlXYTop) },
      ]);
    });

    this.performSelfAnalysis();
  }
}

// ============================================================================
// 🔍 DEBUG TOKEN STREAM
// ============================================================================
export function debugTokens(inputText) {
  const lex = CueLexer.tokenize(inputText);
  console.groupCollapsed("[LexerDebug] Tokens");
  console.table(lex.tokens.map(t => ({ idx: t.startOffset, image: t.image, type: t.tokenType.name })));
  console.groupEnd();
  return lex.tokens;
}

// ============================================================================
// 3️⃣ UNIFIED VALUE EXTRACTION HELPERS
// ============================================================================

/** Unquote a string literal token image */
function unquote(s) {
  if (!s) return s;
  return s.replace(/^["']|["']$/g, "");
}

/** Parse a raw string into a typed JS value */
function parseRaw(raw) {
  if (raw === undefined || raw === null) return raw;
  const s = String(raw).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "inf") return "inf";
  if (!isNaN(s) && s !== "") return Number(s);
  return s;
}

/**
 * Universal value extractor — handles any CST value node.
 * Replaces: extractValue, extractValueExpr, extractObjectValue,
 *           inline parseVal, and duplicated token-unwrapping blocks.
 */
function extractVal(node) {
  if (!node) return null;

  // Direct token (has .image and .tokenType)
  if (node.image !== undefined && node.tokenType) {
    const tName = node.tokenType.name;
    if (tName === "NumberLiteral") return Number(node.image);
    if (tName === "StringLiteral") return unquote(node.image);
    if (tName === "True") return true;
    if (tName === "False") return false;
    if (tName === "RangeLiteral") return node.image;
    if (node.image === "inf") return "inf";
    return node.image;
  }

  // Has .image but no .tokenType (raw token object)
  if (node.image !== undefined) {
    return parseRaw(node.image);
  }

  if (!node.children) return null;

  // Unwrap animValue wrapper
  if (node.children.animValue) return extractVal(node.children.animValue[0]);
  if (node.name === "animValue") {
    for (const key of ["arrayValue", "patternCall", "simpleFuncCall",
      "NumberLiteral", "StringLiteral", "True", "False", "Identifier"]) {
      if (node.children[key]?.[0]) return extractVal(node.children[key][0]);
    }
  }

  // objectValue wrapper
  if (node.name === "objectValue") {
    for (const key of ["patternCall", "simpleFuncCall", "arrayValue",
      "NumberLiteral", "StringLiteral", "True", "False", "Identifier"]) {
      if (node.children[key]?.[0]) return extractVal(node.children[key][0]);
    }
  }

  // Pattern call
  if (node.name === "patternCall") return extractPatternCallNode(node);

  // Function call
  if (node.name === "simpleFuncCall") return extractFuncCallNode(node);

  // Array literal
  if (node.name === "arrayValue") {
    return (node.children.animValue || []).map(extractVal);
  }

  // Object literal
  if (node.name === "objectLiteral") return extractObjectLiteralNode(node);

  // Nested cue (for button triggers etc)
  if (node.name === "cueTop") return cstToAst(node);

  // Try unwrapping single child
  for (const key of ["NumberLiteral", "StringLiteral", "True", "False",
    "Identifier", "patternCall", "simpleFuncCall", "arrayValue", "objectLiteral"]) {
    if (node.children[key]?.[0]) return extractVal(node.children[key][0]);
  }

  return null;
}

/** Extract a patternCall CST node into an AST pattern object */
function extractPatternCallNode(node) {
  const name = node.children?.PatternName?.[0]?.image ?? "Pseq";
  const bracketedExprs = node.children?.patternExpr || [];
  const flatExprs = node.children?.flatValues || [];

  const getPatternVal = (expr) => {
    if (!expr) return null;
    if (expr.children?.patternCall?.[0]) return extractPatternCallNode(expr.children.patternCall[0]);
    if (expr.children?.pageWithDuration?.[0]) {
      const pwd = expr.children.pageWithDuration[0];
      return {
        page: pwd.children?.Identifier?.[0]?.image || pwd.children?.page?.[0]?.image,
        dur: Number(pwd.children?.NumberLiteral?.[0]?.image || pwd.children?.dur?.[0]?.image || 0)
      };
    }
    if (expr.children?.NumberLiteral?.[0]) return Number(expr.children.NumberLiteral[0].image);
    if (expr.children?.Identifier?.[0]) {
      const id = expr.children.Identifier[0].image;
      return id === "inf" ? Infinity : id;
    }
    return null;
  };

  let values = [];
  let repeats = Infinity;

  if (bracketedExprs.length > 0) {
    values = bracketedExprs.map(getPatternVal);
    if (node.children?.repeats?.[0]) {
      repeats = getPatternVal(node.children.repeats[0]) ?? Infinity;
    }
  } else if (flatExprs.length > 0) {
    values = flatExprs.map(getPatternVal);
  }

  return { type: "pattern", name, values, repeats };
}

/** Extract a simpleFuncCall CST node */
function extractFuncCallNode(node) {
  const fname = node.children?.Identifier?.[0]?.image;
  const argsCst = node.children?.animValue || [];
  return { type: "func", name: fname, args: argsCst.map(extractVal) };
}

/** Extract an objectLiteral CST node into a plain object */
function extractObjectLiteralNode(node) {
  const result = {};
  for (const pair of (node.children?.objectPair || [])) {
    const key = pair.children?.key?.[0]?.image;
    const valNode = pair.children?.value?.[0];
    if (key) result[key] = extractVal(valNode);
  }
  return result;
}

// ============================================================================
// PATTERN NODE CONVERTER (for page cue patterns — uses patternExpr rule)
// ============================================================================
function convertPatternNodeToAST(node) {
  if (!node) return { type: "Literal", value: null };

  if (node.name === "patternExpr") {
    if (node.children?.patternCall) return convertPatternNodeToAST(node.children.patternCall[0]);
    if (node.children?.pageWithDuration) return convertPatternNodeToAST(node.children.pageWithDuration[0]);
    if (node.children?.Identifier) return { type: "Literal", value: node.children.Identifier[0].image };
    if (node.children?.NumberLiteral) return { type: "Literal", value: Number(node.children.NumberLiteral[0].image) };
  }

  if (node.name === "pageWithDuration") {
    const id = node.children.Identifier?.[0]?.image || node.children.page?.[0]?.image || null;
    const dur = node.children.NumberLiteral?.[0]?.image || node.children.dur?.[0]?.image || 0;
    return { type: "Literal", value: { page: id, dur: Number(dur) } };
  }

  if (node.name === "patternCall") {
    const name = node.children?.PatternName?.[0]?.image ?? "Pseq";
    const exprs = (node.children.patternExpr || []).map(convertPatternNodeToAST);
    let repeats = 1;
    if (node.children.repeats?.[0]) {
      const num = node.children.repeats[0].children?.NumberLiteral?.[0]?.image;
      if (num) repeats = Number(num);
    }
    return { type: name, list: exprs, repeats };
  }

  if (node.children?.patternExpr) return convertPatternNodeToAST(node.children.patternExpr[0]);
  return { type: "Literal", value: node.image || null };
}

// ============================================================================
// AFTER CLAUSE EXTRACTOR
// ============================================================================
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

// ============================================================================
// GENERIC PARAM EXTRACTION HELPERS
// ============================================================================

/**
 * Extract genericParam[] children into [{type, value}] array.
 * Replaces 10+ copy-paste loops in the old parser.
 */
function extractGenericArgs(paramNodes, opts = {}) {
  const args = [];
  for (const p of paramNodes) {
    const key = p.children.key?.[0]?.image;
    if (!key) continue;

    const valNode = p.children.value?.[0];
    let val = null;

    // Special handling for funcCalls in osc/audio/text contexts
    if (opts.funcCallAware && valNode?.name === "simpleFuncCall") {
      val = extractFuncCallForAudio(valNode);
    }
    // General extraction
    if (val === null) {
      val = extractVal(valNode);
    }
    // Fallback: try raw image
    if (val === null && valNode?.image != null) {
      val = parseRaw(valNode.image);
    }

    // Signal reference check (synth)
    if (opts.signalRefAware && typeof val === 'string' && isBindableParam(key)) {
      val = maybeConvertToSignalRef(val, key);
    }

    args.push({ type: key, value: val });
  }
  return args;
}

/**
 * Extract genericParam[] into a flat {key: value} object.
 * Used by audio, audioPool, audioImpulse, stop.
 */
function extractGenericParamsFlat(paramNodes, opts = {}) {
  const params = {};
  for (const p of paramNodes) {
    const key = p.children.key?.[0]?.image;
    if (!key) continue;

    const valNode = p.children.value?.[0];
    let val = null;

    if (opts.funcCallAware && valNode?.name === "simpleFuncCall") {
      val = extractFuncCallForAudio(valNode);
    }
    if (val === null) {
      val = extractVal(valNode);
    }
    if (val === null && valNode?.image != null) {
      val = parseRaw(valNode.image);
    }

    params[key] = val;
  }
  return params;
}

/**
 * Handle funcCall nodes for audio cues (rand/irand → funcCall objects, general func calls)
 */
function extractFuncCallForAudio(valNode) {
  const fname = valNode.children?.Identifier?.[0]?.image?.toLowerCase();
  const argsCst = valNode.children?.animValue ?? [];

  if ((fname === "rand" || fname === "irand") && argsCst.length === 2) {
    const getNum = (n) => {
      if (n?.children?.NumberLiteral?.[0]) return Number(n.children.NumberLiteral[0].image);
      return NaN;
    };
    const min = getNum(argsCst[0]);
    const max = getNum(argsCst[1]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { type: "funcCall", name: fname, args: [min, max] };
    }
  }

  // General func call extraction
  const funcArgs = argsCst.map(arg => {
    if (arg.children?.NumberLiteral?.[0]) return Number(arg.children.NumberLiteral[0].image);
    if (arg.children?.StringLiteral?.[0]) return unquote(arg.children.StringLiteral[0].image);
    if (arg.image !== undefined) {
      const img = arg.image;
      const uq = unquote(img);
      return uq === img ? (isNaN(img) ? img : Number(img)) : uq;
    }
    return null;
  });

  return { type: "funcCall", name: fname, args: funcArgs };
}

/** Get genericParam nodes from a CST node that uses genericParamList. */
function getGenericParams(cstNode) {
  const list = cstNode.children?.genericParamList?.[0];
  return list?.children?.genericParam || [];
}

// ============================================================================
// ANIMATION HELPERS
// ============================================================================

/**
 * Extract animation KV args from an animation cue node.
 * Returns [{type, value}, ...] — same shape as v2.
 */
function extractAnimKvArgs(node) {
  const out = [];
  const paramList = node.children.animGenericParamList?.[0];
  if (!paramList) return out;

  // First positional value
  const firstValueNode = paramList.children?.firstValue?.[0];
  if (firstValueNode) {
    out.push({ type: "values", value: extractVal(firstValueNode) });
  }

  // Named key:value params
  const restParams = paramList.children?.restParams || paramList.children?.kvParams || [];
  for (const p of restParams) {
    const key = p.children.key?.[0]?.image || p.key;
    if (!key) continue;

    let vNode = p.children.value?.[0] || p.children.animValue?.[0] ||
      p.children.NumberLiteral?.[0] || p.children.StringLiteral?.[0] ||
      p.children.Identifier?.[0] || null;

    // Unwrap wrappers
    if (vNode?.children?.StringLiteral) vNode = vNode.children.StringLiteral[0];
    if (vNode?.children?.NumberLiteral) vNode = vNode.children.NumberLiteral[0];

    let val;
    if (vNode?.tokenType?.name === "StringLiteral") {
      val = vNode.image.replace(/^"(.*)"$/, "$1");
    } else {
      val = extractVal(vNode?.children
        ? { children: { ...(vNode.children || {}), [vNode.tokenType?.name]: [vNode] } }
        : vNode);
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

  return out;
}

// ============================================================================
// OSC-SPECIFIC FUNC CALL HANDLER
// ============================================================================
function extractOscFuncCall(valNode) {
  const fname = valNode.children?.Identifier?.[0]?.image?.toLowerCase();
  const argsCst = valNode.children?.animValue ?? [];

  const extractNum = (v) => {
    if (!v) return null;
    if (v.name === "animValue") {
      const child = v.children?.NumberLiteral?.[0] || v.children?.simpleFuncCall?.[0];
      return extractNum(child);
    }
    if (v.image != null && !isNaN(v.image)) return Number(v.image);
    return null;
  };

  if (fname === "deg" && argsCst.length === 2) {
    const degree = extractNum(argsCst[0]);
    const octave = extractNum(argsCst[1]);
    if (degree != null && octave != null) return { type: "deg", degree, octave };
  }
  if ((fname === "rand" || fname === "irand") && argsCst.length === 2) {
    const min = extractNum(argsCst[0]);
    const max = extractNum(argsCst[1]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { type: fname, min, max };
  }
  if ((fname === "hz" || fname === "midi") && argsCst.length === 1) {
    const value = extractNum(argsCst[0]);
    if (Number.isFinite(value)) return { type: fname, value };
  }

  return { type: "func", name: fname, args: argsCst.map(extractNum) };
}

// ============================================================================
// 4️⃣ CST → AST  (data-driven, replaces ~1500 lines)
// ============================================================================

export function cstToAst(cst) {

  // Helper: find the cue-specific CST node
  const find = (ruleName) =>
    cst.children?.[ruleName]?.[0] || (cst.name === ruleName ? cst : null);

  // ──────────────────────────────────────────────────
  // UI
  // ──────────────────────────────────────────────────
  const uiNode = find("cueUiTop");
  if (uiNode) {
    const args = [];
    const ch = uiNode.children;
    if (ch.selector?.[0]) {
      args.push({ type: "selector", value: unquote(ch.selector[0].image) });
    }
    args.push(...extractGenericArgs(ch.genericParam || []));
    return { type: "cueUi", args };
  }

  // ──────────────────────────────────────────────────
  // FADE
  // ──────────────────────────────────────────────────
  const fadeNode = find("cueFadeTop");
  if (fadeNode) {
    const params = [];
    const list = fadeNode.children.fadeParamList?.[0];
    for (const p of (list?.children.fadeParam || [])) {
      const ch = p.children;
      const key = ch.keyMode?.[0]?.image || ch.keyIdent?.[0]?.image || "";
      let value = null;
      if (ch.num) value = Number(ch.num[0].image);
      else if (ch.ident) value = ch.ident[0].image;
      params.push({ type: key, value });
    }
    return { type: "cueFade", args: params };
  }

  // ──────────────────────────────────────────────────
  // NAV
  // ──────────────────────────────────────────────────
  const navNode = find("cueNavTop");
  if (navNode) {
    const ch = navNode.children;
    const action = ch.navAction?.[0]?.image ?? null;
    const target = ch.navTarget?.[0]?.image ?? null;
    let params = {};
    if (ch.params?.[0]?.children?.genericParam) {
      for (const p of ch.params[0].children.genericParam) {
        const key = p.children.key?.[0]?.image;
        const raw = p.children.value?.[0]?.image;
        if (key && raw !== undefined) params[key] = unquote(raw);
      }
    }
    const uid = params.uid || (target ? `${action}@${target}` : action);
    return { type: "cueNav", action, target, uid, params };
  }

  // ──────────────────────────────────────────────────
  // PAGE
  // ──────────────────────────────────────────────────
  const pageNode = find("cuePageTop");
  if (pageNode) {
    const bodyNode = pageNode.children?.body?.[0];
    return {
      type: "cuePage",
      pattern: bodyNode?.children?.pattern?.[0]
        ? convertPatternNodeToAST(bodyNode.children.pattern[0]) : null,
      onCompletion: bodyNode?.children?.afterClause?.[0]
        ? extractAfterClause(bodyNode.children) : null,
    };
  }

  // ──────────────────────────────────────────────────
  // STOPWATCH
  // ──────────────────────────────────────────────────
  const stopwatchNode = find("cueStopwatchTop");
  if (stopwatchNode) {
    return { type: "cueStopwatch", args: extractGenericArgs(stopwatchNode.children.genericParam || []) };
  }

  // ──────────────────────────────────────────────────
  // VIDEO
  // ──────────────────────────────────────────────────
  const videoNode = find("cueVideoTop");
  if (videoNode) {
    const params = {};
    const items = videoNode.children?.videoParamList?.[0]?.children?.videoParam || [];
    for (const p of items) {
      const key = p.children.Identifier[0].image;
      const valueToken = p.children.NumberLiteral?.[0] || p.children.StringLiteral?.[0] || p.children.Identifier?.[1];
      const rawVal = valueToken?.image ?? null;
      params[key] = isNaN(rawVal) ? rawVal?.replace(/^"|"$/g, "") : Number(rawVal);
    }
    return { type: "cueVideo", params };
  }

  // ──────────────────────────────────────────────────
  // TEXT, METRONOME (genericParamList → args array)
  // ──────────────────────────────────────────────────
  const textNode = find("cueTextTop");
  if (textNode) {
    return { type: "cueText", args: extractGenericArgs(getGenericParams(textNode)) };
  }

  const metroNode = find("cueMetronomeTop");
  if (metroNode) {
    return { type: "cueMetronome", args: extractGenericArgs(getGenericParams(metroNode)) };
  }

  // ──────────────────────────────────────────────────
  // OSC (with trailing param list + special func calls)
  // ──────────────────────────────────────────────────
  const oscNode = find("cueOscTop");
  if (oscNode) {
    const items = [];
    const mainList = oscNode.children.genericParamList?.[0];
    if (mainList?.children?.genericParam) items.push(...mainList.children.genericParam);
    const trailingList = oscNode.children.trailingParamList?.[0];
    if (trailingList?.children?.genericParam) items.push(...trailingList.children.genericParam);

    const args = [];
    for (const p of items) {
      const key = p.children.key?.[0]?.image;
      if (!key) continue;
      let val = null;
      const v = p.children.value?.[0];
      if (v?.name === "simpleFuncCall") val = extractOscFuncCall(v);
      if (val === null && v?.image != null) {
        val = parseRaw(String(v.image).replace(/^"|"$/g, ""));
      }
      args.push({ type: key, value: val });
    }
    return { type: "cueOsc", args };
  }

  // ──────────────────────────────────────────────────
  // OSC_CTRL, OSC_CTRL_NODE
  // ──────────────────────────────────────────────────
  const oscCtrlNode = find("cueOscCtrlTop");
  if (oscCtrlNode) {
    return { type: "oscCtrl", args: extractGenericArgs(getGenericParams(oscCtrlNode)) };
  }

  const oscCtrlNodeNode = find("cueOscCtrlNodeTop");
  if (oscCtrlNodeNode) {
    return { type: "oscCtrlNode", args: extractGenericArgs(getGenericParams(oscCtrlNodeNode)) };
  }

  // ──────────────────────────────────────────────────
  // CONTROLXY
  // ──────────────────────────────────────────────────
  const controlXYNode = find("cueControlXYTop");
  if (controlXYNode) {
    return { type: "cueControlXY", args: extractGenericArgs(getGenericParams(controlXYNode)) };
  }

  // ──────────────────────────────────────────────────
  // SPEED
  // ──────────────────────────────────────────────────
  const speedNode = find("cueSpeedTop");
  if (speedNode) {
    const fnName = speedNode.children?.speedFn?.[0]?.image;
    if (fnName !== "speed") return null;
    const shorthandTok = speedNode.children?.shorthand?.[0];
    let value = shorthandTok ? Number(shorthandTok.image) : null;
    let add = null, dur = null, ease = null, uid = null;
    for (const p of (speedNode.children.genericParam || [])) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (!key) continue;
      const v = parseRaw(raw);
      if (key === "value" || key === "speed" || key === "multiplier") value = Number(v);
      else if (key === "add") add = Number(v);
      else if (key === "dur") dur = Number(v);
      else if (key === "ease" || key === "easing") ease = String(v);
      else if (key === "uid") uid = v;
    }
    return { type: "cueSpeed", value, add, dur, ease, uid };
  }

  // ──────────────────────────────────────────────────
  // BUTTON
  // ──────────────────────────────────────────────────
  const buttonNode = find("cueButtonTop");
  if (buttonNode) {
    const labelTok = buttonNode.children.labelValue?.[0];
    const label = labelTok ? labelTok.image.replace(/^"|"$/g, "") : "";
    const triggerAst = buttonNode.children.triggerValue?.[0]
      ? cstToAst(buttonNode.children.triggerValue[0]) : null;
    const opt = {};
    for (const p of (buttonNode.children.styleParam || [])) {
      const keyNode = p.children.key?.[0];
      const valNode = p.children.value?.[0];
      if (keyNode && valNode) opt[keyNode.image] = valNode.image.replace(/^"|"$/g, "");
    }
    return {
      type: "cueButton", label,
      triggerAst: { ...triggerAst, uid: triggerAst?.uid ?? null },
      opt
    };
  }

  // ──────────────────────────────────────────────────
  // AUDIO / AUDIO_POOL / AUDIO_IMPULSE (shared extraction)
  // ──────────────────────────────────────────────────
  const audioNode = find("cueAudioTop");
  if (audioNode) {
    const params = extractGenericParamsFlat(getGenericParams(audioNode), { funcCallAware: true });
    const { src, amp = 1, loop = 1, toggle = false, fade, fadeIn = fade, fadeOut = fade, uid = src } = params;
    return { type: "cueAudio", src, amp, loop, fadeIn: fadeIn ?? 0, fadeOut: fadeOut ?? 0, toggle, uid, params };
  }

  const audioPoolNode = find("cueAudioPoolTop");
  if (audioPoolNode) {
    const params = extractGenericParamsFlat(getGenericParams(audioPoolNode), { funcCallAware: true });
    const { path, glob, format = "wav", mode = "shuffle", uid, group } = params;
    return { type: "cueAudioPool", path, glob, format, mode, uid, group, params };
  }

  const audioImpulseNode = find("cueAudioImpulseTop");
  if (audioImpulseNode) {
    const params = extractGenericParamsFlat(getGenericParams(audioImpulseNode), { funcCallAware: true });
    const { path, glob, format = "wav", mode = "shuffle", rate = 30, jitter = 0, lifetime = "region", uid, group } = params;
    return { type: "cueAudioImpulse", path, glob, format, mode, rate, jitter, lifetime, uid, group, params };
  }

  // ──────────────────────────────────────────────────
  // SYNTH
  // ──────────────────────────────────────────────────
  const synthNode = find("cueSynthTop");
  if (synthNode) {
    return { type: "cueSynth", args: extractGenericArgs(getGenericParams(synthNode), { signalRefAware: true }) };
  }

  // ──────────────────────────────────────────────────
  // PAUSE
  // ──────────────────────────────────────────────────
  const pauseNode = find("cuePauseTop");
  if (pauseNode) {
    let dur = null, count = false, next = null;
    for (const p of (pauseNode.children.genericParam || [])) {
      const key = p.children.key[0].image;
      if (p.children.cueCall) {
        const call = p.children.cueCall[0].children;
        next = `${call.fn[0].image}(${call.arg[0].image})`;
        continue;
      }
      const raw = p.children.value?.[0]?.image;
      if (key === "dur") dur = Number(raw);
      if (key === "count") count = (raw === "true" || raw === "1");
    }
    return { type: "cuePause", dur, count, next };
  }

  // ──────────────────────────────────────────────────
  // STOP
  // ──────────────────────────────────────────────────
  const stopNode = find("cueStopTop");
  if (stopNode) {
    const params = {};
    for (const p of (stopNode.children.genericParam || [])) {
      const key = p.children.key?.[0]?.image;
      const raw = p.children.value?.[0]?.image;
      if (key) params[key] = parseRaw(raw);
    }
    return { type: "cueStop", ...params };
  }

  // ──────────────────────────────────────────────────
  // ANIMATION: ROTATE, SCALE, O2P, COLOR
  // ──────────────────────────────────────────────────
  const rotNode = find("cueRotateTop");
  if (rotNode) return { type: "cueRotate", args: extractAnimKvArgs(rotNode) };

  const scNode = find("cueScaleTop");
  if (scNode) return { type: "cueScale", args: extractAnimKvArgs(scNode) };

  const o2pNode = find("cueO2PTop");
  if (o2pNode) return { type: "cueO2P", args: extractAnimKvArgs(o2pNode) };

  const colorNode = find("cueColorTop");
  if (colorNode) return { type: "cueColor", args: extractAnimKvArgs(colorNode) };

  // ──────────────────────────────────────────────────
  // FALLBACK
  // ──────────────────────────────────────────────────
  console.warn("[CueDSL] Unrecognized CST structure:", cst.name);
  return { type: "cueUnknown", args: [] };
}

// ============================================================================
// 5️⃣ MAIN ENTRY
// ============================================================================
export function parseCueToAST(input) {
  if (input.trim().startsWith("use(")) return null;

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
