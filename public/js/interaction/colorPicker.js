// public/js/oscillaColorPicker.js
//
// Reusable color picker component for Oscilla
// - Preset color swatches (pale colors for score readability)
// - Custom color picker fallback
// - Returns hex color values
//
// Usage:
//   import { createColorPicker, MARKER_COLORS } from "./oscillaColorPicker.js";
//   const picker = createColorPicker({
//       currentColor: "#ff6464",
//       onChange: (color) => console.log("Selected:", color)
//   });
//   container.appendChild(picker);

// =============================================================
// PRESET COLORS
// =============================================================

// Marker preset colors - pale/pastel for score readability
export const MARKER_COLORS = {
    paleRed:    { hex: "#ff9999", label: "Red" },
    paleBlue:   { hex: "#99c2ff", label: "Blue" },
    paleGreen:  { hex: "#99e699", label: "Green" },
    paleYellow: { hex: "#ffeb99", label: "Yellow" },
    palePurple: { hex: "#d9b3ff", label: "Purple" },
    paleOrange: { hex: "#ffcc99", label: "Orange" },
};

// Default marker color (used when no color specified)
export const DEFAULT_MARKER_COLOR = MARKER_COLORS.paleRed.hex;

// Get an array of preset colors for iteration
export function getPresetColors() {
    return Object.values(MARKER_COLORS);
}

// =============================================================
// COLOR UTILITIES
// =============================================================

/**
 * Convert hex to RGB object
 */
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => {
        const hex = Math.round(x).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }).join("");
}

/**
 * Get a slightly darker version of a color (for borders/hover)
 */
export function darkenColor(hex, amount = 0.2) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(
        rgb.r * (1 - amount),
        rgb.g * (1 - amount),
        rgb.b * (1 - amount)
    );
}

/**
 * Get a lighter version of a color
 */
export function lightenColor(hex, amount = 0.2) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(
        rgb.r + (255 - rgb.r) * amount,
        rgb.g + (255 - rgb.g) * amount,
        rgb.b + (255 - rgb.b) * amount
    );
}

/**
 * Determine if a color is light or dark (for text contrast)
 */
export function isLightColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return true;
    // Using relative luminance formula
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5;
}

/**
 * Get appropriate text color (black or white) for a background
 */
export function getContrastTextColor(bgHex) {
    return isLightColor(bgHex) ? "#000000" : "#ffffff";
}

// =============================================================
// COLOR PICKER COMPONENT
// =============================================================

/**
 * Create a color picker element
 * @param {Object} options
 * @param {string} options.currentColor - Current selected color (hex)
 * @param {Function} options.onChange - Callback when color changes
 * @param {boolean} options.showCustom - Show custom color picker (default: true)
 * @param {Array} options.presets - Custom preset array (default: MARKER_COLORS values)
 * @returns {HTMLElement} The color picker container element
 */
