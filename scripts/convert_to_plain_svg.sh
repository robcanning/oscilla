#!/bin/bash

# Ensure Inkscape is installed
if ! command -v inkscape &> /dev/null; then
  echo "Error: Inkscape is not installed. Please install it to proceed."
  exit 1
fi

# Check if the input file is provided
if [ $# -eq 0 ]; then
  echo "Usage: $0 <input_file>"
  exit 1
fi

INPUT_FILE=$1
OUTPUT_FILE=$2


# Ensure the output directory exists
mkdir -p "$OUTPUT_DIR"

# Convert the file to plain SVG
echo "Converting $INPUT_FILE to plain SVG..."
inkscape --export-plain-svg="$OUTPUT_FILE" "$INPUT_FILE"

if [ $? -eq 0 ]; then
  echo "Conversion successful. File saved as: $OUTPUT_FILE"
else
  echo "Error during conversion."
  exit 1
fi
