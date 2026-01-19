#!/usr/bin/env python3
"""OSCILLA Quick Apply: Scale Pulse"""
import inkex

class OscillaQA_ScalePulse(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "scale(values:[1,1.3,1], dur:2, loop:0)")

if __name__ == "__main__":
    OscillaQA_ScalePulse().run()
