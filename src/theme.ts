/* Centralized color and gradient definitions to avoid magic values across components */

export const COLORS = {
  background: '#f8f5ff',
  surface: '#ffffff',
  surfaceLight: '#f0ebf5',
  primary: '#e724ab',
  secondary: '#d479ec',
  dark: '#4b164c',
  lavender: '#dfcef9',
} as const;

export const THEME_GRADIENTS = {
  solaire: { colors: ['#f59e0b', '#ea580c', '#4b164c'], ringColor: '#fbbf24', glowColor: '#fbbf24' },
  posee: { colors: ['#c084fc', '#8b5cf6', '#4b164c'], ringColor: '#d479ec', glowColor: '#a78bfa' },
  actif: { colors: ['#e724ab', '#9333ea', '#4b164c'], ringColor: '#e724ab', glowColor: '#e724ab' },
  mystere: { colors: ['#374151', '#1f2937', '#1a0a1b'], ringColor: '#9ca3af', glowColor: '#6b7280' },
} as const;

export const CTA_GRADIENT = [COLORS.primary, COLORS.secondary] as const;
export const ONBOARDING_GRADIENT = ['#f8f5ff', '#edf2fc', '#f0e8f8'] as const;
