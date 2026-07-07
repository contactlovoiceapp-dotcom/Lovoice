/* Collects device and app metadata from React Native / Expo for profiles.client_info sync. */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

export interface ClientInfoPayload {
  device_platform: string;
  device_model: string | null;
  device_os_version: string | null;
  app_version: string | null;
}

export function collectClientInfo(): ClientInfoPayload {
  const constants = Platform.constants as Record<string, unknown>;
  const platform = Platform.OS;

  const model =
    (typeof constants.Model === 'string' ? constants.Model : null) ??
    (typeof constants.model === 'string' ? constants.model : null);

  const osVersion =
    (typeof constants.Release === 'string' ? constants.Release : null) ??
    (typeof constants.systemVersion === 'string' ? constants.systemVersion : null) ??
    (Platform.Version != null ? String(Platform.Version) : null);

  const appVersion =
    Constants.expoConfig?.version ??
    (Constants.manifest as { version?: string } | null)?.version ??
    null;

  return {
    device_platform: platform,
    device_model: model,
    device_os_version: osVersion,
    app_version: appVersion,
  };
}

export function clientInfoMatchesProfile(
  payload: ClientInfoPayload,
  profile: {
    device_platform: string | null;
    device_model: string | null;
    device_os_version: string | null;
    app_version: string | null;
  },
): boolean {
  return (
    profile.device_platform === payload.device_platform &&
    profile.device_model === payload.device_model &&
    profile.device_os_version === payload.device_os_version &&
    profile.app_version === payload.app_version
  );
}
