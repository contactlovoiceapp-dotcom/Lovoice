/* Tests for the mock profiles service used during development. */

import { generateNewProfile } from '../mockProfilesService';

describe('generateNewProfile', () => {
  it('returns a profile with all required fields', async () => {
    const profile = await generateNewProfile();
    expect(profile).not.toBeNull();
    expect(profile).toHaveProperty('id');
    expect(profile).toHaveProperty('name');
    expect(profile).toHaveProperty('age');
    expect(profile).toHaveProperty('city');
    expect(profile).toHaveProperty('emojis');
    expect(profile).toHaveProperty('theme');
    expect(profile).toHaveProperty('audioDurationSec');
  });

  it('generates unique IDs across calls', async () => {
    const a = await generateNewProfile();
    const b = await generateNewProfile();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
  });

  it('cycles through the mock pool', async () => {
    const names = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const profile = await generateNewProfile();
      if (profile) names.add(profile.name);
    }
    expect(names.size).toBeGreaterThan(1);
  });

  it('returns a profile with valid age', async () => {
    const profile = await generateNewProfile();
    expect(profile).not.toBeNull();
    expect(profile!.age).toBeGreaterThanOrEqual(18);
    expect(profile!.age).toBeLessThanOrEqual(100);
  });

  it('returns a profile with non-empty emojis array', async () => {
    const profile = await generateNewProfile();
    expect(profile).not.toBeNull();
    expect(profile!.emojis.length).toBeGreaterThan(0);
  });
});
