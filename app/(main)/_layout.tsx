/* Main tab navigator — renders the 4 primary tabs with a custom floating pill nav bar. */

import { Tabs } from 'expo-router';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';

import BottomNav from '../../src/components/BottomNav';

// Subroutes (under any tab) that need to take the full screen and hide the floating nav pill.
const FULLSCREEN_SUBROUTES = new Set<string>(['record']);

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => {
        const activeRoute = props.state.routes[props.state.index];
        const subroute = getFocusedRouteNameFromRoute(activeRoute);
        if (subroute && FULLSCREEN_SUBROUTES.has(subroute)) {
          return null;
        }
        return <BottomNav {...props} />;
      }}
    >
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="likes" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
