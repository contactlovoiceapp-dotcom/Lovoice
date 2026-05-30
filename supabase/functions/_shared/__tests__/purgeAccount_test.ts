// Unit tests for the pure helpers exported by the shared purgeAccount module.
// These cover id validation, storage-path normalization, batching, and the storage-deletion
// plan — all without touching the Edge runtime (no service-role client is loaded).
// Run with: deno test --allow-env --allow-net supabase/functions/

import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  TOMBSTONE_USER_ID,
  isUuid,
  isTombstone,
  normalizeStoragePaths,
  chunk,
  buildStorageDeletions,
} from '../purgeAccount.ts';

// ---------------------------------------------------------------------------
// isUuid
// ---------------------------------------------------------------------------

Deno.test('isUuid — accepts a canonical lowercase uuid', () => {
  assertEquals(isUuid('11111111-1111-1111-1111-111111111111'), true);
  assertEquals(isUuid(TOMBSTONE_USER_ID), true);
});

Deno.test('isUuid — rejects malformed / wrong-type values', () => {
  assertEquals(isUuid('not-a-uuid'), false);
  assertEquals(isUuid('11111111-1111-1111-1111-11111111111'), false); // 11 trailing chars
  assertEquals(isUuid('11111111111111111111111111111111'), false); // no dashes
  assertEquals(isUuid(''), false);
  assertEquals(isUuid(null), false);
  assertEquals(isUuid(undefined), false);
  assertEquals(isUuid(42), false);
});

// ---------------------------------------------------------------------------
// isTombstone
// ---------------------------------------------------------------------------

Deno.test('isTombstone — only the sentinel id matches', () => {
  assertEquals(isTombstone(TOMBSTONE_USER_ID), true);
  assertEquals(isTombstone('11111111-1111-1111-1111-111111111111'), false);
});

// ---------------------------------------------------------------------------
// normalizeStoragePaths
// ---------------------------------------------------------------------------

Deno.test('normalizeStoragePaths — drops null/undefined/blank entries', () => {
  const out = normalizeStoragePaths(['a/1.m4a', null, undefined, '', '   ', 'b/2.m4a']);
  assertEquals(out, ['a/1.m4a', 'b/2.m4a']);
});

Deno.test('normalizeStoragePaths — trims and de-duplicates, preserving first-seen order', () => {
  const out = normalizeStoragePaths(['a/1.m4a', '  a/1.m4a  ', 'b/2.m4a', 'a/1.m4a']);
  assertEquals(out, ['a/1.m4a', 'b/2.m4a']);
});

Deno.test('normalizeStoragePaths — empty input yields empty array', () => {
  assertEquals(normalizeStoragePaths([]), []);
});

// ---------------------------------------------------------------------------
// chunk
// ---------------------------------------------------------------------------

Deno.test('chunk — splits into batches of the given size', () => {
  assertEquals(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

Deno.test('chunk — exact multiple produces no trailing empty batch', () => {
  assertEquals(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
});

Deno.test('chunk — empty input yields no batches', () => {
  assertEquals(chunk([], 3), []);
});

Deno.test('chunk — non-positive size throws', () => {
  assertThrows(() => chunk([1, 2], 0), Error, 'size must be a positive integer');
  assertThrows(() => chunk([1, 2], -1), Error, 'size must be a positive integer');
});

// ---------------------------------------------------------------------------
// buildStorageDeletions
// ---------------------------------------------------------------------------

Deno.test('buildStorageDeletions — groups by bucket and batches each', () => {
  const plan = buildStorageDeletions(
    ['u/v1.m4a', 'u/v2.m4a', 'u/v3.m4a'],
    ['c/m1.m4a'],
    2,
  );

  assertEquals(plan, [
    { bucket: 'voices', paths: ['u/v1.m4a', 'u/v2.m4a'] },
    { bucket: 'voices', paths: ['u/v3.m4a'] },
    { bucket: 'messages', paths: ['c/m1.m4a'] },
  ]);
});

Deno.test('buildStorageDeletions — omits empty buckets entirely', () => {
  assertEquals(buildStorageDeletions([], []), []);
  assertEquals(buildStorageDeletions(['u/v1.m4a'], []), [
    { bucket: 'voices', paths: ['u/v1.m4a'] },
  ]);
  assertEquals(buildStorageDeletions([], ['c/m1.m4a']), [
    { bucket: 'messages', paths: ['c/m1.m4a'] },
  ]);
});

Deno.test('buildStorageDeletions — normalizes (drops blanks, de-dupes) before batching', () => {
  const plan = buildStorageDeletions(
    ['u/v1.m4a', null, 'u/v1.m4a', '  '],
    [undefined, 'c/m1.m4a'],
  );

  assertEquals(plan, [
    { bucket: 'voices', paths: ['u/v1.m4a'] },
    { bucket: 'messages', paths: ['c/m1.m4a'] },
  ]);
});
