/* Centralized design tokens — palette, mood gradients, typography, and spacing constants.
   Single source of truth so every screen speaks the same visual language. */

/** Converts a `#rrggbb` hex color to `rgba(r,g,b,alpha)`. Throws on invalid input. */
export function hexToRgba(hex: string, alpha: number): string {
  const result = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`hexToRgba: invalid hex color "${hex}"`);
  return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`;
}

/**
 * Returns true if a hex color is perceived as "light" — used to flip status bar style.
 * Threshold 0.55 keeps electric (#e724ab, lum ≈ 0.43) as "dark" while chill (#c084fc, lum ≈ 0.64) flips to "light".
 */
export function isHexLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55;
}

export const COLORS = {
  background: '#f8f5ff',
  surface: '#ffffff',
  surfaceLight: '#f0ebf5',
  surfaceMuted: 'rgba(255,255,255,0.7)',
  primary: '#e724ab',
  primaryMuted: 'rgba(231,36,171,0.12)',
  secondary: '#d479ec',
  dark: '#4b164c',
  darkMuted: 'rgba(75,22,76,0.5)',
  textPrimary: '#4b164c',
  textSecondary: 'rgba(75,22,76,0.55)',
  textTertiary: 'rgba(75,22,76,0.3)',
  border: 'rgba(75,22,76,0.08)',
  borderLight: 'rgba(75,22,76,0.04)',
} as const;

export const THEME_GRADIENTS = {
  sunset: {
    colors: ['#fbbf24', '#f59e0b', '#4b164c'] as const,
    ringColor: '#fbbf24',
    glowColor: '#fbbf24',
    accent: '#f59e0b',
    // Tonal: amber light → amber saturated. Stays in the warm family of the background.
    ctaGradient: ['#fbbf24', '#f59e0b'] as const,
  },
  chill: {
    colors: ['#c084fc', '#8b5cf6', '#4b164c'] as const,
    ringColor: '#d479ec',
    glowColor: '#a78bfa',
    accent: '#c084fc',
    // Tonal: lavender → violet. Cool family aligned with the cool background.
    ctaGradient: ['#d479ec', '#a78bfa'] as const,
  },
  electric: {
    colors: ['#e724ab', '#9333ea', '#4b164c'] as const,
    ringColor: '#e724ab',
    glowColor: '#e724ab',
    accent: '#e724ab',
    // Tonal: pink pop → electric violet. Same family as the saturated background.
    ctaGradient: ['#f472b6', '#9333ea'] as const,
  },
  midnight: {
    colors: ['#374151', '#1f2937', '#1a0a1b'] as const,
    ringColor: '#9ca3af',
    glowColor: '#6b7280',
    accent: '#9ca3af',
    // Exception: brand magenta — tonal grey on dark grey background would be invisible.
    ctaGradient: ['#e724ab', '#d479ec'] as const,
  },
} as const;

export const CTA_GRADIENT = ['#e724ab', '#d479ec'] as const;
export const ONBOARDING_GRADIENT = ['#f8f5ff', '#edf2fc', '#f0e8f8'] as const;

export const FONT = {
  light: 'Outfit_300Light',
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  extrabold: 'Outfit_800ExtraBold',
  serifRegular: 'PlayfairDisplay_400Regular',
  serifItalic: 'PlayfairDisplay_400Regular_Italic',
  serifMedium: 'PlayfairDisplay_500Medium',
  serifSemibold: 'PlayfairDisplay_600SemiBold',
  serifBold: 'PlayfairDisplay_700Bold',
  serifBlack: 'PlayfairDisplay_900Black',
} as const;

export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
  // Usage-oriented aliases — prefer these in components over bare numbers.
  cta: 999,    // pill buttons (CTAs, nav capsules, pills)
  modal: 24,   // modal cards and overlay popup containers
  input: 16,   // text inputs and inline info boxes
} as const;

export const SHADOW = {
  card: {
    shadowColor: '#4b164c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  button: {
    shadowColor: '#e724ab',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  // Darker shadow gives the play button physical depth on saturated backgrounds.
  play: {
    shadowColor: '#1a0a1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;
