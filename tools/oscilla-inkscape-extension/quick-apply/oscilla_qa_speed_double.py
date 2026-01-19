#!/usr/bin/env python3
"""OSCILLA Quick Apply: Speed 2x"""
import inkex

class OscillaQA_SpeedDouble(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "speed(value:2)")

if __name__ == "__main__":
    OscillaQA_SpeedDouble().run()
