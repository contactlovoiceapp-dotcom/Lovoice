/* Likes tab — empty state with usage hints when the user has not liked any profiles yet. */

import React from 'react';
import { Text, View } from 'react-native';
import { Heart, Sparkles } from 'lucide-react-native';

const LikesScreen: React.FC = () => {
  return (
    <View className="flex h-full flex-col">
      <View className="mb-6">
        <Text className="mb-2 text-2xl font-bold text-dark">Mes Likes</Text>
        <Text className="text-sm text-dark/40">Les profils qui t'ont fait vibrer.</Text>
      </View>

      <View className="flex flex-1 flex-col items-center justify-center py-8">
        <View className="mb-6 h-20 w-20 flex-row items-center justify-center rounded-full border border-primary/15 bg-primary/10">
          <Heart size={32} className="text-primary/50" />
        </View>
        <Text className="mb-2 text-center text-xl font-bold text-dark">Aucun like</Text>
        <Text className="mb-8 max-w-[250px] text-center text-dark/40">
          Découvre de nouvelles Vibes et like celles qui te plaisent !
        </Text>

        <View className="w-full max-w-sm rounded-2xl border border-dark/5 bg-white/70 p-5">
          <View className="mb-4 flex-row items-center gap-2">
            <Sparkles size={16} className="text-secondary" />
            <Text className="text-sm font-bold text-dark">Comment ça marche ?</Text>
          </View>
          <View className="flex-col gap-2.5">
            <View className="flex-row items-start gap-2">
              <Text className="font-bold text-primary">•</Text>
              <Text className="flex-1 text-sm text-dark/50">
                Écoute des Vibes et like celles qui te parlent.
              </Text>
            </View>
            <View className="flex-row items-start gap-2">
              <Text className="font-bold text-primary">•</Text>
              <Text className="flex-1 text-sm text-dark/50">Retrouve tous tes likes ici.</Text>
            </View>
            <View className="flex-row items-start gap-2">
              <Text className="font-bold text-primary">•</Text>
              <Text className="flex-1 text-sm text-dark/50">
                Envoie un vocal pour commencer la discussion !
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default LikesScreen;
