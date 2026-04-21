/* Metro bundler configuration — integrates NativeWind CSS processing */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
const nativeWindConfig = withNativeWind(config, { input: './global.css' });

// NativeWind injects `watcher.unstable_workerThreads` which is no longer a valid
// Metro option in recent versions — remove it to suppress the validation warning.
if (nativeWindConfig.watcher) {
  delete nativeWindConfig.watcher.unstable_workerThreads;
}

module.exports = nativeWindConfig;
