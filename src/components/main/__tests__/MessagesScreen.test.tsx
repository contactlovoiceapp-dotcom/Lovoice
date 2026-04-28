/* Tests for the Messages screen empty state and icebreakers. */

import React from 'react';
import { render } from '@testing-library/react-native';

import MessagesScreen from '../MessagesScreen';
import { COPY } from '../../../copy';

describe('MessagesScreen', () => {
  it('renders the title', () => {
    const { getByText } = render(<MessagesScreen />);
    expect(getByText(COPY.messagesScreen.title)).toBeTruthy();
  });

  it('renders the search placeholder', () => {
    const { getByPlaceholderText } = render(<MessagesScreen />);
    expect(getByPlaceholderText(COPY.messagesScreen.searchPlaceholder)).toBeTruthy();
  });

  it('renders the empty state message', () => {
    const { getByText } = render(<MessagesScreen />);
    expect(getByText(COPY.messagesScreen.emptyTitle)).toBeTruthy();
    expect(getByText(COPY.messagesScreen.emptyBody)).toBeTruthy();
  });

  it('renders icebreaker suggestions', () => {
    const { getByText } = render(<MessagesScreen />);
    expect(getByText(COPY.messagesScreen.icebreakersTitle)).toBeTruthy();
    for (const icebreaker of COPY.messagesScreen.icebreakers) {
      expect(getByText(icebreaker)).toBeTruthy();
    }
  });
});
