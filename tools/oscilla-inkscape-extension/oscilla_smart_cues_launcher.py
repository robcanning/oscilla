#!/usr/bin/env python3
"""
OSCILLA Smart Cues Launcher - Inkscape Extension
Launches the GTK-based Smart Cues editor as a separate process.
"""

import inkex
import subprocess
import os
import sys
import warnings


class OscillaSmartCuesLauncher(inkex.EffectExtension):
    """Launches the OSCILLA Smart Cues GTK editor."""
    
    def effect(self):
        script_dir = os.path.dirname(os.path.realpath(__file__))
        editor_script = os.path.join(script_dir, "oscilla_smart_cues_gtk.py")
        
        if not os.path.exists(editor_script):
            inkex.errormsg(f"Smart Cues editor not found at:\n{editor_script}")
            return
        
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", ResourceWarning)
                subprocess.Popen(
                    [sys.executable, editor_script],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    start_new_session=True,
                    close_fds=True
                )
        except Exception as e:
            inkex.errormsg(f"Failed to launch Smart Cues editor: {e}")


if __name__ == "__main__":
    OscillaSmartCuesLauncher().run()
