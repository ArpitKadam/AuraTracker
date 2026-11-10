// Shared by mybites.db and fitness.db. Pure SQL so scripts/check-*.ts can run it under node:sqlite.
export type MigrateDb = {
  execAsync(sql: string): Promise<unknown>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
};

/** Applies MIGRATIONS[n] for every n above PRAGMA user_version, each in its own transaction. */
export async function applyMigrations(db: MigrateDb, migrations: Record<number, string>) {
  // foreign_keys is per-connection, so it must run on every open, not only on migrate.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const latest = Math.max(...Object.keys(migrations).map(Number));
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < latest) {
    version += 1;
    await db.execAsync(`BEGIN;${migrations[version]}PRAGMA user_version = ${version};COMMIT;`);
  }
}
