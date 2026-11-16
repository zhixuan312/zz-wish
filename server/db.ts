import Database from 'better-sqlite3';

export type DB = Database.Database;

export function openDb(file: string): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      id TEXT PRIMARY KEY,
      credential_hash TEXT NOT NULL UNIQUE,
      locale TEXT,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL REFERENCES visitors(id),
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS candles (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL REFERENCES visitors(id),
      wish_id TEXT NOT NULL REFERENCES wishes(id),
      wish_snapshot TEXT NOT NULL,
      place_id TEXT NOT NULL,
      shape TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      rule_version INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('burning', 'burned_down', 'went_out', 'ended_unexpectedly')),
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      burned_ms INTEGER NOT NULL DEFAULT 0,
      end_reason TEXT,
      run_id TEXT NOT NULL,
      UNIQUE (visitor_id, run_id)
    );
    CREATE INDEX IF NOT EXISTS candles_visitor ON candles (visitor_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS candles_place ON candles (place_id);
    CREATE UNIQUE INDEX IF NOT EXISTS one_burning_per_visitor ON candles (visitor_id) WHERE status = 'burning';
  `);
  return db;
}
