/* Core type definitions for the LOVoice application */

export enum ColorTheme {
  Sunset = 'sunset',
  Chill = 'chill',
  Electric = 'electric',
  Midnight = 'midnight',
}

export interface Profile {
  id: string;
  name: string;
  age: number;
  city: string;
  promptTitle?: string;
  transcript?: string;
  emojis: string[];
  theme: ColorTheme;
  isPlaying?: boolean;
  audioDurationSec: number;
}

export type Tab = 'discover' | 'likes' | 'messages' | 'my-vibes';

export type AppState =
  | 'splash'
  | 'home'
  | 'login_phone'
  | 'onboarding_phone'
  | 'onboarding_record'
  | 'onboarding_profile'
  | 'main';
