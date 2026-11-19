import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import type { CatalogExercise } from '../catalog-types';
import { exerciseImage, exerciseVideo } from '../exercises';

/** Demo video (looped, muted; paused on its first frame under reduce-motion), else the poster or the user's photo. */
export function ExerciseMedia({ exercise, style }: { exercise: CatalogExercise; style: StyleProp<ViewStyle> }) {
  const video = exerciseVideo(exercise);
  if (video !== undefined) return <Demo source={video} style={style} label={`${exercise.name} demonstration`} />;
  const image = exerciseImage(exercise);
  return image ? (
    <Image source={image} style={style as StyleProp<ImageStyle>} contentFit={exercise.photoUri ? 'cover' : 'contain'} accessibilityLabel={`${exercise.name} photo`} />
  ) : null;
}

function Demo({ source, style, label }: { source: number; style: StyleProp<ViewStyle>; label: string }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (live && !reduce) player.play();
    });
    return () => {
      live = false;
    };
  }, [player]);
  return <VideoView player={player} style={[styles.video, style]} contentFit="contain" nativeControls={false} accessibilityLabel={label} />;
}

const styles = StyleSheet.create({ video: { overflow: 'hidden' } });
