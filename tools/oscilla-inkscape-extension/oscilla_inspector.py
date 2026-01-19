#!/usr/bin/env python3
"""
OSCILLA Cue Inspector - Inkscape Extension
Inspect, validate, and manage OSCILLA cues in SVG documents

Author: Generated for OSCILLA project
Version: 1.0.0
"""

import re
import inkex
from inkex import EffectExtension


class OscillaCueInspector(EffectExtension):
    """Inkscape extension for inspecting and managing OSCILLA cues."""

    # Known OSCILLA cue types
    CUE_TYPES = [
        "stop", "pause", "speed", "nav", "page", "stopwatch", "metro",
        "scale", "scaleXY", "rotate", "o2p",
        "color", "fade", "text",
        "audio", "audioPool", "audioImpulse",
        "video", "synth", "synthStop",
        "osc", "oscCtrl",
        "button", "reuse", "use", "propagate"
    ]
    
    # Pattern to match OSCILLA cues
    CUE_PATTERN = re.compile(
        r'(' + '|'.join(CUE_TYPES) + r')\s*\([^)]*\)',
        re.IGNORECASE
    )

    def add_arguments(self, pars):
        """Define extension parameters."""
        pars.add_argument("--action", type=str, default="inspect")
        pars.add_argument("--batch_action", type=str, default="none")
        pars.add_argument("--batch_value", type=str, default="")
        pars.add_argument("--batch_replace", type=str, default="")

    def is_oscilla_cue(self, element_id):
        """Check if an ID contains an OSCILLA cue."""
        if not element_id:
            return False
        return bool(self.CUE_PATTERN.search(element_id))

    def extract_cue_info(self, element_id):
        """Extract cue type and parameters from an ID."""
        matches = self.CUE_PATTERN.findall(element_id)
        if matches:
            return matches
        return []

    def extract_uids(self, element_id):
        """Extract all uid values from a cue string."""
        uid_pattern = re.compile(r'uid:(\w+)')
        return uid_pattern.findall(element_id)

    def validate_cue(self, element_id):
        """Validate cue syntax and return issues."""
        issues = []
        
        if not element_id:
            return ["Empty ID"]
        
        # Check for unmatched parentheses
        open_parens = element_id.count('(')
        close_parens = element_id.count(')')
        if open_parens != close_parens:
            issues.append(f"Mismatched parentheses: {open_parens} open, {close_parens} close")
        
        # Check for unmatched brackets
        open_brackets = element_id.count('[')
        close_brackets = element_id.count(']')
        if open_brackets != close_brackets:
            issues.append(f"Mismatched brackets: {open_brackets} open, {close_brackets} close")
        
        # Check for known cue types
        if not self.is_oscilla_cue(element_id):
            # It might be a simple ID, which is fine
            if re.match(r'^[\w\-]+$', element_id):
                return []  # Simple ID is valid
            issues.append("No recognized OSCILLA cue found")
        
        # Check for common syntax errors
        if ':,' in element_id:
            issues.append("Empty parameter value found (':')")
        
        if ',)' in element_id:
            issues.append("Trailing comma before closing parenthesis")
        
        return issues

    def get_all_cues(self):
        """Get all elements with OSCILLA cues in the document."""
        cues = []
        
        def walk_tree(element):
            elem_id = element.get("id", "")
            if self.is_oscilla_cue(elem_id):
                tag_name = element.tag.split('}')[-1] if '}' in element.tag else element.tag
                cues.append({
                    "element": element,
                    "id": elem_id,
                    "tag": tag_name,
                    "cue_types": self.extract_cue_info(elem_id)
                })
            for child in element:
                walk_tree(child)
        
        walk_tree(self.svg)
        return cues

    def effect(self):
        """Execute the inspector action."""
        opts = self.options
        action = opts.action
        batch_action = opts.batch_action
        
        # Handle batch actions first
        if batch_action != "none":
            self.handle_batch_action(batch_action, opts.batch_value, opts.batch_replace)
            return
        
        # Handle individual actions
        if action == "inspect":
            self.inspect_selected()
        elif action == "clear":
            self.clear_selected()
        elif action == "copy":
            self.copy_cue()
        elif action == "list_all":
            self.list_all_cues()
        elif action == "validate":
            self.validate_selected()
        elif action == "extract_uid":
            self.extract_selected_uids()

    def inspect_selected(self):
        """Inspect cues on selected elements."""
        if not self.svg.selection:
            inkex.errormsg("Please select at least one element.")
            return
        
        output = []
        for elem in self.svg.selection.values():
            elem_id = elem.get("id", "")
            tag_name = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            
            output.append(f"Element: <{tag_name}>")
            output.append(f"  ID: {elem_id}")
            
            if self.is_oscilla_cue(elem_id):
                output.append("  Type: OSCILLA Cue")
                cue_types = self.extract_cue_info(elem_id)
                output.append(f"  Cue Functions: {', '.join(cue_types)}")
                
                uids = self.extract_uids(elem_id)
                if uids:
                    output.append(f"  UIDs: {', '.join(uids)}")
            else:
                output.append("  Type: Standard ID (no cue)")
            
            output.append("")
        
        inkex.errormsg("\n".join(output))

    def clear_selected(self):
        """Clear cues from selected elements."""
        if not self.svg.selection:
            inkex.errormsg("Please select at least one element.")
            return
        
        count = 0
        for elem in self.svg.selection.values():
            # Generate a simple unique ID
            new_id = f"elem_{abs(hash(elem)) % 100000}"
            elem.set("id", new_id)
            count += 1
        
        inkex.errormsg(f"Cleared {count} element(s). New IDs assigned.")

    def copy_cue(self):
        """Display cue string for copying."""
        if not self.svg.selection:
            inkex.errormsg("Please select at least one element.")
            return
        
        cues = []
        for elem in self.svg.selection.values():
            elem_id = elem.get("id", "")
            if elem_id:
                cues.append(elem_id)
        
        if cues:
            inkex.errormsg("Cue string(s) (copy from here):\n\n" + "\n\n".join(cues))
        else:
            inkex.errormsg("No cues found on selected elements.")

    def list_all_cues(self):
        """List all OSCILLA cues in the document."""
        cues = self.get_all_cues()
        
        if not cues:
            inkex.errormsg("No OSCILLA cues found in document.")
            return
        
        output = [f"Found {len(cues)} OSCILLA cue(s) in document:\n"]
        
        # Group by cue type
        by_type = {}
        for cue in cues:
            for cue_type in cue["cue_types"]:
                if cue_type not in by_type:
                    by_type[cue_type] = []
                by_type[cue_type].append(cue)
        
        for cue_type, items in sorted(by_type.items()):
            output.append(f"\n{cue_type.upper()} ({len(items)}):")
            for item in items[:10]:  # Limit to 10 per type
                output.append(f"  <{item['tag']}> {item['id'][:60]}...")
            if len(items) > 10:
                output.append(f"  ... and {len(items) - 10} more")
        
        inkex.errormsg("\n".join(output))

    def validate_selected(self):
        """Validate cue syntax on selected elements."""
        if not self.svg.selection:
            inkex.errormsg("Please select at least one element.")
            return
        
        output = []
        has_errors = False
        
        for elem in self.svg.selection.values():
            elem_id = elem.get("id", "")
            issues = self.validate_cue(elem_id)
            
            if issues:
                has_errors = True
                output.append(f"❌ ID: {elem_id[:50]}...")
                for issue in issues:
                    output.append(f"   • {issue}")
                output.append("")
            else:
                output.append(f"✅ ID: {elem_id[:50]}... - Valid")
        
        if has_errors:
            inkex.errormsg("Validation Results:\n\n" + "\n".join(output))
        else:
            inkex.errormsg("✅ All selected elements have valid cue syntax!")

    def extract_selected_uids(self):
        """Extract all UIDs from selected elements."""
        if not self.svg.selection:
            inkex.errormsg("Please select at least one element.")
            return
        
        all_uids = []
        for elem in self.svg.selection.values():
            elem_id = elem.get("id", "")
            uids = self.extract_uids(elem_id)
            all_uids.extend(uids)
        
        if all_uids:
            unique_uids = sorted(set(all_uids))
            inkex.errormsg(f"Found {len(unique_uids)} unique UID(s):\n\n" + "\n".join(unique_uids))
        else:
            inkex.errormsg("No UIDs found in selected elements.")

    def handle_batch_action(self, action, value, replace):
        """Handle batch operations on cues."""
        cues = self.get_all_cues()
        
        if not cues:
            inkex.errormsg("No OSCILLA cues found in document.")
            return
        
        if action == "prefix_uid":
            if not value:
                inkex.errormsg("Please provide a prefix value.")
                return
            
            count = 0
            for cue in cues:
                elem = cue["element"]
                elem_id = elem.get("id", "")
                
                # Add prefix to existing UIDs
                new_id = re.sub(r'uid:(\w+)', f'uid:{value}_\\1', elem_id)
                if new_id != elem_id:
                    elem.set("id", new_id)
                    count += 1
            
            inkex.errormsg(f"Added prefix '{value}_' to {count} UID(s).")
        
        elif action == "clear_all":
            count = 0
            for cue in cues:
                elem = cue["element"]
                new_id = f"elem_{abs(hash(elem)) % 100000}"
                elem.set("id", new_id)
                count += 1
            
            inkex.errormsg(f"Cleared {count} OSCILLA cue(s).")
        
        elif action == "find_replace":
            if not value:
                inkex.errormsg("Please provide a search value.")
                return
            
            count = 0
            for cue in cues:
                elem = cue["element"]
                elem_id = elem.get("id", "")
                
                if value in elem_id:
                    new_id = elem_id.replace(value, replace)
                    elem.set("id", new_id)
                    count += 1
            
            inkex.errormsg(f"Replaced '{value}' with '{replace}' in {count} cue(s).")


if __name__ == "__main__":
    OscillaCueInspector().run()
