#!/usr/bin/env python3
"""
OSCILLA Quick Apply - Minimal dialog-free cue application

These are separate small extensions that can be bound to keyboard shortcuts
for instant cue application without opening dialogs.

Usage:
1. Install all oscilla_qa_*.inx and .py files
2. In Inkscape: Edit → Preferences → Interface → Keyboard
3. Search for "OSCILLA" and bind shortcuts like:
   - Ctrl+Alt+P → Pause
   - Ctrl+Alt+S → Scale Pulse
   - etc.

Author: Generated for OSCILLA project
Version: 1.0.0
"""

import inkex


class OscillaQuickApplyBase(inkex.EffectExtension):
    """Base class for quick-apply extensions."""
    
    CUE = ""  # Override in subclasses
    
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", self.CUE)


# --- Individual Quick Apply Classes ---

class QA_Stop(OscillaQuickApplyBase):
    CUE = "stop()"

class QA_Pause4(OscillaQuickApplyBase):
    CUE = "pause(dur:4)"

class QA_Pause8Count(OscillaQuickApplyBase):
    CUE = "pause(dur:8, count:true)"

class QA_SpeedHalf(OscillaQuickApplyBase):
    CUE = "speed(value:0.5)"

class QA_SpeedDouble(OscillaQuickApplyBase):
    CUE = "speed(value:2)"

class QA_ScalePulse(OscillaQuickApplyBase):
    CUE = "scale(values:[1,1.3,1], dur:2, loop:0)"

class QA_ScaleGrow(OscillaQuickApplyBase):
    CUE = "scale(min:1, max:1.5, dur:3)"

class QA_RotateCW(OscillaQuickApplyBase):
    CUE = "rotate(dir:1, dur:2)"

class QA_RotateCCW(OscillaQuickApplyBase):
    CUE = "rotate(dir:-1, dur:2)"

class QA_FadeIn(OscillaQuickApplyBase):
    CUE = "fade(mode:in, dur:2)"

class QA_FadeOut(OscillaQuickApplyBase):
    CUE = "fade(mode:out, dur:2)"

class QA_FadePulse(OscillaQuickApplyBase):
    CUE = "fade(mode:pulse, dur:3, from:0.2, to:1)"

class QA_ColorCycle(OscillaQuickApplyBase):
    CUE = "color(vals:[#f00,#ff0,#0f0,#0ff,#00f], dur:5)"

class QA_Metro120(OscillaQuickApplyBase):
    CUE = "metro(bpm:120, visual:hex, trig:playhead)"

class QA_Stopwatch(OscillaQuickApplyBase):
    CUE = "stopwatch(source:new, trig:auto)"

class QA_ClearCue(inkex.EffectExtension):
    """Clear cue and reset to simple ID."""
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            new_id = f"elem_{abs(hash(elem)) % 100000}"
            elem.set("id", new_id)
