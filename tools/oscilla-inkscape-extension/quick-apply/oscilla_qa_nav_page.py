#!/usr/bin/env python3
"""OSCILLA Quick Apply: Nav Page1"""
import inkex

class OscillaQA_NavPage(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "nav(page1)")

if __name__ == "__main__":
    OscillaQA_NavPage().run()
