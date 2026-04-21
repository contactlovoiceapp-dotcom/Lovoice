/* Gemini API integration for generating demo profiles */
import * as Crypto from 'expo-crypto';
import { Profile, ColorTheme } from '../types';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

const THEME_MAP: Record<string, ColorTheme> = {
  sunset: ColorTheme.Sunset,
  chill: ColorTheme.Chill,
  electric: ColorTheme.Electric,
  midnight: ColorTheme.Midnight,
};

export const generateNewProfile = async (): Promise<Profile | null> => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Generate a creative, french-speaking dating profile for an audio-first app called Lovoice. Include: name (string), age (integer), city (string, like "Paris 11e"), promptTitle (string, catchy teaser in French), emojis (array of 3 strings), theme (one of: "sunset","chill","electric","midnight"). Return ONLY valid JSON, no markdown.',
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const data = JSON.parse(text);
    return {
      id: Crypto.randomUUID(),
      ...data,
      theme: THEME_MAP[data.theme] || ColorTheme.Sunset,
      isPlaying: false,
      audioDurationSec: Math.floor(Math.random() * 20) + 5,
    };
  } catch (error) {
    console.error('Failed to generate profile:', error);
    return null;
  }
};
