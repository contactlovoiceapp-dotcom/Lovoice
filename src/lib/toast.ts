/* Cross-platform short toast helper.
   Android uses the native ToastAndroid; iOS falls back to a brief Alert
   because there is no first-party toast API. */

import { Alert, Platform, ToastAndroid } from 'react-native';

export function showToast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert(message);
}
