#!/usr/bin/env python3
"""OSCILLA Quick Apply: Stop"""
import inkex

class OscillaQA_Stop(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "stop()")

if __name__ == "__main__":
    OscillaQA_Stop().run()
