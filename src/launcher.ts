import { router } from 'expo-router';
import { Storage } from 'expo-sqlite/kv-store';

export type AppId = 'fitness' | 'mybites';

const REMEMBER = 'launcher.remember';
const LAST = 'launcher.last';
const ROUTES = { fitness: '/fitness', mybites: '/mybites' } as const;

export const isApp = (v: unknown): v is AppId => v === 'fitness' || v === 'mybites';

// Module state lives for one JS runtime, so it resets only on a cold launch.
// Cached so a double render (StrictMode) cannot flip the answer.
let startup: AppId | null | undefined;

/** App to jump straight into on this cold launch, or null to show the launcher. */
export function startupTarget(): AppId | null {
  if (startup === undefined) {
    const last = Storage.getItemSync(LAST);
    startup = Storage.getItemSync(REMEMBER) === '1' && isApp(last) ? last : null;
  }
  return startup;
}

export const getRemember = () => Storage.getItemSync(REMEMBER) === '1';
export const setRemember = (on: boolean) => Storage.setItemSync(REMEMBER, on ? '1' : '0');

export function openApp(app: AppId) {
  Storage.setItemSync(LAST, app);
  startup = null;
  router.replace(ROUTES[app]);
}

/** Header switch icon: back to the launcher without auto-skipping again. */
export function openLauncher() {
  startup = null;
  router.replace('/');
}
