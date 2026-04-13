/* Likes tab — empty state with usage hints when the user has not liked any profiles yet. */

import React from 'react';
import { Text, View } from 'react-native';
import { Heart, Sparkles } from 'lucide-react-native';

import { COLORS, FONT, SHADOW, RADIUS } from '../../theme';

const BULLET_POINTS = [
  'Écoute des Vibes et like celles qui te parlent.',
  'Retrouve tous tes likes ici.',
  'Envoie un vocal pour commencer la discussion !',
] as const;

const LikesScreen: React.FC = () => {
  return (
    <View style={{ flex: 1, flexDirection: 'column' }}>
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            fontFamily: FONT.extrabold,
            fontSize: 26,
            color: COLORS.dark,
            marginBottom: 8,
          }}
        >
          Mes Likes
        </Text>
        <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: COLORS.textSecondary }}>
          Les profils qui t'ont fait vibrer.
        </Text>
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
          <Heart size={30} color={COLORS.primary} />
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
          Aucun like
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
          Tes futurs coups de cœur t'attendent.
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
            <Text
              style={{
                fontFamily: FONT.semibold,
                fontSize: 14,
                color: COLORS.dark,
              }}
            >
              Comment ça marche ?
            </Text>
          </View>

          <View style={{ flexDirection: 'column', gap: 10 }}>
            {BULLET_POINTS.map((text, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={{ fontFamily: FONT.bold, color: COLORS.primary }}>•</Text>
                <Text
                  style={{
                    flex: 1,
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

export default LikesScreen;
