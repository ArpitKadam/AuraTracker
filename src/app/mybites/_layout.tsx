import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { migrate } from '@/recipe-module/db/schema';
import { colors } from '@/theme/tokens';

export default function MyBitesLayout() {
  return (
    <SQLiteProvider databaseName="mybites.db" onInit={migrate}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.base } }}>
        {['import', 'share', 'cookbook-form', 'cookbook-picker', 'meal-add', 'chat'].map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        ))}
      </Stack>
    </SQLiteProvider>
  );
}
