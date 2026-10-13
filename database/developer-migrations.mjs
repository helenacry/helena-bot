import { db } from './connection.mjs';
export function runDeveloperMigrations() {
 db.exec(`CREATE TABLE IF NOT EXISTS developer_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS developer_blacklist (user_id TEXT PRIMARY KEY,reason TEXT NOT NULL,created_at INTEGER NOT NULL DEFAULT(unixepoch()));
 CREATE TABLE IF NOT EXISTS developer_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL DEFAULT(unixepoch()));
 CREATE INDEX IF NOT EXISTS idx_developer_logs_created ON developer_logs(created_at);`);
 console.log('[DATABASE] Developer System verificado.');
}