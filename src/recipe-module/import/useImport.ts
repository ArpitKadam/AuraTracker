import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';

import { DEFAULT_MODEL, getGeminiKey } from '../extraction/key';
import { importFromImages, importFromLink, ImportError, type PickedImage, type StageEvent } from './importer';

export type StageRow = StageEvent & { done: boolean };

export type ImportState =
  | { phase: 'idle' }
  | { phase: 'running'; stages: StageRow[] }
  | { phase: 'error'; stages: StageRow[]; code: ImportError['code']; message: string; recipeId?: number }
  | { phase: 'done'; recipeId: number };

export function useImport() {
  const db = useSQLiteContext();
  const [state, setState] = useState<ImportState>({ phase: 'idle' });
  const stages = useRef<StageRow[]>([]);
  const busy = useRef(false);

  const onStage = useCallback((s: StageEvent) => {
    // A new stage means the previous one finished; a repeated id just renames the current stage.
    const cur = stages.current;
    if (cur.length && cur[cur.length - 1].id === s.id) cur[cur.length - 1] = { ...s, done: false };
    else stages.current = [...cur.map((r) => ({ ...r, done: true })), { ...s, done: false }];
    setState({ phase: 'running', stages: stages.current });
  }, []);

  const run = useCallback(
    async (job: (cfg: { apiKey: string; model: string }) => Promise<number>) => {
      if (busy.current) return; // double-tap guard
      busy.current = true;
      stages.current = [];
      setState({ phase: 'running', stages: [] });
      try {
        const apiKey = await getGeminiKey();
        if (!apiKey) throw new ImportError('NO_KEY', 'Add your Gemini API key in Profile first.');
        const recipeId = await job({ apiKey, model: DEFAULT_MODEL });
        setState({ phase: 'done', recipeId });
      } catch (e) {
        const err = e instanceof ImportError ? e : new ImportError('FAILED', e instanceof Error ? e.message : 'Something went wrong');
        setState({ phase: 'error', stages: stages.current, code: err.code, message: err.message, recipeId: err.recipeId });
      } finally {
        busy.current = false;
      }
    },
    [],
  );

  return {
    state,
    startLink: (url: string) => run((cfg) => importFromLink(db, cfg, url, onStage)),
    startImages: (images: PickedImage[]) => run((cfg) => importFromImages(db, cfg, images, onStage)),
    reset: () => setState({ phase: 'idle' }),
  };
}
