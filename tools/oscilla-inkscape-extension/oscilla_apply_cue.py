#!/usr/bin/env python3
"""
OSCILLA Apply Cue - Reads cue from temp file and applies to selection.
This is called by the Smart Cues editor via Inkscape's action system.

The workflow:
1. Smart Cues editor writes cue to /tmp/oscilla_cue.txt
2. User triggers this extension via keyboard shortcut (e.g., Ctrl+Shift+Q)
3. Extension reads the file and applies the cue

Supports append mode: if cue starts with "APPEND:", it appends to existing ID.
"""

import inkex
import os

TEMP_FILE = "/tmp/oscilla_cue.txt"


class OscillaApplyCue(inkex.EffectExtension):
    """Apply cue from temp file to selected elements."""
    
    def effect(self):
        # Read cue from temp file
        if not os.path.exists(TEMP_FILE):
            inkex.errormsg("No cue queued. Use the OSCILLA Smart Cues editor first.")
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
        
        # Check for append mode
        append_mode = False
        if cue.startswith("APPEND:"):
            append_mode = True
            cue = cue[7:]  # Remove "APPEND:" prefix
        
        # Apply to selection
        if not self.svg.selection:
            inkex.errormsg("No elements selected in Inkscape.")
            return
        
        count = 0
        for elem in self.svg.selection.values():
            if append_mode:
                current_id = elem.get("id", "")
                if current_id:
                    new_id = f"{current_id} {cue}"
                else:
                    new_id = cue
            else:
                new_id = cue
            
            elem.set("id", new_id)
            count += 1
        
        # Clear the temp file
        try:
            os.remove(TEMP_FILE)
        except:
            pass


if __name__ == "__main__":
    OscillaApplyCue().run()
