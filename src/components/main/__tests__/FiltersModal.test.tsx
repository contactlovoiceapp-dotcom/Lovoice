/* Unit tests for FiltersModal — verifies draft state, apply, reset, and outside-tap dismissal. */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import FiltersModal from '../FiltersModal';
import { useFeedState, DEFAULT_FILTERS } from '../../../features/feed/hooks/useFeedState';
import { COPY } from '../../../copy';

// Seed a known state before every test so assertions are deterministic.
beforeEach(() => {
  useFeedState.setState({
    filters: DEFAULT_FILTERS,
    autoplay: false,
    setAutoplay: useFeedState.getState().setAutoplay,
    setFilters: useFeedState.getState().setFilters,
    resetFilters: useFeedState.getState().resetFilters,
  });
  jest.clearAllMocks();
});

describe('FiltersModal', () => {
  it('reads initial filter values from the store', () => {
    useFeedState.setState({
      ...useFeedState.getState(),
      filters: { minAge: 25, maxAge: 40, maxDistanceMeters: 50_000 },
    });

    const { getByText } = render(<FiltersModal onClose={jest.fn()} />);

    // Age pill shows the stored range.
    expect(getByText(`25 - 40 ${COPY.filters.ageUnit}`)).toBeTruthy();
    // Distance pill shows 50 km (50_000 / 1000).
    expect(getByText(`50 ${COPY.filters.distanceUnit}`)).toBeTruthy();
  });

  it('shows "Illimité" pill when maxDistanceMeters is null', () => {
    // DEFAULT_FILTERS has maxDistanceMeters: null
    const { getByText } = render(<FiltersModal onClose={jest.fn()} />);
    expect(getByText(COPY.filters.distanceUnlimitedLabel)).toBeTruthy();
  });

  it('calls setFilters with maxDistanceMeters: null when unlimited is on and Apply is tapped', () => {
    // Start with a limited distance so we can assert it becomes null.
    useFeedState.setState({
      ...useFeedState.getState(),
      filters: { minAge: 18, maxAge: 80, maxDistanceMeters: 30_000 },
    });

    const onClose = jest.fn();
    const { getByText, getByRole } = render(<FiltersModal onClose={onClose} />);

    // Switch the "Sans limite" toggle on.
    const switchEl = getByRole('switch');
    fireEvent(switchEl, 'valueChange', true);

    // Tap Apply.
    fireEvent.press(getByText(COPY.filters.apply));

    expect(useFeedState.getState().filters.maxDistanceMeters).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls setFilters with the correct distance when unlimited is off and Apply is tapped', () => {
    useFeedState.setState({
      ...useFeedState.getState(),
      filters: { minAge: 20, maxAge: 60, maxDistanceMeters: 100_000 },
    });

    const onClose = jest.fn();
    const { getByText } = render(<FiltersModal onClose={onClose} />);

    fireEvent.press(getByText(COPY.filters.apply));

    const saved = useFeedState.getState().filters;
    expect(saved.minAge).toBe(20);
    expect(saved.maxAge).toBe(60);
    expect(saved.maxDistanceMeters).toBe(100_000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls resetFilters and onClose when Reset is tapped', () => {
    useFeedState.setState({
      ...useFeedState.getState(),
      filters: { minAge: 30, maxAge: 50, maxDistanceMeters: 20_000 },
    });

    const onClose = jest.fn();
    const { getByText } = render(<FiltersModal onClose={onClose} />);

    fireEvent.press(getByText(COPY.filters.reset));

    expect(useFeedState.getState().filters).toEqual(DEFAULT_FILTERS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose without touching setFilters when the scrim is tapped', () => {
    const onClose = jest.fn();
    const { getAllByLabelText } = render(<FiltersModal onClose={onClose} />);

    // Both the scrim and the X button share closeFilters; press the first (scrim).
    fireEvent.press(getAllByLabelText(COPY.a11y.closeFilters)[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
    // Store filters must remain at the seeded DEFAULT_FILTERS — no setFilters call.
    expect(useFeedState.getState().filters).toEqual(DEFAULT_FILTERS);
  });

  it('does not render legacy toggles or city chips', () => {
    const { queryByText } = render(<FiltersModal onClose={jest.fn()} />);

    // Removed copy keys should not appear in the tree.
    expect(queryByText('Nouvelles voix')).toBeNull();
    expect(queryByText('Nouveaux profils')).toBeNull();
    expect(queryByText('Localisation')).toBeNull();
    // City chips were hardcoded; confirm none are rendered.
    expect(queryByText('Paris')).toBeNull();
    expect(queryByText('Lyon')).toBeNull();
  });
});
