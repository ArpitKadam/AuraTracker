import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GlassTabBar } from '@/components/GlassTabBar';
import { Background } from '@/theme/Background';
import { BlurTarget, BlurTargetProvider } from '@/theme/blur-target';

export const unstable_settings = { anchor: 'recipes' };

export default function TabsLayout() {
  return (
    <BlurTargetProvider>
      <View style={StyleSheet.absoluteFill}>
        <BlurTarget>
          <Background />
          <Tabs
            tabBar={() => null}
            backBehavior="initialRoute"
            screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
          >
            <Tabs.Screen name="recipes" />
            <Tabs.Screen name="plan" />
            <Tabs.Screen name="profile" />
          </Tabs>
        </BlurTarget>
        <GlassTabBar />
      </View>
    </BlurTargetProvider>
  );
}
