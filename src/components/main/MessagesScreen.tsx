/* Messages tab — search field and empty state with icebreaker suggestions to encourage first voice replies. */

import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { MessageCircle, Search, Sparkles } from 'lucide-react-native';

import { COLORS, FONT, SHADOW, RADIUS } from '../../theme';

const ICEBREAKERS = [
  '\u201CJ\u2019ai adoré ton énergie sur ton vocal !\u201D',
  '\u201CTa pire honte m\u2019a fait mourir de rire 😂\u201D',
  '\u201CC\u2019est quoi le dernier son que tu as écouté ?\u201D',
] as const;

const MessagesScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <View style={{ flex: 1, flexDirection: 'column' }}>
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            fontFamily: FONT.extrabold,
            fontSize: 26,
            color: COLORS.dark,
            marginBottom: 16,
          }}
        >
          Messages
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: RADIUS.full,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.surfaceMuted,
            paddingHorizontal: 16,
          }}
        >
          <Search size={18} color={COLORS.textTertiary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher..."
            placeholderTextColor={COLORS.textTertiary}
            style={{
              flex: 1,
              fontFamily: FONT.regular,
              fontSize: 14,
              letterSpacing: 0,
              color: COLORS.dark,
              paddingVertical: 12,
              marginLeft: 10,
            }}
          />
        </View>
      </View>

      <View
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 32,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: COLORS.primaryMuted,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <MessageCircle size={30} color={COLORS.primary} />
        </View>

        <Text
          style={{
            fontFamily: FONT.bold,
            fontSize: 20,
            color: COLORS.dark,
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          Pas encore de messages
        </Text>
        <Text
          style={{
            fontFamily: FONT.regular,
            fontSize: 14,
            color: COLORS.textSecondary,
            textAlign: 'center',
            maxWidth: 250,
            marginBottom: 32,
          }}
        >
          Ta prochaine conversation commence ici.
        </Text>

        <View
          style={{
            width: '100%',
            maxWidth: 384,
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.surface,
            padding: 20,
            ...SHADOW.card,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Sparkles size={16} color={COLORS.secondary} />
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: COLORS.dark }}>
              Icebreakers
            </Text>
          </View>

          <View style={{ width: '100%', gap: 10 }}>
            {ICEBREAKERS.map((text, i) => (
              <View
                key={i}
                style={{
                  borderRadius: RADIUS.md,
                  backgroundColor: 'rgba(45,17,54,0.03)',
                  borderWidth: 1,
                  borderColor: COLORS.borderLight,
                  padding: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT.regular,
                    fontSize: 14,
                    color: COLORS.textSecondary,
                  }}
                >
                  {text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

export default MessagesScreen;
