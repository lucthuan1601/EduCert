import { loadConfig } from './config.js';
import { openDatabase } from './database.js';
const config = loadConfig();
const db = openDatabase(config.databasePath);
console.log(`SQLite schema version: ${db.pragma('user_version', { simple: true })}`);
db.close();
