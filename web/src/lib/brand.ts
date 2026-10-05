export const BRAND_PRESETS = {
  "ambar-rojo": { nombre: "Ámbar Rojo", primario: "#D7083F", acento: "#E91E8C" },
  salud: { nombre: "Salud", primario: "#0891B2", acento: "#10B981" },
  legal: { nombre: "Legal", primario: "#1E3A5F", acento: "#C59B45" },
  retail: { nombre: "Retail", primario: "#EA580C", acento: "#F59E0B" },
  inmobiliaria: { nombre: "Inmobiliaria", primario: "#166534", acento: "#65A30D" },
  belleza: { nombre: "Belleza", primario: "#BE185D", acento: "#A855F7" }
} as const;

export type BrandPreset = keyof typeof BRAND_PRESETS;
export type BrandConfig = {
  nombre: string;
  logo: string | null;
  colorPrimario: string;
  colorAcento: string;
  preset: BrandPreset;
};

export const DEFAULT_BRAND: BrandConfig = {
  nombre: BRAND_PRESETS["ambar-rojo"].nombre,
  logo: null,
  colorPrimario: BRAND_PRESETS["ambar-rojo"].primario,
  colorAcento: BRAND_PRESETS["ambar-rojo"].acento,
  preset: "ambar-rojo"
};

export function esColorHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function hexRgb(hex: string) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

export function hexAHsl(hex: string) {
  const [r0, g0, b0] = hexRgb(hex);
  const [r, g, b] = [r0 / 255, g0 / 255, b0 / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function luminancia(hex: string) {
  return hexRgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}

export function contraste(a: string, b: string) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

export function textoSobre(color: string) {
  return contraste(color, "#FFFFFF") >= contraste(color, "#151A24") ? "#FFFFFF" : "#151A24";
}

function varianteOscura(hex: string) {
  const hsl = hexAHsl(hex).match(/^(\d+) (\d+)% (\d+)%$/);
  if (!hsl) return hexAHsl(hex);
  return `${hsl[1]} ${Math.min(92, Number(hsl[2]) + 4)}% ${Math.max(58, Number(hsl[3]))}%`;
}

export function normalizarMarca(ajustes?: Partial<{
  marcaNombre: string | null;
  marcaLogo: string | null;
  marcaColorPrimario: string | null;
  marcaColorAcento: string | null;
  marcaPreset: string | null;
}> | null): BrandConfig {
  const preset = ajustes?.marcaPreset && ajustes.marcaPreset in BRAND_PRESETS
    ? ajustes.marcaPreset as BrandPreset
    : DEFAULT_BRAND.preset;
  const base = BRAND_PRESETS[preset];
  return {
    nombre: ajustes?.marcaNombre?.trim() || base.nombre,
    logo: ajustes?.marcaLogo || null,
    colorPrimario: esColorHex(ajustes?.marcaColorPrimario) ? ajustes.marcaColorPrimario : base.primario,
    colorAcento: esColorHex(ajustes?.marcaColorAcento) ? ajustes.marcaColorAcento : base.acento,
    preset
  };
}

export function variablesMarca(marca: BrandConfig): Record<string, string> {
  return {
    "--brand-primary-light": hexAHsl(marca.colorPrimario),
    "--brand-primary-dark": varianteOscura(marca.colorPrimario),
    "--brand-primary-foreground-light": hexAHsl(textoSobre(marca.colorPrimario)),
    "--brand-primary-foreground-dark": hexAHsl(textoSobre(marca.colorPrimario)),
    "--brand-accent-light": hexAHsl(marca.colorAcento),
    "--brand-accent-dark": varianteOscura(marca.colorAcento)
  };
}
