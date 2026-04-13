/* Centralized design tokens — palette, mood gradients, typography, and spacing constants.
   Single source of truth so every screen speaks the same visual language. */

export const COLORS = {
  background: '#FFF9F5',
  surface: '#ffffff',
  surfaceLight: '#FFF5EF',
  surfaceMuted: 'rgba(255,255,255,0.7)',
  primary: '#E7266A',
  primaryMuted: 'rgba(231,38,106,0.12)',
  secondary: '#C156D0',
  dark: '#2D1136',
  darkMuted: 'rgba(45,17,54,0.5)',
  textPrimary: '#2D1136',
  textSecondary: 'rgba(45,17,54,0.55)',
  textTertiary: 'rgba(45,17,54,0.3)',
  border: 'rgba(45,17,54,0.08)',
  borderLight: 'rgba(45,17,54,0.04)',
} as const;

export const THEME_GRADIENTS = {
  sunset: {
    colors: ['#FF8A3D', '#FF6B35', '#C9302C'] as const,
    ringColor: '#FFB347',
    glowColor: '#FF8A3D',
    accent: '#FF6B35',
  },
  chill: {
    colors: ['#667EEA', '#764BA2', '#3B235A'] as const,
    ringColor: '#8B9CF7',
    glowColor: '#667EEA',
    accent: '#667EEA',
  },
  electric: {
    colors: ['#F5515F', '#C9302C', '#5A1018'] as const,
    ringColor: '#FF7A85',
    glowColor: '#F5515F',
    accent: '#F5515F',
  },
  dream: {
    colors: ['#89CFF0', '#B8A9E8', '#C8A2C8'] as const,
    ringColor: '#A8DFFF',
    glowColor: '#89CFF0',
    accent: '#89CFF0',
  },
  midnight: {
    colors: ['#302B63', '#24243E', '#0F0C29'] as const,
    ringColor: '#6C63FF',
    glowColor: '#4A42B0',
    accent: '#6C63FF',
  },
} as const;

export const CTA_GRADIENT = ['#E7266A', '#C156D0'] as const;
export const ONBOARDING_GRADIENT = ['#FFF9F5', '#FFF0EB', '#F8E8F5'] as const;

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
    shadowColor: '#2D1136',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  button: {
    shadowColor: '#E7266A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
