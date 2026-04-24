/* Centralized design tokens — palette, mood gradients, typography, and spacing constants.
   Single source of truth so every screen speaks the same visual language. */

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
    colors: ['#f59e0b', '#ea580c', '#4b164c'] as const,
    ringColor: '#fbbf24',
    glowColor: '#fbbf24',
    accent: '#f59e0b',
    // Violet → magenta: complementary to orange, brand-adjacent
    ctaGradient: ['#7c3aed', '#e724ab'] as const,
  },
  chill: {
    colors: ['#c084fc', '#8b5cf6', '#4b164c'] as const,
    ringColor: '#d479ec',
    glowColor: '#a78bfa',
    accent: '#c084fc',
    // Magenta → amber: warm contrast on cool purple background
    ctaGradient: ['#e724ab', '#ea580c'] as const,
  },
  electric: {
    colors: ['#e724ab', '#9333ea', '#4b164c'] as const,
    ringColor: '#e724ab',
    glowColor: '#e724ab',
    accent: '#e724ab',
    // Indigo → violet: steps back in the spectrum, readable on magenta
    ctaGradient: ['#4f46e5', '#7c3aed'] as const,
  },
  midnight: {
    colors: ['#374151', '#1f2937', '#1a0a1b'] as const,
    ringColor: '#9ca3af',
    glowColor: '#6b7280',
    accent: '#9ca3af',
    // Brand CTA: pops on dark, no change needed
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
} as const;
