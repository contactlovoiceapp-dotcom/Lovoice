/* Tests for the brand splash screen component. */

import React from 'react';
import { render } from '@testing-library/react-native';

import SplashScreen from '../SplashScreen';
import { COPY } from '../../../copy';

jest.useFakeTimers();

describe('SplashScreen', () => {
  it('renders the app logo', () => {
    const { getByLabelText } = render(<SplashScreen />);
    expect(getByLabelText(COPY.common.appName)).toBeTruthy();
  });

  it('renders the tagline', () => {
    const { getByText } = render(<SplashScreen />);
    expect(getByText(COPY.splash.tagline)).toBeTruthy();
  });

  it('calls onFinish after the timer', () => {
    const onFinish = jest.fn();
    render(<SplashScreen onFinish={onFinish} />);

    expect(onFinish).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2800);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('does not crash when onFinish is undefined', () => {
    expect(() => {
      render(<SplashScreen />);
      jest.advanceTimersByTime(3000);
    }).not.toThrow();
  });
});
