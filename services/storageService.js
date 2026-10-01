const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'mod.sqlite');
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

let db = null;
let dbReadyPromise = null;

async function getDb() {
  if (db) return db;
  if (dbReadyPromise) return dbReadyPromise;

  dbReadyPromise = (async () => {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_FILE)) {
      try {
        const filebuffer = fs.readFileSync(DB_FILE);
        db = new SQL.Database(filebuffer);
      } catch (e) {
        console.error('Error loading existing sqlite db, creating new:', e);
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }

    // Initialize SQLite Tables
    db.run(`
      CREATE TABLE IF NOT EXISTS configs (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt TEXT
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS schedules (
        sheetName TEXT PRIMARY KEY,
        officersJson TEXT,
        source TEXT,
        updatedAt TEXT
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS delivery_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        type TEXT,
        shift TEXT,
        status TEXT,
        target TEXT,
        messageText TEXT,
        statusCode INTEGER,
        response TEXT,
        error TEXT
      );
    `);

    // Migrate default config into SQLite if table is empty
    const checkConfig = db.exec("SELECT value FROM configs WHERE key = 'app_config'");
    if (!checkConfig || checkConfig.length === 0 || checkConfig[0].values.length === 0) {
      if (fs.existsSync(CONFIG_FILE)) {
        try {
          const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
          db.run("INSERT INTO configs (key, value, updatedAt) VALUES ('app_config', ?, datetime('now'))", [raw]);
        } catch (e) {}
      }
    }

    saveDbToDisk();
    return db;
  })();

  return dbReadyPromise;
}

function saveDbToDisk() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Error writing SQLite DB to disk:', err);
  }
}

// Ensure DB is initialized right on startup
getDb();

function getConfig() {
  try {
    if (db) {
      const res = db.exec("SELECT value FROM configs WHERE key = 'app_config'");
      if (res && res.length > 0 && res[0].values.length > 0) {
        return JSON.parse(res[0].values[0][0]);
      }
    }
    // Fallback to JSON file
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading config from SQLite:', err);
  }
  return {};
}

function saveConfig(config) {
  try {
    const jsonStr = JSON.stringify(config, null, 2);
    if (db) {
      db.run("INSERT OR REPLACE INTO configs (key, value, updatedAt) VALUES ('app_config', ?, datetime('now'))", [jsonStr]);
      saveDbToDisk();
    }
    // Also mirror to config.json
    fs.writeFileSync(CONFIG_FILE, jsonStr, 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving config to SQLite:', err);
    return false;
  }
}

function getLogs(limit = 100) {
  try {
    if (db) {
      const stmt = db.prepare("SELECT * FROM delivery_logs ORDER BY timestamp DESC LIMIT :lim");
      stmt.bind({ ':lim': limit });
      const logs = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.response) {
          try { row.response = JSON.parse(row.response); } catch (e) {}
        }
        logs.push(row);
      }
      stmt.free();
      return logs;
    }
  } catch (err) {
    console.error('Error getting logs from SQLite:', err);
  }
  return [];
}

function addLog(entry) {
  const logItem = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...entry
  };

  try {
    if (db) {
      db.run(`
        INSERT INTO delivery_logs (id, timestamp, type, shift, status, target, messageText, statusCode, response, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        logItem.id,
        logItem.timestamp,
        logItem.type || 'AUTO',
        logItem.shift || '',
        logItem.status || 'UNKNOWN',
        logItem.target || '',
        logItem.messageText || logItem.message || '',
        logItem.statusCode || null,
        typeof logItem.response === 'object' ? JSON.stringify(logItem.response) : (logItem.response || null),
        logItem.error || null
      ]);
      saveDbToDisk();
    }
    return logItem;
  } catch (err) {
    console.error('Error adding log to SQLite:', err);
    return logItem;
  }
}

function getCachedSchedule(sheetName = 'October 2026') {
  try {
    if (db) {
      const res = db.exec("SELECT officersJson, source, updatedAt FROM schedules WHERE sheetName = '" + sheetName.replace(/'/g, "''") + "'");
      if (res && res.length > 0 && res[0].values.length > 0) {
        const [officersJson, source, updatedAt] = res[0].values[0];
        return {
          sheetName,
          officers: JSON.parse(officersJson),
          source: source || 'sqlite_db',
          lastUpdated: updatedAt
        };
      }
    }
  } catch (err) {
    console.error('Error getting schedule from SQLite:', err);
  }
  return null;
}

function saveCachedSchedule(data) {
  try {
    if (db && data && data.sheetName) {
      const officersJson = JSON.stringify(data.officers || []);
      db.run(`
        INSERT OR REPLACE INTO schedules (sheetName, officersJson, source, updatedAt)
        VALUES (?, ?, ?, datetime('now'))
      `, [data.sheetName, officersJson, data.source || 'sqlite_db']);
      saveDbToDisk();
      return true;
    }
  } catch (err) {
    console.error('Error saving schedule to SQLite:', err);
  }
  return false;
}

module.exports = {
  getDb,
  getConfig,
  saveConfig,
  getLogs,
  addLog,
  getCachedSchedule,
  saveCachedSchedule
};
