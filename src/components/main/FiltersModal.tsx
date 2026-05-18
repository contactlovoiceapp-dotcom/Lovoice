/* Filter bottom sheet for the Discover feed: age range, max distance (km), apply/reset. */

import React, { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';

import { COLORS, FONT, SHADOW, RADIUS, CTA_GRADIENT } from '../../theme';
import { COPY } from '../../copy';
import { useFeedState } from '../../features/feed/hooks/useFeedState';
import type { FeedFilters } from '../../features/feed/hooks/useFeedState';

// Fallback km position shown in the slider when the user toggles Unlimited → Limited.
// Never persisted until Apply is tapped.
const DISTANCE_DEFAULT_KM = 100;
const SLIDER_MAX_TRACK = 'rgba(45,17,54,0.1)';

interface Props {
  onClose: () => void;
}

// BottomNav floats at insets.bottom + 12px gap + 64px pill height.
// Add 16px breathing room so action buttons never sit flush against the nav.
const BOTTOM_NAV_CLEARANCE = 64 + 12 + 16;

const FiltersModal: React.FC<Props> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const filters = useFeedState((state) => state.filters);
  const setFilters = useFeedState((state) => state.setFilters);
  const resetFilters = useFeedState((state) => state.resetFilters);

  // Draft state keeps uncommitted changes local so tapping outside cancels without effect.
  const [draftAgeRange, setDraftAgeRange] = useState<[number, number]>([
    filters.minAge,
    filters.maxAge,
  ]);
  const [draftDistanceKm, setDraftDistanceKm] = useState<number>(
    filters.maxDistanceMeters === null
      ? DISTANCE_DEFAULT_KM
      : Math.round(filters.maxDistanceMeters / 1000),
  );
  const [draftUnlimited, setDraftUnlimited] = useState<boolean>(
    filters.maxDistanceMeters === null,
  );

  const handleApply = () => {
    const nextFilters: FeedFilters = {
      minAge: draftAgeRange[0],
      maxAge: draftAgeRange[1],
      maxDistanceMeters: draftUnlimited ? null : draftDistanceKm * 1000,
    };
    setFilters(nextFilters);
    onClose();
  };

  const handleReset = () => {
    resetFilters();
    onClose();
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      {/* Scrim — tap to dismiss without committing changes */}
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(45,17,54,0.4)',
        }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={COPY.a11y.closeFilters}
      />

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surface,
          paddingTop: 24,
          paddingHorizontal: 24,
          // Push content above the floating BottomNav pill so it's always tappable.
          paddingBottom: insets.bottom + BOTTOM_NAV_CLEARANCE,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <Text style={{ fontFamily: FONT.bold, fontSize: 20, color: COLORS.dark }}>
            {COPY.filters.title}
          </Text>
          {/* minWidth/minHeight guarantee the 44×44pt iOS / 48dp Android minimum touch target
              while keeping the visible circle small. */}
          <Pressable
            onPress={onClose}
            style={{
              minWidth: 44,
              minHeight: 44,
              borderRadius: RADIUS.full,
              backgroundColor: 'rgba(45,17,54,0.05)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={COPY.a11y.closeFilters}
          >
            <X size={18} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        <View style={{ gap: 28 }}>
          {/* Age range section */}
          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.textSecondary }}>
                {COPY.filters.ageRange}
              </Text>
              <View
                style={{
                  borderRadius: RADIUS.full,
                  backgroundColor: COLORS.primaryMuted,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: COLORS.primary }}>
                  {draftAgeRange[0]} - {draftAgeRange[1]} {COPY.filters.ageUnit}
                </Text>
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  marginBottom: 8,
                }}
              >
                {COPY.filters.ageMin}
              </Text>
              <Slider
                minimumValue={18}
                maximumValue={80}
                value={draftAgeRange[0]}
                step={1}
                onValueChange={(val) => {
                  const rounded = Math.round(val);
                  setDraftAgeRange(([_, max]) => {
                    const nextMin = Math.min(rounded, max - 1);
                    return [Math.max(18, nextMin), max];
                  });
                }}
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={SLIDER_MAX_TRACK}
                thumbTintColor="#ffffff"
              />
            </View>

            <View>
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  marginBottom: 8,
                }}
              >
                {COPY.filters.ageMax}
              </Text>
              <Slider
                minimumValue={18}
                maximumValue={80}
                value={draftAgeRange[1]}
                step={1}
                onValueChange={(val) => {
                  const rounded = Math.round(val);
                  setDraftAgeRange(([min, _]) => {
                    const nextMax = Math.max(rounded, min + 1);
                    return [min, Math.min(80, nextMax)];
                  });
                }}
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={SLIDER_MAX_TRACK}
                thumbTintColor="#ffffff"
              />
            </View>
          </View>

          {/* Distance section */}
          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.textSecondary }}>
                {COPY.filters.distance}
              </Text>
              <View
                style={{
                  borderRadius: RADIUS.full,
                  backgroundColor: COLORS.primaryMuted,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: COLORS.primary }}>
                  {draftUnlimited
                    ? COPY.filters.distanceUnlimitedLabel
                    : `${draftDistanceKm} ${COPY.filters.distanceUnit}`}
                </Text>
              </View>
            </View>

            {/* Slider hidden when unlimited to keep the surface uncluttered */}
            {!draftUnlimited && (
              <View style={{ marginBottom: 16 }}>
                <Slider
                  minimumValue={5}
                  maximumValue={1000}
                  value={draftDistanceKm}
                  step={5}
                  onValueChange={(val) => setDraftDistanceKm(Math.round(val))}
                  minimumTrackTintColor={COLORS.primary}
                  maximumTrackTintColor={SLIDER_MAX_TRACK}
                  thumbTintColor="#ffffff"
                />
              </View>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.textSecondary }}>
                {COPY.filters.distanceUnlimitedSwitch}
              </Text>
              <Switch
                value={draftUnlimited}
                onValueChange={setDraftUnlimited}
                trackColor={{ false: 'rgba(45,17,54,0.15)', true: COLORS.primary }}
                thumbColor="#ffffff"
              />
            </View>
          </View>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 32 }}>
          <Pressable
            onPress={handleReset}
            style={{
              flex: 1,
              borderRadius: RADIUS.full,
              borderWidth: 1.5,
              borderColor: COLORS.border,
              paddingVertical: 16,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={COPY.a11y.resetFilters}
          >
            <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.textSecondary }}>
              {COPY.filters.reset}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleApply}
            style={{ flex: 1, borderRadius: RADIUS.full, overflow: 'hidden', ...SHADOW.button }}
            accessibilityRole="button"
            accessibilityLabel={COPY.a11y.applyFilters}
          >
            <LinearGradient
              colors={[...CTA_GRADIENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingVertical: 16, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: '#ffffff' }}>
                {COPY.filters.apply}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default FiltersModal;
