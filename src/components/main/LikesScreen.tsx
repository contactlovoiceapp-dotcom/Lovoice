/* Likes tab — groups received and given likes in one focused screen. */

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Heart, Sparkles, User } from 'lucide-react-native';

import type { Profile } from '../../types';
import { COLORS, FONT, RADIUS, SHADOW } from '../../theme';
import { COPY } from '../../copy';

type LikesSubTab = 'received' | 'given';

interface LikesScreenProps {
  likedProfiles: Profile[];
  receivedLikeProfiles: Profile[];
  onUnlike: (id: string) => void;
  onOpenReceivedLike: (id: string) => void;
}

function EmptyState({
  title,
  body,
  showTips,
}: {
  title: string;
  body: string;
  showTips: boolean;
}) {
  return (
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
        {title}
      </Text>
      <Text
        style={{
          fontFamily: FONT.regular,
          fontSize: 14,
          color: COLORS.textSecondary,
          textAlign: 'center',
          maxWidth: 260,
          marginBottom: showTips ? 32 : 0,
        }}
      >
        {body}
      </Text>

      {showTips && (
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
              {COPY.likesScreen.howItWorks}
            </Text>
          </View>

          <View style={{ flexDirection: 'column', gap: 10 }}>
            {COPY.likesScreen.bullets.map((text, i) => (
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
      )}
    </View>
  );
}

function ProfileMeta({ profile }: { profile: Profile }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.textSecondary }}>
        {profile.city}
      </Text>
      <Text style={{ fontSize: 13 }}>{profile.emojis.join(' ')}</Text>
    </View>
  );
}

const LikesScreen: React.FC<LikesScreenProps> = ({
  likedProfiles,
  receivedLikeProfiles,
  onUnlike,
  onOpenReceivedLike,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<LikesSubTab>('received');

  return (
    <View style={{ flex: 1, flexDirection: 'column' }}>
      <View style={{ marginBottom: 20 }}>
        <Text
          style={{
            fontFamily: FONT.extrabold,
            fontSize: 26,
            color: COLORS.dark,
            marginBottom: 8,
          }}
        >
          {COPY.likesScreen.title}
        </Text>
        <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: COLORS.textSecondary }}>
          {COPY.likesScreen.subtitle}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          padding: 4,
          borderRadius: RADIUS.cta,
          backgroundColor: COLORS.borderLight,
          marginBottom: 20,
        }}
      >
        {([
          { id: 'received', label: COPY.likesScreen.receivedTab },
          { id: 'given', label: COPY.likesScreen.givenTab },
        ] as const).map((tab) => {
          const selected = activeSubTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setActiveSubTab(tab.id)}
              style={{
                flex: 1,
                borderRadius: RADIUS.cta,
                backgroundColor: selected ? COLORS.surface : 'transparent',
                paddingVertical: 10,
                alignItems: 'center',
                ...selected ? SHADOW.card : {},
              }}
            >
              <Text
                style={{
                  fontFamily: selected ? FONT.bold : FONT.medium,
                  fontSize: 14,
                  color: selected ? COLORS.dark : COLORS.textSecondary,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeSubTab === 'received' ? (
        receivedLikeProfiles.length > 0 ? (
          <View style={{ flexDirection: 'column', gap: 10 }}>
            {receivedLikeProfiles.map((profile) => (
              <View
                key={profile.id}
                style={{
                  flexDirection: 'column',
                  gap: 12,
                  padding: 16,
                  borderRadius: RADIUS.lg,
                  backgroundColor: COLORS.surface,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  ...SHADOW.card,
                }}
              >
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: COLORS.dark }}>
                      {profile.name}, {profile.age}
                    </Text>
                    <View
                      style={{
                        borderRadius: RADIUS.full,
                        backgroundColor: COLORS.primaryMuted,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.primary }}>
                        {COPY.likesScreen.receivedBadge}
                      </Text>
                    </View>
                  </View>
                  <ProfileMeta profile={profile} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpenReceivedLike(profile.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: RADIUS.full,
                    backgroundColor: COLORS.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    alignSelf: 'flex-start',
                  }}
                >
                  <User size={16} color={COLORS.surface} />
                  <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.surface }}>
                    {COPY.likesScreen.receivedAction}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            title={COPY.likesScreen.receivedEmptyTitle}
            body={COPY.likesScreen.receivedEmptyBody}
            showTips={false}
          />
        )
      ) : likedProfiles.length > 0 ? (
        <View style={{ flexDirection: 'column', gap: 10 }}>
          {likedProfiles.map((profile) => (
            <View
              key={profile.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 16,
                borderRadius: RADIUS.lg,
                backgroundColor: COLORS.surface,
                borderWidth: 1,
                borderColor: COLORS.border,
                ...SHADOW.card,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: COLORS.dark }}>
                  {profile.name}, {profile.age}
                </Text>
                <ProfileMeta profile={profile} />
              </View>
              <Pressable onPress={() => onUnlike(profile.id)} hitSlop={10} style={{ padding: 8 }}>
                <Heart size={22} color="#ef4444" fill="#ef4444" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          title={COPY.likesScreen.givenEmptyTitle}
          body={COPY.likesScreen.givenEmptyBody}
          showTips
        />
      )}
    </View>
  );
};

export default LikesScreen;
