/* Tests for the BottomNav custom tab bar component. */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BottomNav from '../BottomNav';
import { COPY } from '../../copy';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function createTabBarProps(activeIndex = 0) {
  const navigate = jest.fn();
  const routes = [
    { key: 'discover-key', name: 'discover', params: undefined },
    { key: 'likes-key', name: 'likes', params: undefined },
    { key: 'messages-key', name: 'messages', params: undefined },
    { key: 'profile-key', name: 'profile', params: undefined },
  ];

  return {
    state: {
      index: activeIndex,
      routes,
      key: 'tab-state',
      routeNames: routes.map((r) => r.name),
      type: 'tab' as const,
      stale: false as const,
      history: [],
    },
    navigation: {
      navigate,
      emit: jest.fn().mockReturnValue({ defaultPrevented: false }),
      dispatch: jest.fn(),
      reset: jest.fn(),
      goBack: jest.fn(),
      isFocused: jest.fn().mockReturnValue(true),
      canGoBack: jest.fn().mockReturnValue(false),
      getParent: jest.fn(),
      getState: jest.fn(),
      setOptions: jest.fn(),
      getId: jest.fn(),
      setParams: jest.fn(),
      addListener: jest.fn().mockReturnValue(() => {}),
      removeListener: jest.fn(),
    },
    descriptors: {},
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as unknown as React.ComponentProps<typeof BottomNav>;
}

describe('BottomNav', () => {
  it('renders all 4 tabs', () => {
    const { getByLabelText } = render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <BottomNav {...createTabBarProps()} />
      </SafeAreaProvider>,
    );

    expect(getByLabelText(COPY.nav.discover)).toBeTruthy();
    expect(getByLabelText(COPY.nav.likes)).toBeTruthy();
    expect(getByLabelText(COPY.nav.messages)).toBeTruthy();
    expect(getByLabelText(COPY.nav.profile)).toBeTruthy();
  });

  it('marks the active tab as selected', () => {
    const { getByLabelText } = render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <BottomNav {...createTabBarProps(1)} />
      </SafeAreaProvider>,
    );

    expect(getByLabelText(COPY.nav.likes)).toHaveProp('accessibilityState', { selected: true });
    expect(getByLabelText(COPY.nav.discover)).toHaveProp('accessibilityState', { selected: false });
  });

  it('calls navigation.navigate when a tab is pressed', () => {
    const props = createTabBarProps(0);
    const { getByLabelText } = render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <BottomNav {...props} />
      </SafeAreaProvider>,
    );

    fireEvent.press(getByLabelText(COPY.nav.messages));

    expect(props.navigation.navigate).toHaveBeenCalledWith('messages');
  });
});
