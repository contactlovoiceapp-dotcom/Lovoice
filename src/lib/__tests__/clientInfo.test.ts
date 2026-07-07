/* Unit tests for client device metadata collection helpers. */

import { clientInfoMatchesProfile, collectClientInfo } from '../clientInfo';

describe('collectClientInfo', () => {
  it('returns a payload with platform and version fields', () => {
    const info = collectClientInfo();
    expect(info.device_platform).toBeTruthy();
    expect(typeof info.device_platform).toBe('string');
  });
});

describe('clientInfoMatchesProfile', () => {
  it('returns true when all fields match', () => {
    const payload = {
      device_platform: 'ios',
      device_model: 'iPhone',
      device_os_version: '17.0',
      app_version: '1.0.0',
    };

    expect(clientInfoMatchesProfile(payload, payload)).toBe(true);
  });

  it('returns false when app version changed', () => {
    const payload = {
      device_platform: 'ios',
      device_model: 'iPhone',
      device_os_version: '17.0',
      app_version: '1.0.1',
    };

    expect(
      clientInfoMatchesProfile(payload, {
        ...payload,
        app_version: '1.0.0',
      }),
    ).toBe(false);
  });
});
