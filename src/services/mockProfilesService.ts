/* In-memory mock profile generator — replaces the Gemini API call used in the prototype.
   Returns random profiles from a static pool for development and demo purposes. */

import { Profile, ColorTheme } from '../types';

const MOCK_POOL: Profile[] = [
  {
    id: 'mock-1',
    name: 'Inès',
    age: 25,
    city: 'Lyon 6e',
    promptTitle: 'Mon guilty pleasure musical 🎵',
    transcript: "Je suis capable d'écouter du Patrick Bruel en boucle sans aucune honte.",
    emojis: ['🎤', '🍕', '💃'],
    theme: ColorTheme.Sunset,
    isPlaying: false,
    audioDurationSec: 12,
  },
  {
    id: 'mock-2',
    name: 'Hugo',
    age: 29,
    city: 'Nantes',
    promptTitle: 'Le truc que personne ne sait sur moi',
    transcript: "J'ai une collection de plus de 200 vinyles et je ne sais pas danser.",
    emojis: ['🎸', '🍷', '🌊'],
    theme: ColorTheme.Chill,
    isPlaying: false,
    audioDurationSec: 14,
  },
  {
    id: 'mock-3',
    name: 'Jade',
    age: 23,
    city: 'Marseille 8e',
    promptTitle: 'Ma plus belle rencontre 💫',
    transcript: "C'était dans un train, on a parlé pendant 4 heures et on ne s'est jamais revus.",
    emojis: ['✨', '📖', '🌺'],
    theme: ColorTheme.Electric,
    isPlaying: false,
    audioDurationSec: 16,
  },
  {
    id: 'mock-4',
    name: 'Antoine',
    age: 32,
    city: 'Bruxelles',
    promptTitle: 'Mon dimanche parfait ☕',
    transcript: 'Grasse mat, café noir, un bon bouquin et surtout personne qui me parle avant midi.',
    emojis: ['📚', '☕', '🐱'],
    theme: ColorTheme.Midnight,
    isPlaying: false,
    audioDurationSec: 11,
  },
  {
    id: 'mock-5',
    name: 'Clara',
    age: 27,
    city: 'Toulouse',
    promptTitle: 'Le conseil que je donnerais à mon ex 😅',
    transcript: 'Apprends à cuisiner autre chose que des pâtes au beurre, sérieusement.',
    emojis: ['🍳', '😂', '🌻'],
    theme: ColorTheme.Sunset,
    isPlaying: false,
    audioDurationSec: 9,
  },
  {
    id: 'mock-6',
    name: 'Noé',
    age: 26,
    city: 'Genève',
    promptTitle: 'Ce qui me fait vibrer 🎶',
    transcript: "Le son d'une trompette dans un club de jazz à 2h du matin, quand tout le monde se tait.",
    emojis: ['🎺', '🌙', '🥃'],
    theme: ColorTheme.Midnight,
    isPlaying: false,
    audioDurationSec: 13,
  },
];

let mockCounter = 0;

export function generateNewProfile(): Promise<Profile | null> {
  const template = MOCK_POOL[mockCounter % MOCK_POOL.length];
  mockCounter += 1;

  const profile: Profile = {
    ...template,
    id: `mock-gen-${Date.now()}-${mockCounter}`,
  };

  // Simulate network delay.
  return new Promise((resolve) => setTimeout(() => resolve(profile), 300));
}
