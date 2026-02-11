#!/bin/bash

# Oscilla Kompot.si Master Build Script
# Builds landing page + documentation in correct order

set -e  # Exit on error

echo "════════════════════════════════════════"
echo "  Building Oscilla for kompot.si"
echo "════════════════════════════════════════"
echo ""

# Check we're in the right directory
if [ ! -f ".eleventy.landing.js" ]; then
    echo "❌ Error: Must run from public/docs/ directory"
    echo "   (looking for .eleventy.landing.js)"
    exit 1
fi

# Your docs config has a leading dot
DOCS_CONFIG=".eleventy.kompot.js"
if [ ! -f "$DOCS_CONFIG" ]; then
    echo "❌ Error: $DOCS_CONFIG not found"
    exit 1
fi

# Output directory - matching your docs config (../../kompot_docs)
OUTPUT_DIR="../../kompot_docs"

echo "🧹 Cleaning previous build..."
rm -rf "$OUTPUT_DIR"
echo "   ✓ Cleaned"
echo ""

# Build landing page first (goes to root)
echo " Building landing page..."
npx @11ty/eleventy --config .eleventy.landing.js --quiet
if [ ! -f "$OUTPUT_DIR/index.html" ]; then
    echo "   ❌ Landing page build failed - index.html not found"
    echo "   Looking in: $OUTPUT_DIR/"
    ls -la "$OUTPUT_DIR/" 2>/dev/null || echo "   (directory doesn't exist)"
    exit 1
fi
echo "   ✓ Landing page built → $OUTPUT_DIR/"
echo ""

# Build documentation (goes to /docs/)
echo " Building documentation..."
npx @11ty/eleventy --config "$DOCS_CONFIG" --quiet
if [ ! -d "$OUTPUT_DIR/docs" ]; then
    echo "   ❌ Documentation build failed - docs/ not found"
    echo "   Looking in: $OUTPUT_DIR/docs/"
    ls -la "$OUTPUT_DIR/" 2>/dev/null || echo "   (directory doesn't exist)"
    exit 1
fi
echo "   ✓ Documentation built → $OUTPUT_DIR/docs/"
echo ""

# Verify critical files exist
echo " Verifying build..."
ERRORS=0
WARNINGS=0

if [ ! -f "$OUTPUT_DIR/index.html" ]; then
    echo "    Missing: index.html"
    ERRORS=$((ERRORS + 1))
else
    echo "    index.html"
fi

if [ ! -f "$OUTPUT_DIR/landing.css" ]; then
    echo "    Missing: landing.css"
    ERRORS=$((ERRORS + 1))
else
    echo "    landing.css"
fi

if [ ! -f "$OUTPUT_DIR/logo-icon.png" ]; then
    echo "    Missing: logo-icon.png"
    ERRORS=$((ERRORS + 1))
else
    echo "    logo-icon.png"
fi

if [ ! -d "$OUTPUT_DIR/builds" ]; then
    echo "     builds/ directory not found (check ../../dist/ has binaries)"
    WARNINGS=$((WARNINGS + 1))
else
    BUILD_COUNT=$(ls -1 "$OUTPUT_DIR/builds/" 2>/dev/null | wc -l)
    if [ $BUILD_COUNT -eq 0 ]; then
        echo "     builds/ is empty (check ../../dist/ has binaries)"
        WARNINGS=$((WARNINGS + 1))
    else
        echo "    builds/ ($BUILD_COUNT files)"
    fi
fi

if [ ! -f "$OUTPUT_DIR/docs/index.html" ]; then
    echo "    Missing: docs/index.html"
    ERRORS=$((ERRORS + 1))
else
    echo "    docs/index.html"
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo " Build completed with $ERRORS error(s)"
    exit 1
fi

if [ $WARNINGS -gt 0 ]; then
    echo ""
    echo "  Build completed with $WARNINGS warning(s)"
fi

echo ""

# Show structure
echo "Build output structure:"
echo ""
echo "   $OUTPUT_DIR/"
echo "   ├── index.html           ← Landing page"
echo "   ├── landing.css"
echo "   ├── logo-icon.png"
if [ -d "$OUTPUT_DIR/builds" ]; then
    echo "   ├── builds/              ← Binary downloads"
    ls "$OUTPUT_DIR/builds/" 2>/dev/null | head -4 | while read file; do
        echo "   │   └── $file"
    done
fi
echo "   └── docs/                ← Documentation"
echo "       ├── index.html"
echo "       └── ..."
echo ""

echo "════════════════════════════════════════"
echo " Build successful!"
echo "════════════════════════════════════════"
echo ""

# Deploy if requested
if [ "$1" == "--deploy" ] || [ "$1" == "-d" ]; then
    echo " Deploying to kompot.si..."
    echo ""
    
    # Show what will be deployed
    echo "   Files to deploy:"
    du -sh "$OUTPUT_DIR" 2>/dev/null || true
    echo ""
    
    # Confirm
    read -p "   Continue with deployment? (y/N) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "   Syncing to rob@kompot.si:/home/rob/oscilla-doc/"
        rsync -avz --delete "$OUTPUT_DIR"/* rob@kompot.si:/home/rob/oscilla-doc/
        echo ""
        echo "════════════════════════════════════════"
        echo " Deployed successfully!"
        echo "════════════════════════════════════════"
        echo ""
        echo " Landing page:   https://oscilla.kompot.si/"
        echo " Documentation:  https://oscilla.kompot.si/docs/"
        echo " Downloads:      https://oscilla.kompot.si/builds/"
        echo " Repository:     https://git.kompot.si/rob/oscilla"
        echo ""
    else
        echo "   Deployment cancelled."
        echo ""
    fi
else
    echo "Commands:"
    echo ""
    echo "  Deploy to kompot.si:"
    echo "    ./build_kompot.sh --deploy"
    echo ""
    echo "  Test locally:"
    echo "    cd $OUTPUT_DIR && python -m http.server 8080"
    echo "    Visit: http://localhost:8080"
    echo ""
fi
