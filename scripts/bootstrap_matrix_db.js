import fs from 'fs';
import path from 'path';
import sqlite3 from 'better-sqlite3';

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1];
    params[key] = val;
  }
  return params;
}

const args = parseArgs();
const dbPath = args['db-path'] || process.env.DB_PATH || './charon.sqlite';
const strategyId = args['strategy'] || process.env.ACTIVE_STRATEGY_ID || 'sniper';
const useLlmStr = args['use-llm'] !== undefined ? args['use-llm'] : process.env.FORCE_USE_LLM;

console.log(`[bootstrap] Target DB: ${dbPath}`);
console.log(`[bootstrap] Active Strategy: ${strategyId}`);
console.log(`[bootstrap] Force use_llm: ${useLlmStr !== undefined ? useLlmStr : 'default'}`);

const dir = path.dirname(dbPath);
if (dir && !fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

process.env.DB_PATH = dbPath;
const { initDb, db } = await import('../src/db/connection.js');
initDb();

// Apply migration 001_decision_cache.sql if exists
const migrationPath = path.resolve('migrations/001_decision_cache.sql');
if (fs.existsSync(migrationPath)) {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  db.exec(sql);
  console.log('[bootstrap] Applied 001_decision_cache.sql migration');
}

// Enable active strategy
const validStrats = ['sniper', 'dip_buy', 'smart_money', 'degen'];
if (!validStrats.includes(strategyId)) {
  console.error(`Invalid strategy ID: ${strategyId}. Must be one of: ${validStrats.join(', ')}`);
  process.exit(1);
}

db.prepare('UPDATE strategies SET enabled = 0').run();
db.prepare('UPDATE strategies SET enabled = 1 WHERE id = ?').run(strategyId);

if (useLlmStr !== undefined) {
  const forceLlm = useLlmStr === 'true' || useLlmStr === '1';
  const row = db.prepare('SELECT config_json FROM strategies WHERE id = ?').get(strategyId);
  if (row) {
    const config = JSON.parse(row.config_json);
    config.use_llm = forceLlm;
    db.prepare('UPDATE strategies SET config_json = ? WHERE id = ?').run(JSON.stringify(config), strategyId);
    console.log(`[bootstrap] Updated strategy '${strategyId}' config_json.use_llm = ${forceLlm}`);
  }
}

console.log(`[bootstrap] Successfully initialized ${dbPath} with active strategy '${strategyId}'`);
process.exit(0);
