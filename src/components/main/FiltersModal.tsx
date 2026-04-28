/* Filter bottom sheet for tuning Discover feed preferences: toggles, age range, city chips, and apply action. */

import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';

import { COLORS, FONT, SHADOW, RADIUS, CTA_GRADIENT } from '../../theme';
import { COPY } from '../../copy';

const CITIES = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille'] as const;
const SLIDER_MAX_TRACK = 'rgba(45,17,54,0.1)';

interface Props {
  onClose: () => void;
}

const FiltersModal: React.FC<Props> = ({ onClose }) => {
  const [newVoices, setNewVoices] = useState(true);
  const [newProfiles, setNewProfiles] = useState(false);
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 35]);
  const [city, setCity] = useState<(typeof CITIES)[number]>('Paris');

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(45,17,54,0.4)',
        }}
      >
        <View
          style={{
            width: '100%',
            borderTopLeftRadius: RADIUS.xl,
            borderTopRightRadius: RADIUS.xl,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.surface,
            padding: 24,
          }}
        >
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
            <Pressable
              onPress={onClose}
              style={{
                borderRadius: RADIUS.full,
                backgroundColor: 'rgba(45,17,54,0.05)',
                padding: 8,
              }}
              accessibilityRole="button"
              accessibilityLabel={COPY.a11y.closeFilters}
            >
              <X size={18} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={{ gap: 24 }}>
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.textSecondary }}>
                  {COPY.filters.newVoices}
                </Text>
                <Switch
                  value={newVoices}
                  onValueChange={setNewVoices}
                  trackColor={{ false: 'rgba(45,17,54,0.15)', true: COLORS.primary }}
                  thumbColor="#ffffff"
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.textSecondary }}>
                  {COPY.filters.newProfiles}
                </Text>
                <Switch
                  value={newProfiles}
                  onValueChange={setNewProfiles}
                  trackColor={{ false: 'rgba(45,17,54,0.15)', true: COLORS.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

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
                    {ageRange[0]} - {ageRange[1]} {COPY.filters.ageUnit}
                  </Text>
                </View>
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontFamily: FONT.medium,
                    fontSize: 15,
                    color: COLORS.textSecondary,
                    marginBottom: 8,
                  }}
                >
                  {COPY.filters.ageMin}
                </Text>
                <Slider
                  minimumValue={18}
                  maximumValue={100}
                  value={ageRange[0]}
                  step={1}
                  onValueChange={(val) => {
                    const rounded = Math.round(val);
                    setAgeRange(([_, max]) => {
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
                    fontSize: 15,
                    color: COLORS.textSecondary,
                    marginBottom: 8,
                  }}
                >
                  {COPY.filters.ageMax}
                </Text>
                <Slider
                  minimumValue={18}
                  maximumValue={100}
                  value={ageRange[1]}
                  step={1}
                  onValueChange={(val) => {
                    const rounded = Math.round(val);
                    setAgeRange(([min, _]) => {
                      const nextMax = Math.max(rounded, min + 1);
                      return [min, Math.min(100, nextMax)];
                    });
                  }}
                  minimumTrackTintColor={COLORS.primary}
                  maximumTrackTintColor={SLIDER_MAX_TRACK}
                  thumbTintColor="#ffffff"
                />
              </View>
            </View>

            <View>
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 15,
                  color: COLORS.textSecondary,
                  marginBottom: 8,
                }}
              >
                  {COPY.filters.location}
                </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}
              >
                {CITIES.map((c) => {
                  const selected = city === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCity(c)}
                      style={{
                        borderRadius: RADIUS.full,
                        backgroundColor: selected ? COLORS.primary : 'rgba(45,17,54,0.05)',
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={{
                          fontFamily: FONT.medium,
                          fontSize: 14,
                          color: selected ? '#ffffff' : COLORS.textSecondary,
                        }}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          <Pressable
            onPress={onClose}
            style={{ marginTop: 32, borderRadius: RADIUS.full, overflow: 'hidden', ...SHADOW.button }}
            accessibilityRole="button"
            accessibilityLabel={COPY.a11y.applyFilters}
          >
            <LinearGradient
              colors={[...CTA_GRADIENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingVertical: 16, alignItems: 'center' }}
            >
              <Text
                style={{
                  fontFamily: FONT.bold,
                  fontSize: 16,
                  color: '#ffffff',
                  textAlign: 'center',
                }}
              >
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
