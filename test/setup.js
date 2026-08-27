import fs from 'fs';
import path from 'path';
import os from 'os';

// Setup isolated temporary test database to prevent mutation of charon.sqlite or ./data/*.sqlite
const tempDir = os.tmpdir();
const testDbPath = path.join(tempDir, `charon_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);

process.env.DB_PATH = testDbPath;
process.env.DISABLE_TELEGRAM_POLLING = 'true';

// Auto-cleanup on process exit
process.on('exit', () => {
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    const wal = `${testDbPath}-wal`;
    const shm = `${testDbPath}-shm`;
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
  } catch {}
});
