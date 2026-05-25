/* Header bar for the conversation screen — back button, avatar+name, and 3-dots action menu. */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';

import { COLORS, FONT } from '@/theme';
import { COPY } from '@/copy';

interface ConversationHeaderProps {
  displayName: string;
  subtitle: string;
  avatarEmoji: string;
  onClose: () => void;
  onPressMore: () => void;
  onPressProfile: () => void;
}

export default function ConversationHeader({
  displayName,
  subtitle,
  avatarEmoji,
  onClose,
  onPressMore,
  onPressProfile,
}: ConversationHeaderProps) {
  return (
    <View
      style={{
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        backgroundColor: COLORS.background,
      }}
    >
      <Pressable
        onPress={onClose}
        accessibilityLabel={COPY.chat.conversation.back}
        accessibilityRole="button"
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronLeft size={24} color={COLORS.dark} />
      </Pressable>

      {/* Tapping the avatar or name opens the profile */}
      <Pressable
        onPress={onPressProfile}
        accessibilityRole="button"
        accessibilityLabel={displayName}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: COLORS.primaryMuted,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
          }}
        >
          <Text style={{ fontSize: 16 }}>{avatarEmoji}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {subtitle !== '' && (
            <Text
              style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textSecondary }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </Pressable>

      <Pressable
        onPress={onPressMore}
        accessibilityLabel={COPY.chat.conversation.moreActions}
        accessibilityRole="button"
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <MoreHorizontal size={22} color={COLORS.dark} />
      </Pressable>
    </View>
  );
}
