import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors } from './tokens';

// Peach top-left, periwinkle top-right, mint bottom-left, lavender bottom-right.
export function Background() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[colors.peach, colors.base, colors.lavender]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(217,220,255,0.9)', 'rgba(217,220,255,0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.4, y: 0.35 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(189,238,230,0.95)', 'rgba(189,238,230,0)']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.7, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
