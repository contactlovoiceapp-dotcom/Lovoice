/**
 * Filter bottom sheet for tuning Discover feed preferences: toggles, age range,
 * city chips, and apply action — presented as a modal overlay with motion.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';

const CITIES = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille'] as const;

const SLIDER_TRACK_MAX = 'rgba(75,22,76,0.1)';

interface Props {
  onClose: () => void;
}

const FiltersModal: React.FC<Props> = ({ onClose }) => {
  const [newVibes, setNewVibes] = useState(true);
  const [newProfiles, setNewProfiles] = useState(false);
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 35]);
  const [city, setCity] = useState<(typeof CITIES)[number]>('Paris');

  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
      <View className="absolute inset-0 z-50 flex justify-end bg-dark/40">
        <View className="w-full rounded-t-3xl border border-dark/5 bg-white p-6 shadow-xl">
          <View className="mb-6 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-dark">Filtres</Text>
            <Pressable
              onPress={onClose}
              className="rounded-full bg-dark/5 p-2 active:bg-dark/10"
              accessibilityRole="button"
              accessibilityLabel="Fermer les filtres"
            >
              <X size={18} color="rgba(75, 22, 76, 0.4)" />
            </Pressable>
          </View>

          <View className="gap-6">
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-medium text-dark/70">Nouveaux vibes</Text>
                <Switch
                  value={newVibes}
                  onValueChange={setNewVibes}
                  trackColor={{ false: 'rgba(75,22,76,0.15)', true: '#e724ab' }}
                  thumbColor="#ffffff"
                />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="font-medium text-dark/70">Nouveaux profils</Text>
                <Switch
                  value={newProfiles}
                  onValueChange={setNewProfiles}
                  trackColor={{ false: 'rgba(75,22,76,0.15)', true: '#e724ab' }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            <View>
              <View className="mb-4 flex-row items-center justify-between">
                <Text className="font-medium text-dark/70">{"Tranche d'âge"}</Text>
                <View className="rounded-full bg-primary/10 px-3 py-1">
                  <Text className="text-sm font-bold text-primary">
                    {ageRange[0]} - {ageRange[1]} ans
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="mb-2 font-medium text-dark/70">Âge minimum</Text>
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
                  minimumTrackTintColor="#e724ab"
                  maximumTrackTintColor={SLIDER_TRACK_MAX}
                  thumbTintColor="#ffffff"
                />
              </View>

              <View>
                <Text className="mb-2 font-medium text-dark/70">Âge maximum</Text>
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
                  minimumTrackTintColor="#e724ab"
                  maximumTrackTintColor={SLIDER_TRACK_MAX}
                  thumbTintColor="#ffffff"
                />
              </View>
            </View>

            <View>
              <Text className="mb-2 font-medium text-dark/70">Localisation</Text>
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
                      className={`rounded-full px-4 py-2.5 ${selected ? 'bg-primary' : 'bg-dark/5'}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        className={`text-sm font-medium ${selected ? 'text-white' : 'text-dark/70'}`}
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
            className="mt-8 overflow-hidden rounded-full shadow-lg shadow-primary/30"
            accessibilityRole="button"
            accessibilityLabel="Appliquer les filtres"
          >
            <LinearGradient
              colors={['#e724ab', '#d479ec']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-4"
            >
              <Text className="text-center text-base font-bold text-white">
                Appliquer les filtres
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default FiltersModal;
