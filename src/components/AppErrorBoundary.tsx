/* Fallback UI for the expo-router root ErrorBoundary: replaces the white screen a render
   error would otherwise produce, reports the error to Sentry, and offers a retry. */

import React, { useEffect } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';

import { COLORS, FONT, RADIUS } from '@/theme';
import { COPY } from '@/copy';
import { Sentry } from '@/lib/sentry';

export default function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    // No-op when Sentry is not configured (initSentry() did nothing).
    Sentry.captureException(error);
  }, [error]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
      }}
    >
      <Text
        style={{
          fontFamily: FONT.serifSemibold,
          fontSize: 26,
          color: COLORS.textPrimary,
          textAlign: 'center',
          marginBottom: 12,
        }}
      >
        {COPY.errorBoundary.title}
      </Text>
      <Text
        style={{
          fontFamily: FONT.regular,
          fontSize: 16,
          color: COLORS.textSecondary,
          textAlign: 'center',
          marginBottom: 28,
        }}
      >
        {COPY.errorBoundary.body}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => {
          void retry();
        }}
        style={{
          backgroundColor: COLORS.primary,
          paddingVertical: 14,
          paddingHorizontal: 36,
          borderRadius: RADIUS.cta,
        }}
      >
        <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: COLORS.surface }}>
          {COPY.errorBoundary.retry}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
