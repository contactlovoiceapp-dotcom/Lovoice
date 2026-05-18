/* Smoke tests for the feed UI store: autoplay toggle and filters slice. */

import { act } from '@testing-library/react-native';

import { useFeedState, DEFAULT_FILTERS } from '../useFeedState';

describe('useFeedState', () => {
  beforeEach(() => {
    act(() => {
      useFeedState.setState({
        autoplay: false,
        filters: DEFAULT_FILTERS,
      });
    });
  });

  it('setAutoplay flips state from false to true', () => {
    act(() => {
      useFeedState.getState().setAutoplay(true);
    });
    expect(useFeedState.getState().autoplay).toBe(true);
  });

  it('setFilters updates the filters slice', () => {
    const next = { minAge: 25, maxAge: 40, maxDistanceMeters: 50000 };
    act(() => {
      useFeedState.getState().setFilters(next);
    });
    expect(useFeedState.getState().filters).toEqual(next);
  });

  it('resetFilters restores DEFAULT_FILTERS', () => {
    act(() => {
      useFeedState.getState().setFilters({ minAge: 30, maxAge: 50, maxDistanceMeters: 10000 });
    });
    act(() => {
      useFeedState.getState().resetFilters();
    });
    expect(useFeedState.getState().filters).toEqual(DEFAULT_FILTERS);
  });
});
