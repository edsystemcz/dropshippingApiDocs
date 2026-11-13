// Kontrastní poměr barev podle WCAG 2: text v barvě akcentu musí mít
// na svém pozadí aspoň MIN_CONTRAST (ZADANI část 12).
//
// Barva je pole [r, g, b, průhlednost] s kanály 0–255 a průhledností 0–1.
// scripts/verify-browser.mjs předává funkce do prohlížeče jako text, proto
// každá smí používat jen své parametry a funkce z tohoto souboru pod stejným
// názvem, nic dalšího z okolí.

/** Nejmenší kontrast textu vůči pozadí, úroveň AA pro běžný text. */
export const MIN_CONTRAST = 4.5;

/** Barva `top` položená na neprůhlednou barvu `bottom`; výsledek je neprůhledný. */
export const composite = (top, bottom) => [...top.slice(0, 3).map((channel, i) => top[3] * channel + (1 - top[3]) * bottom[i]), 1];

/** Relativní jas barvy podle WCAG 2 (průhlednost se nebere v úvahu). */
export const relativeLuminance = (color) => {
  const [r, g, b] = color.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Kontrastní poměr dvou neprůhledných barev, od 1 do 21. */
export const contrastRatio = (foreground, background) => {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};
