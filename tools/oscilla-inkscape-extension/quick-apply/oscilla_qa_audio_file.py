#!/usr/bin/env python3
"""OSCILLA Quick Apply: Audio File"""
import inkex

class OscillaQA_AudioFile(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "audio(src:sound.wav)")

if __name__ == "__main__":
    OscillaQA_AudioFile().run()
