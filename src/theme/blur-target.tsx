import { BlurTargetView } from 'expo-blur';
import { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

// Android BlurView needs a ref to the view it should blur. Wrap the screens in
// <BlurTarget>; floating controls (tab bar, FAB) sit OUTSIDE it, inside the provider.
const BlurTargetContext = createContext<RefObject<ComponentRef<typeof View> | null> | null>(null);

export function useBlurTarget() {
  return useContext(BlurTargetContext);
}

export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  return <BlurTargetContext.Provider value={ref}>{children}</BlurTargetContext.Provider>;
}

export function BlurTarget({ children }: { children: ReactNode }) {
  const ref = useBlurTarget();
  return (
    <BlurTargetView ref={ref} style={StyleSheet.absoluteFill}>
      {children}
    </BlurTargetView>
  );
}
