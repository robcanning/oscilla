#!/usr/bin/env python3
"""
OSCILLA Apply Cue - Reads cue from temp file and applies to selection.
This is called by the standalone toolbar via Inkscape's action system.

The workflow:
1. Standalone toolbar writes cue to /tmp/oscilla_cue.txt
2. User triggers this extension via keyboard shortcut
3. Extension reads the file and applies the cue

Bind this to a shortcut like Ctrl+Shift+Q for quick application.
"""

import inkex
import os

TEMP_FILE = "/tmp/oscilla_cue.txt"


class OscillaApplyCue(inkex.EffectExtension):
    """Apply cue from temp file to selected elements."""
    
    def effect(self):
        # Read cue from temp file
        if not os.path.exists(TEMP_FILE):
            inkex.errormsg("No cue queued. Use the OSCILLA toolbar first.")
            return
        
        try:
            with open(TEMP_FILE, 'r') as f:
                cue = f.read().strip()
        except Exception as e:
            inkex.errormsg(f"Error reading cue: {e}")
            return
        
        if not cue:
            inkex.errormsg("Empty cue file.")
            return
        
        # Apply to selection
        if not self.svg.selection:
            inkex.errormsg("No elements selected.")
            return
        
        count = 0
        for elem in self.svg.selection.values():
            elem.set("id", cue)
            count += 1
        
        # Clear the temp file
        try:
            os.remove(TEMP_FILE)
        except:
            pass


if __name__ == "__main__":
    OscillaApplyCue().run()
