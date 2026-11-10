import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { migrate } from '@/fitness/db/schema';
import { ensurePermission, getReminderSettings, rescheduleReminders } from '@/fitness/notify';
import { colors } from '@/theme/tokens';

/** Keeps the next 7 days of reminders current: on open and whenever the app comes back to the foreground. */
function ReminderSync() {
  const db = useSQLiteContext();
  useEffect(() => {
    (async () => {
      if (getReminderSettings().on) await ensurePermission();
      await rescheduleReminders(db);
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') rescheduleReminders(db);
    });
    return () => sub.remove();
  }, [db]);
  return null;
}

export default function FitnessLayout() {
  return (
    <SQLiteProvider databaseName="fitness.db" onInit={migrate}>
      <ReminderSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.base } }} />
    </SQLiteProvider>
  );
}
