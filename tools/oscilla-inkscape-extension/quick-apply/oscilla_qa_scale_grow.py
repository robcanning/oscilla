#!/usr/bin/env python3
"""OSCILLA Quick Apply: Scale Grow"""
import inkex

class OscillaQA_ScaleGrow(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "scale(min:1, max:1.5, dur:3)")

if __name__ == "__main__":
    OscillaQA_ScaleGrow().run()
