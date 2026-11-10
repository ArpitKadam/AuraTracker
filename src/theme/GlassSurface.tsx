import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useBlurTarget } from './blur-target';
import { colors } from './tokens';

type Props = {
  children?: ReactNode;
  radius?: number;
  /** Real backdrop blur. Only for controls that float above scrolling content. */
  blur?: boolean;
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Android has no system Liquid Glass. This approximates it: optional blur,
// translucent fill, a bright top edge and a hairline border.
export function GlassSurface({ children, radius = 28, blur = false, strong = false, style }: Props) {
  const target = useBlurTarget();
  return (
    <View style={[styles.shell, { borderRadius: radius }, style]}>
      {blur && target ? (
        <BlurView
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={60}
          tint="light"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: strong ? colors.glassFillStrong : colors.glassFill }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.border, { borderRadius: radius }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { overflow: 'hidden' },
  border: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.glassBorder },
});
