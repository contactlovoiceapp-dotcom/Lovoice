/* Global test setup — mocks for native modules that are unavailable in the Jest environment. */

import '@testing-library/react-native/build/matchers/extend-expect';

// ---------------------------------------------------------------------------
// expo-audio
// ---------------------------------------------------------------------------

const mockRecorder = {
  id: 'mock-recorder',
  currentTime: 0,
  isRecording: false,
  uri: null as string | null,
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(() => {
    mockRecorder.uri = 'file:///tmp/mock-recording.m4a';
    return Promise.resolve();
  }),
  prepareToRecordAsync: jest.fn(() => Promise.resolve()),
  getStatus: jest.fn(() => ({ canRecord: true, isRecording: false, durationMillis: 0 })),
  getAvailableInputs: jest.fn(() => []),
  getCurrentInput: jest.fn(() => Promise.resolve({ name: 'Built-in Mic', type: 'mic', uid: '0' })),
  setInput: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

const mockRecorderState = {
  canRecord: true,
  isRecording: false,
  durationMillis: 0,
  mediaServicesDidReset: false,
  metering: -50,
};

const mockPlayer = {
  id: 'mock-player',
  currentTime: 0,
  duration: 0,
  playing: false,
  muted: false,
  loop: false,
  isLoaded: true,
  volume: 1,
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(() => Promise.resolve()),
  replace: jest.fn(),
  remove: jest.fn(),
  setVolume: jest.fn(),
  setMuted: jest.fn(),
  setLoop: jest.fn(),
  setPlaybackRate: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  setActiveForLockScreen: jest.fn(),
  updateLockScreenMetadata: jest.fn(),
  clearLockScreenControls: jest.fn(),
  setAudioSamplingEnabled: jest.fn(),
};

const mockPlayerStatus = {
  id: 'mock-player',
  currentTime: 0,
  duration: 0,
  playing: false,
  mute: false,
  loop: false,
  isLoaded: true,
  isBuffering: false,
  didJustFinish: false,
  playbackState: 'paused',
  timeControlStatus: 'paused',
  reasonForWaitingToPlay: '',
  playbackRate: 1,
  shouldCorrectPitch: true,
};

jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(() => mockRecorder),
  useAudioRecorderState: jest.fn(() => mockRecorderState),
  useAudioPlayer: jest.fn(() => mockPlayer),
  useAudioPlayerStatus: jest.fn(() => mockPlayerStatus),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  requestRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true, status: 'granted', expires: 'never', canAskAgain: true }),
  ),
  getRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true, status: 'granted', expires: 'never', canAskAgain: true }),
  ),
  IOSOutputFormat: {
    MPEG4AAC: 'aac ',
    LINEARPCM: 'lpcm',
  },
  AudioQuality: {
    MIN: 0,
    LOW: 32,
    MEDIUM: 64,
    HIGH: 96,
    MAX: 127,
  },
}));

// Expose mock objects for per-test override.
(global as Record<string, unknown>).__expoAudioMocks = {
  recorder: mockRecorder,
  recorderState: mockRecorderState,
  player: mockPlayer,
  playerStatus: mockPlayerStatus,
};

// ---------------------------------------------------------------------------
// expo-file-system
// ---------------------------------------------------------------------------

const mockFile = {
  uri: 'file:///document/pending/mock-uuid.m4a',
  exists: true,
  copy: jest.fn(),
  move: jest.fn(),
  delete: jest.fn(),
  text: jest.fn(() => Promise.resolve('')),
};

const mockDirectory = {
  uri: 'file:///document/pending/',
  exists: true,
  create: jest.fn(),
  delete: jest.fn(),
  list: jest.fn(() => []),
};

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((base: unknown, name?: string) => ({
    ...mockFile,
    uri:
      typeof base === 'string'
        ? base
        : `file:///document/${name ?? 'mock-file.m4a'}`,
  })),
  Directory: jest.fn().mockImplementation(() => mockDirectory),
  Paths: {
    document: { uri: 'file:///document/' },
    cache: { uri: 'file:///cache/' },
    bundle: { uri: 'file:///bundle/' },
  },
}));

// ---------------------------------------------------------------------------
// expo-crypto
// ---------------------------------------------------------------------------

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid-1234-5678'),
  digestStringAsync: jest.fn(() => Promise.resolve('mock-hash')),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));

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

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

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
