#!/usr/bin/env python3
"""OSCILLA Quick Apply: Fade Pulse"""
import inkex

class OscillaQA_FadePulse(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "fade(mode:pulse, dur:3, from:0.2, to:1)")

if __name__ == "__main__":
    OscillaQA_FadePulse().run()
