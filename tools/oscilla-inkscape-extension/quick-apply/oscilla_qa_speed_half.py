#!/usr/bin/env python3
"""OSCILLA Quick Apply: Speed 0.5x"""
import inkex

class OscillaQA_SpeedHalf(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "speed(value:0.5)")

if __name__ == "__main__":
    OscillaQA_SpeedHalf().run()
