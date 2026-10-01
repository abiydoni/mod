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

    // Master Table Officers / Karyawan
    db.run(`
      CREATE TABLE IF NOT EXISTS officers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        phone TEXT DEFAULT '',
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
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

    // Seed Master Officers if table is empty
    const checkOfficers = db.exec("SELECT count(*) FROM officers");
    if (!checkOfficers || checkOfficers.length === 0 || checkOfficers[0].values[0][0] === 0) {
      const initialOfficers = [
        { name: 'Doni Abiyantoro', role: 'Chief Accountant' },
        { name: 'Bekti Utami', role: 'Asst. Sales Marketing Manager' },
        { name: 'Fajar F', role: 'Chief Engineer' },
        { name: 'Ardhiny', role: 'HR Manager' },
        { name: 'Rama', role: 'FO Manager' },
        { name: 'Sugiartono', role: 'Bookkeeper' },
        { name: 'Iqbal', role: 'Junior Sous Chef' },
        { name: 'Agus Budiono Prastyo', role: 'IT Asst Manager' },
        { name: 'Lukman Prayogo', role: 'R&B Asst. Manager' },
        { name: 'Ota Setiawan', role: 'Asst EHK' },
        { name: 'Dian Nurkhasanah', role: 'Sales Executive' },
        { name: 'Ayu', role: 'AR/IA' },
        { name: 'Fajar Kuncoro', role: 'Purchasing' },
        { name: 'Hendri D Prayogo', role: 'AP/GC' },
        { name: 'Septi Fira', role: 'Sales Executive' },
        { name: 'Faizin', role: 'ENG Supervisor' },
        { name: 'Guntur', role: 'HK Shift Leader' },
        { name: 'Hendri', role: 'FBP' },
        { name: 'Syahrul', role: 'FBP' }
      ];

      initialOfficers.forEach(o => {
        try {
          db.run("INSERT OR IGNORE INTO officers (name, role, phone, isActive) VALUES (?, ?, '', 1)", [o.name, o.role]);
        } catch (err) {}
      });
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
      // 1. Simpan objek konfigurasi lengkap
      db.run("INSERT OR REPLACE INTO configs (key, value, updatedAt) VALUES ('app_config', ?, datetime('now'))", [jsonStr]);

      // 2. Simpan juga per parameter individual agar mudah di-query secara langsung
      const entries = [
        ['sheet_url', config.spreadsheet?.sheetUrl || ''],
        ['sheet_id', config.spreadsheet?.spreadsheetId || ''],
        ['script_webhook_url', config.spreadsheet?.scriptWebhookUrl || ''],
        ['active_sheet_name', config.spreadsheet?.activeSheetName || 'October 2026'],
        ['wa_api_url', config.waGateway?.apiUrl || ''],
        ['wa_api_key', config.waGateway?.apiKey || ''],
        ['wa_session_id', config.waGateway?.sessionId || ''],
        ['wa_target_number', config.waGateway?.targetNumber || ''],
        ['wa_enabled', config.waGateway?.enabled ? '1' : '0'],
        ['time_mod1', config.schedules?.MOD1?.time || '09:00'],
        ['time_mod2', config.schedules?.MOD2?.time || '16:00'],
        ['time_mod', config.schedules?.MOD?.time || '18:00'],
        ['template_mod1', config.messageTemplates?.MOD1 || ''],
        ['template_mod2', config.messageTemplates?.MOD2 || ''],
        ['template_mod', config.messageTemplates?.MOD || ''],
        ['template_all', config.messageTemplates?.ALL || '']
      ];

      entries.forEach(([k, v]) => {
        db.run("INSERT OR REPLACE INTO configs (key, value, updatedAt) VALUES (?, ?, datetime('now'))", [k, String(v)]);
      });

      saveDbToDisk();
    }
    // Mirror ke config.json sebagai backup
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

function getAllOfficers(onlyActive = false) {
  try {
    if (db) {
      const sql = onlyActive
        ? "SELECT * FROM officers WHERE isActive = 1 ORDER BY name ASC"
        : "SELECT * FROM officers ORDER BY name ASC";
      const stmt = db.prepare(sql);
      const list = [];
      while (stmt.step()) {
        list.push(stmt.getAsObject());
      }
      stmt.free();
      return list;
    }
  } catch (err) {
    console.error('Error getting officers from SQLite:', err);
  }
  return [];
}

function addOfficer({ name, role, phone = '', isActive = 1 }) {
  try {
    if (db && name && role) {
      db.run(`
        INSERT INTO officers (name, role, phone, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [name.trim(), role.trim(), (phone || '').trim(), isActive ? 1 : 0]);
      saveDbToDisk();
      return { success: true, message: `Petugas "${name}" berhasil ditambahkan!` };
    }
  } catch (err) {
    console.error('Error adding officer to SQLite:', err);
    return { success: false, error: err.message };
  }
  return { success: false, error: 'Nama dan Jabatan wajib diisi' };
}

function updateOfficer(id, { name, role, phone = '', isActive = 1 }) {
  try {
    if (db && id) {
      db.run(`
        UPDATE officers
        SET name = ?, role = ?, phone = ?, isActive = ?, updatedAt = datetime('now')
        WHERE id = ?
      `, [name.trim(), role.trim(), (phone || '').trim(), isActive ? 1 : 0, id]);
      saveDbToDisk();
      return { success: true, message: `Data petugas berhasil diperbarui!` };
    }
  } catch (err) {
    console.error('Error updating officer in SQLite:', err);
    return { success: false, error: err.message };
  }
  return { success: false, error: 'ID tidak valid' };
}

function deleteOfficer(id) {
  try {
    if (db && id) {
      db.run("DELETE FROM officers WHERE id = ?", [id]);
      saveDbToDisk();
      return { success: true, message: 'Petugas berhasil dihapus dari master data!' };
    }
  } catch (err) {
    console.error('Error deleting officer from SQLite:', err);
    return { success: false, error: err.message };
  }
  return { success: false, error: 'ID tidak valid' };
}

module.exports = {
  getDb,
  getConfig,
  saveConfig,
  getLogs,
  addLog,
  getCachedSchedule,
  saveCachedSchedule,
  getAllOfficers,
  addOfficer,
  updateOfficer,
  deleteOfficer
};
