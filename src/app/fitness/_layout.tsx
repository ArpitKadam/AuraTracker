import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { migrate } from '@/fitness/db/schema';
import { colors } from '@/theme/tokens';

export default function FitnessLayout() {
  return (
    <SQLiteProvider databaseName="fitness.db" onInit={migrate}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.base } }} />
    </SQLiteProvider>
  );
}
