#!/usr/bin/env python3
"""OSCILLA Quick Apply: OSC Ctrl Pan"""
import inkex

class OscillaQA_OscCtrl(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "oscCtrl(addr:\"/pan\", min:-1, max:1)")

if __name__ == "__main__":
    OscillaQA_OscCtrl().run()
