/**
 * Messages tab screen: search field and empty state with icebreaker suggestions
 * to encourage users to send their first voice replies.
 */
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { MessageCircle, Search, Sparkles } from 'lucide-react-native';

const PLACEHOLDER_TEXT_COLOR = '#4b164c4d';

const MessagesScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <View className="flex flex-1 flex-col">
      <View className="mb-6">
        <Text className="mb-4 text-2xl font-bold text-dark">Messages</Text>
        <View className="relative w-full">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-dark/25"
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher..."
            placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            className="w-full rounded-full border border-dark/10 bg-white/80 py-3 pl-12 pr-4 text-sm text-dark"
          />
        </View>
      </View>

      <View className="flex flex-1 flex-col items-center justify-center py-8">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full border border-dark/5 bg-dark/5">
          <MessageCircle size={32} className="text-dark/20" />
        </View>
        <Text className="mb-2 text-center text-xl font-bold text-dark">
          Pas encore de messages
        </Text>
        <Text className="mb-8 max-w-[250px] text-center text-dark/40">
          Envoie une réponse vocale pour briser la glace !
        </Text>

        <View className="w-full max-w-sm rounded-2xl border border-dark/5 bg-white/70 p-5">
          <View className="mb-4 flex flex-row items-center gap-2">
            <Sparkles size={16} className="text-secondary" />
            <Text className="text-sm font-bold text-dark">Icebreakers</Text>
          </View>
          <View className="w-full gap-2.5">
            <View className="rounded-xl border border-dark/5 bg-dark/[0.03] p-3">
              <Text className="text-sm text-dark/50">
                {`\u201CJ'ai adoré ton énergie sur ton vocal !\u201D`}
              </Text>
            </View>
            <View className="rounded-xl border border-dark/5 bg-dark/[0.03] p-3">
              <Text className="text-sm text-dark/50">
                {`\u201CTa pire honte m'a fait mourir de rire 😂\u201D`}
              </Text>
            </View>
            <View className="rounded-xl border border-dark/5 bg-dark/[0.03] p-3">
              <Text className="text-sm text-dark/50">
                {`\u201CC'est quoi le dernier son que tu as écouté ?\u201D`}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default MessagesScreen;
