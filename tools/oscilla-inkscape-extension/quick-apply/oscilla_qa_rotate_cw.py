#!/usr/bin/env python3
"""OSCILLA Quick Apply: Rotate CW"""
import inkex

class OscillaQA_RotateCw(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "rotate(dir:1, dur:2)")

if __name__ == "__main__":
    OscillaQA_RotateCw().run()
