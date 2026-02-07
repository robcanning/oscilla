#!/bin/bash

# Oscilla Kompot Build Script
# Builds landing page + docs and deploys to kompot.si

set -e

echo "🎵 Building Oscilla for kompot.si..."

# Ensure we're in the right directory
if [ ! -f ".eleventy.kompot.js" ]; then
    echo "❌ Error: .eleventy.kompot.js not found. Run this from the docs/ directory."
    exit 1
fi

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf ../../kompot_docs

# Build with Eleventy
echo "📦 Building with Eleventy..."
npx @11ty/eleventy --config .eleventy.kompot.js

# Verify build output
if [ ! -d "../../kompot_docs" ]; then
    echo "❌ Error: Build failed, output directory not found."
    exit 1
fi

# Check if we should deploy
if [ "$1" == "--deploy" ]; then
    echo "🚀 Deploying to kompot.si..."
    rsync -avz --delete ../../kompot_docs/* rob@kompot.si:/home/rob/oscilla-doc/
    echo "✅ Deployed successfully!"
    echo "🌐 Visit: https://oscilla.kompot.si"
else
    echo "✅ Build complete!"
    echo "📂 Output: ../../kompot_docs/"
    echo ""
    echo "To deploy, run:"
    echo "  ./build_docs_kompot.sh --deploy"
fi