export function createColorPicker(options = {}) {
    const {
        currentColor = DEFAULT_MARKER_COLOR,
        onChange = () => {},
        showCustom = true,
        presets = getPresetColors()
    } = options;

    const container = document.createElement("div");
    container.className = "osc-color-picker";

    // Label
    const label = document.createElement("div");
    label.className = "osc-color-picker-label";
    label.textContent = "Color";
    container.appendChild(label);

    // Swatches container
    const swatchesRow = document.createElement("div");
    swatchesRow.className = "osc-color-picker-swatches";

    // Track selected swatch
    let selectedSwatch = null;

    // Create preset swatches
    presets.forEach(preset => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "osc-color-swatch";
        swatch.style.backgroundColor = preset.hex;
        swatch.title = preset.label;
        swatch.dataset.color = preset.hex;

        // Mark as selected if matches current
        if (preset.hex.toLowerCase() === currentColor.toLowerCase()) {
            swatch.classList.add("selected");
            selectedSwatch = swatch;
        }

        swatch.addEventListener("click", () => {
            // Update selection
            if (selectedSwatch) {
                selectedSwatch.classList.remove("selected");
            }
            swatch.classList.add("selected");
            selectedSwatch = swatch;

            // Clear custom picker selection if exists
            const customInput = container.querySelector(".osc-color-custom-input");
            if (customInput) {
                customInput.classList.remove("selected");
            }

            onChange(preset.hex);
        });

        swatchesRow.appendChild(swatch);
    });

    // Custom color picker
    if (showCustom) {
        const customWrapper = document.createElement("div");
        customWrapper.className = "osc-color-custom-wrapper";

        const customInput = document.createElement("input");
        customInput.type = "color";
        customInput.className = "osc-color-custom-input";
        customInput.value = currentColor;
        customInput.title = "Custom color";

        // Check if current color is not a preset
        const isCustomColor = !presets.some(p => 
            p.hex.toLowerCase() === currentColor.toLowerCase()
        );
        if (isCustomColor) {
            customInput.classList.add("selected");
            if (selectedSwatch) {
                selectedSwatch.classList.remove("selected");
                selectedSwatch = null;
            }
        }

        customInput.addEventListener("input", (e) => {
            // Deselect preset swatches
            if (selectedSwatch) {
                selectedSwatch.classList.remove("selected");
                selectedSwatch = null;
            }
            customInput.classList.add("selected");
            onChange(e.target.value);
        });

        customWrapper.appendChild(customInput);
        swatchesRow.appendChild(customWrapper);
    }

    container.appendChild(swatchesRow);

    // Add method to programmatically set color
    container.setColor = (hex) => {
        // Try to find matching preset
        const matchingSwatch = swatchesRow.querySelector(
            `.osc-color-swatch[data-color="${hex.toLowerCase()}"]`
        );

        if (matchingSwatch) {
            if (selectedSwatch) selectedSwatch.classList.remove("selected");
            matchingSwatch.classList.add("selected");
            selectedSwatch = matchingSwatch;
            
            const customInput = container.querySelector(".osc-color-custom-input");
            if (customInput) customInput.classList.remove("selected");
        } else {
            // It's a custom color
            if (selectedSwatch) selectedSwatch.classList.remove("selected");
            selectedSwatch = null;
            
            const customInput = container.querySelector(".osc-color-custom-input");
            if (customInput) {
                customInput.value = hex;
                customInput.classList.add("selected");
            }
        }
    };

    // Add method to get current color
    container.getColor = () => {
        if (selectedSwatch) {
            return selectedSwatch.dataset.color;
        }
        const customInput = container.querySelector(".osc-color-custom-input");
        return customInput?.value || currentColor;
    };

    return container;
}

// =============================================================
// INLINE STYLE HELPERS
// =============================================================

/**
 * Generate CSS custom properties for a marker color
 * Use these on marker elements for consistent coloring
 */
export function getMarkerColorStyles(hex) {
    const darkerHex = darkenColor(hex, 0.15);
    const textColor = getContrastTextColor(hex);
    
    return {
        "--marker-color": hex,
        "--marker-color-dark": darkerHex,
        "--marker-text-color": textColor,
        "--marker-color-alpha": hex + "cc",  // 80% opacity
        "--marker-color-line": hex + "80",   // 50% opacity for line
    };
}

/**
 * Apply marker color styles to an element
 */
export function applyMarkerColor(element, hex) {
    const styles = getMarkerColorStyles(hex);
    Object.entries(styles).forEach(([prop, value]) => {
        element.style.setProperty(prop, value);
    });
}

export default {
    MARKER_COLORS,
    DEFAULT_MARKER_COLOR,
    getPresetColors,
    createColorPicker,
    hexToRgb,
    rgbToHex,
    darkenColor,
    lightenColor,
    isLightColor,
    getContrastTextColor,
    getMarkerColorStyles,
    applyMarkerColor,
};
