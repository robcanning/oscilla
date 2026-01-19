#!/bin/bash
# OSCILLA Inkscape Extension Installer

set -e

echo "OSCILLA Inkscape Extension Installer"
echo "====================================="
echo ""

# Detect OS and set extensions path
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    EXT_PATH="$HOME/.config/inkscape/extensions"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    EXT_PATH="$HOME/Library/Application Support/org.inkscape.Inkscape/config/inkscape/extensions"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    EXT_PATH="$APPDATA/inkscape/extensions"
else
    echo "Unknown OS: $OSTYPE"
    echo "Please manually copy files to your Inkscape extensions folder."
    exit 1
fi

echo "Detected OS: $OSTYPE"
echo "Extensions path: $EXT_PATH"
echo ""

mkdir -p "$EXT_PATH"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Installing OSCILLA Smart Cues Editor..."

cp "$SCRIPT_DIR/oscilla_smart_cues_gtk.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_smart_cues_launcher.inx" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_smart_cues_launcher.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_apply_cue.inx" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_apply_cue.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_presets.json" "$EXT_PATH/"

echo ""
echo "✅ Installation complete!"
echo ""
echo "Restart Inkscape, then find:"
echo "  Extensions → OSCILLA → OSCILLA Smart Cues Editor"
echo ""
echo "TIP: Bind 'Apply Queued Cue' to a keyboard shortcut (e.g., Ctrl+Shift+Q)"
echo "     Edit → Preferences → Interface → Keyboard → search 'Apply Queued'"
