#!/usr/bin/env python3
"""OSCILLA Quick Apply: Nav Scroll@A"""
import inkex

class OscillaQA_NavScroll(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "nav(scroll@A)")

if __name__ == "__main__":
    OscillaQA_NavScroll().run()
