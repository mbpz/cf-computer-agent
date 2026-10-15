const CONTRAST_PAIRS = Object.freeze([
  ["foreground", "background"],
  ["muted-foreground", "background"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive", "background"],
]);

// Pairs the public landing page actually renders: body copy, muted copy, its primary
// button label and its accented surfaces.
const LANDING_CONTRAST_PAIRS = Object.freeze([
  ["foreground", "background"],
  ["muted-foreground", "background"],
  ["primary-foreground", "primary"],
  ["accent-foreground", "accent"],
]);

function parseTheme(css, selector) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "u"));
  if (!match) throw new Error(`Missing ${selector} theme`);
  const tokens = new Map();
  for (const declaration of match[1].matchAll(/--([\w-]+)\s*:\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/gu)) tokens.set(declaration[1], [Number(declaration[2]), Number(declaration[3]), Number(declaration[4])]);
  return tokens;
}

function oklchToSrgb([lightness, chroma, hue]) {
  const radians = hue * Math.PI / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return channels.map((channel) => {
    const clipped = Math.max(0, Math.min(1, channel));
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
  });
}

/**
 * WCAG relative luminance. The sRGB channels must be linearised first: reading the
 * gamma-encoded values understates every ratio, which made the landing palette look
 * like it failed five pairs that actually clear 4.5:1.
 */
function contrastRatio(first, second) {
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

export function assertWcagCss(css) {
  const light = parseTheme(css, ":root");
  const dark = parseTheme(css, ".dark");
  for (const [foreground, background] of CONTRAST_PAIRS) {
    for (const [name, theme] of [["light", light], ["dark", dark]]) {
      const foregroundValue = theme.get(foreground);
      const backgroundValue = theme.get(background);
      if (!foregroundValue || !backgroundValue || contrastRatio(oklchToSrgb(foregroundValue), oklchToSrgb(backgroundValue)) < 4.5) throw new Error(`WCAG AA contrast failed: ${name} ${foreground}/${background}`);
    }
  }
  if (!/:focus-visible\s*\{[^}]*outline\s*:\s*2px\s+solid\s+var\(--ring\)[^}]*outline-offset\s*:\s*2px/us.test(css)) throw new Error("Missing visible 2px focus ring");
  return { light: true, dark: true, focusVisible: true };
}

/**
 * The public landing page carries its own warm palette. Verify it with the same rule,
 * so those tokens cannot quietly sit outside the contrast contract again.
 */
export function assertLandingWcagCss(css) {
  const themes = [["light", parseTheme(css, ".workbench-landing")], ["dark", parseTheme(css, ".dark .workbench-landing")]];
  for (const [name, theme] of themes) {
    for (const [foreground, background] of LANDING_CONTRAST_PAIRS) {
      const foregroundValue = theme.get(foreground);
      const backgroundValue = theme.get(background);
      if (!foregroundValue || !backgroundValue || contrastRatio(oklchToSrgb(foregroundValue), oklchToSrgb(backgroundValue)) < 4.5) throw new Error(`Landing WCAG AA contrast failed: ${name} ${foreground}/${background}`);
    }
  }
  return { light: true, dark: true };
}
