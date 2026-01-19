#!/usr/bin/env python3
"""
OSCILLA Toolbar Launcher - Inkscape Extension
Launches the standalone toolbar as a separate process so it doesn't block Inkscape.
"""

import inkex
import subprocess
import os
import sys
import warnings


class OscillaToolbarLauncher(inkex.EffectExtension):
    """Launches the OSCILLA toolbar as a separate process."""
    
    def effect(self):
        # Find the standalone toolbar script
        script_dir = os.path.dirname(os.path.realpath(__file__))
        toolbar_script = os.path.join(script_dir, "oscilla_toolbar_standalone.py")
        
        if not os.path.exists(toolbar_script):
            inkex.errormsg(f"Toolbar script not found at:\n{toolbar_script}\n\nPlease ensure oscilla_toolbar_standalone.py is installed.")
            return
        
        try:
            # Suppress the ResourceWarning about subprocess still running
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", ResourceWarning)
                
                # Launch as detached subprocess
                subprocess.Popen(
                    [sys.executable, toolbar_script],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    start_new_session=True,
                    close_fds=True
                )
                
        except Exception as e:
            inkex.errormsg(f"Failed to launch toolbar: {e}")


if __name__ == "__main__":
    OscillaToolbarLauncher().run()
