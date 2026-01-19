#!/bin/bash
# OSCILLA Inkscape Extension Installer
# Automatically detects OS and installs to correct location

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

# Create directory if it doesn't exist
mkdir -p "$EXT_PATH"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Copy files
echo "Installing extensions..."

cp "$SCRIPT_DIR/oscilla_cues.inx" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_cues.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_quick_cues.inx" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_quick_cues.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_inspector.inx" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_inspector.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_toolbar.inx" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_toolbar.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_toolbar_standalone.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_apply_cue.inx" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_apply_cue.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_smart_cues.inx" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_smart_cues.py" "$EXT_PATH/"
cp "$SCRIPT_DIR/oscilla_presets.json" "$EXT_PATH/"

# Install quick-apply extensions if they exist
if [ -d "$SCRIPT_DIR/quick-apply" ]; then
    echo "Installing quick-apply extensions..."
    cp "$SCRIPT_DIR/quick-apply/"*.inx "$EXT_PATH/"
    cp "$SCRIPT_DIR/quick-apply/"*.py "$EXT_PATH/"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "Files installed:"
ls -la "$EXT_PATH"/oscilla*.{inx,py} 2>/dev/null || true
echo ""
echo "Please restart Inkscape to use the extensions."
echo "Find them under: Extensions → OSCILLA"
