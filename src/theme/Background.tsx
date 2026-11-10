import { StyleSheet, View } from 'react-native';

import { colors } from './tokens';

export function Background() {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.base }]} pointerEvents="none" />;
}
