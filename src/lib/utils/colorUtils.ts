/**
 * Convert hex color to RGB components (0-1 range)
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse hex values
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    return { r, g, b };
}

/**
 * Convert RGB (0-1) to hex string
 */
export function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (c: number) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Lighten a color by a factor (0-1)
 */
export function lighten(hex: string, factor: number): string {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r + (1 - r) * factor, g + (1 - g) * factor, b + (1 - b) * factor);
}

/**
 * Darken a color by a factor (0-1)
 */
export function darken(hex: string, factor: number): string {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}
