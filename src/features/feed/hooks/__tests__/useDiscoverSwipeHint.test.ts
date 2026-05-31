/* Tests for the Discover swipe coach mark — hydration and dismiss persistence via SecureStore. */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import {
  useDiscoverSwipeHint,
  useDiscoverSwipeHintStore,
} from '../useDiscoverSwipeHint';

describe('useDiscoverSwipeHint', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await SecureStore.deleteItemAsync('discover_swipe_hint_dismissed');
    act(() => {
      useDiscoverSwipeHintStore.setState({
        dismissed: false,
        hydrated: false,
      });
    });
  });

  it('shows the hint after hydration when nothing is stored', async () => {
    const { result } = renderHook(() => useDiscoverSwipeHint());

    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
  });

  it('hides the hint after hydration when already dismissed in SecureStore', async () => {
    await SecureStore.setItemAsync('discover_swipe_hint_dismissed', '1');

    const { result } = renderHook(() => useDiscoverSwipeHint());

    await waitFor(() => {
      expect(result.current.visible).toBe(false);
    });
  });

  it('dismiss hides the hint and persists to SecureStore', async () => {
    const { result } = renderHook(() => useDiscoverSwipeHint());

    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.visible).toBe(false);
    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'discover_swipe_hint_dismissed',
        '1',
      );
    });
  });
});
