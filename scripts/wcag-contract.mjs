const CONTRAST_PAIRS = Object.freeze([
  ["foreground", "background"],
  ["muted-foreground", "background"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive", "background"],
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

function contrastRatio(first, second) {
  const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
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
