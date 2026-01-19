#!/usr/bin/env python3
"""OSCILLA Quick Apply: Rotate Swing"""
import inkex

class OscillaQA_RotateSwing(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "rotate(values:[0,30,-30], dur:1, mode:alt)")

if __name__ == "__main__":
    OscillaQA_RotateSwing().run()
