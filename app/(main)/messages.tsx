/* Messages tab — conversation inbox with search and empty state. */

import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../src/theme';
import MessagesScreen from '../../src/components/main/MessagesScreen';

export default function MessagesRoute() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 112, paddingTop: insets.top + 16 }}>
        <MessagesScreen />
      </View>
    </View>
  );
}
