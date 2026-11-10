import type { ChatMessage } from '../chat/logic.ts';
import type { Db } from './recipes.ts';

export async function listMessages(db: Db, recipeId: number): Promise<ChatMessage[]> {
  return db.getAllAsync<ChatMessage>('SELECT id, role, content FROM chat_messages WHERE recipe_id = ? ORDER BY id', [recipeId]);
}

export async function addMessage(db: Db, recipeId: number, role: ChatMessage['role'], content: string): Promise<number> {
  const r = await db.runAsync('INSERT INTO chat_messages (recipe_id, role, content, created_at) VALUES (?,?,?,?)', [recipeId, role, content, Date.now()]);
  return r.lastInsertRowId;
}

export async function clearChat(db: Db, recipeId: number): Promise<void> {
  await db.runAsync('DELETE FROM chat_messages WHERE recipe_id = ?', [recipeId]);
}
