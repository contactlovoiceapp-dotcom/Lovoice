/* Global test setup — mocks for native modules that are unavailable in the Jest environment. */

import '@testing-library/react-native/build/matchers/extend-expect';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };

  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: View,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, width: 375, height: 812 } },
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureStore.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureStore.delete(key);
    return Promise.resolve();
  }),
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true],
  isLoaded: () => true,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  useSegments: () => [],
  Slot: ({ children }: { children: React.ReactNode }) => children,
  Stack: {
    Screen: () => null,
  },
  Tabs: {
    Screen: () => null,
  },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');

  const AnimatedView = RN.View;
  AnimatedView.displayName = 'Animated.View';

  const AnimatedText = RN.Text;
  AnimatedText.displayName = 'Animated.Text';

  const AnimatedImage = RN.Image;
  AnimatedImage.displayName = 'Animated.Image';

  const AnimatedScrollView = RN.ScrollView;
  AnimatedScrollView.displayName = 'Animated.ScrollView';

  const Animated = {
    View: AnimatedView,
    Text: AnimatedText,
    Image: AnimatedImage,
    ScrollView: AnimatedScrollView,
  };

  return {
    __esModule: true,
    default: { call: () => {}, ...Animated },
    useSharedValue: (init: unknown) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    withTiming: (val: unknown) => val,
    withSpring: (val: unknown) => val,
    withRepeat: (val: unknown) => val,
    withSequence: (...args: unknown[]) => args[0],
    withDelay: (_d: number, val: unknown) => val,
    cancelAnimation: () => {},
    Easing: {
      linear: (v: number) => v,
      ease: (v: number) => v,
      in: () => (v: number) => v,
      out: () => (v: number) => v,
      inOut: () => (v: number) => v,
      sin: (v: number) => v,
    },
    ...Animated,
  };
});
