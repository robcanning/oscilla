#!/usr/bin/env python3
"""OSCILLA Quick Apply: Color Cycle"""
import inkex

class OscillaQA_ColorCycle(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "color(vals:[#f00,#ff0,#0f0,#0ff,#00f], dur:5)")

if __name__ == "__main__":
    OscillaQA_ColorCycle().run()
