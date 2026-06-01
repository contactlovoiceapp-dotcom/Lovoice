/* Tests for mobile Sentry PII scrubbing helpers (URLs, breadcrumbs, audio-debug fields). */

import {
  scrubDataRecord,
  scrubMobileBreadcrumb,
  scrubMobileRequestUrl,
} from '../sentry';

describe('scrubMobileRequestUrl', () => {
  it('redacts UUIDs in PostgREST .eq filters', () => {
    const url =
      'https://xxx.supabase.co/rest/v1/messages?id=eq.aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(scrubMobileRequestUrl(url)).toBe(
      'https://xxx.supabase.co/rest/v1/messages?id=eq.[uuid]',
    );
  });
});

describe('scrubMobileBreadcrumb', () => {
  it('redacts email in breadcrumb message', () => {
    const bc = scrubMobileBreadcrumb({
      category: 'auth',
      message: 'login failed for user@example.com',
      level: 'warning',
    });
    expect(bc.message).toBe('login failed for [email]');
  });

  it('keeps conversationId and messageId in upload breadcrumbs', () => {
    const conversationId = '11111111-1111-1111-1111-111111111111';
    const messageId = '22222222-2222-2222-2222-222222222222';
    const data = scrubDataRecord({
      objectPath: `${conversationId}/33333333-3333-3333-3333-333333333333.m4a`,
      conversationId,
      messageId,
      body_text: 'secret',
    });

    expect(data?.conversationId).toBe(conversationId);
    expect(data?.messageId).toBe(messageId);
    expect(data?.objectPath).toContain(conversationId);
    expect(data?.body_text).toBe('[redacted]');
  });
});
