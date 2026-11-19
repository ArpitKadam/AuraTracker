import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

import type { CatalogExercise } from '../catalog-types';
import { exerciseImage } from '../exercises';

/** 56dp square: video poster, the user's photo, or a barbell placeholder. */
export function ExerciseThumb({ exercise }: { exercise: CatalogExercise }) {
  const src = exerciseImage(exercise);
  return src ? (
    <Image source={src} style={styles.thumb} contentFit="cover" />
  ) : (
    <View style={[styles.thumb, styles.empty]}>
      <Ionicons name="barbell-outline" size={24} color={colors.textFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.raised },
  empty: { alignItems: 'center', justifyContent: 'center' },
});
