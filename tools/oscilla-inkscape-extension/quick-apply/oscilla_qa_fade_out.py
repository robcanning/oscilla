#!/usr/bin/env python3
"""OSCILLA Quick Apply: Fade Out"""
import inkex

class OscillaQA_FadeOut(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "fade(mode:out, dur:2)")

if __name__ == "__main__":
    OscillaQA_FadeOut().run()
