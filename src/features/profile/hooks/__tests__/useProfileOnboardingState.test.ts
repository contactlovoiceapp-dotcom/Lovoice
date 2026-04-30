/* Tests for the ephemeral profile onboarding store used across wizard routes. */

import { useProfileOnboardingState } from '../useProfileOnboardingState';

describe('useProfileOnboardingState', () => {
  beforeEach(() => {
    useProfileOnboardingState.getState().reset();
  });

  it('stores wizard fields without persistence middleware', () => {
    useProfileOnboardingState.getState().setDisplayName('Alice');
    useProfileOnboardingState.getState().setBirthdate('01 / 02 / 1995');
    useProfileOnboardingState.getState().setGender('female');
    useProfileOnboardingState.getState().toggleLookingFor('male');
    useProfileOnboardingState.getState().setCitySelection('Paris', {
      latitude: 48.8566,
      longitude: 2.3522,
    });

    expect(useProfileOnboardingState.getState()).toMatchObject({
      displayName: 'Alice',
      birthdate: '01 / 02 / 1995',
      gender: 'female',
      lookingFor: ['male'],
      city: 'Paris',
      coordinates: {
        latitude: 48.8566,
        longitude: 2.3522,
      },
    });
  });

  it('toggles looking-for values and clears city selection', () => {
    useProfileOnboardingState.getState().toggleLookingFor('female');
    useProfileOnboardingState.getState().toggleLookingFor('female');
    useProfileOnboardingState.getState().setCitySelection('Lausanne', {
      latitude: 46.5197,
      longitude: 6.6323,
    });
    useProfileOnboardingState.getState().clearCitySelection();

    expect(useProfileOnboardingState.getState().lookingFor).toEqual([]);
    expect(useProfileOnboardingState.getState().city).toBe('');
    expect(useProfileOnboardingState.getState().coordinates).toBeNull();
  });
});
