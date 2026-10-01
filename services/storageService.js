const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEDULES_DIR = path.join(DATA_DIR, 'schedules');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SCHEDULES_DIR)) {
  fs.mkdirSync(SCHEDULES_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const OFFICERS_FILE = path.join(DATA_DIR, 'officers.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// In-Memory Cache for ultra-fast (sub-millisecond) response
let cachedConfig = null;
let cachedOfficers = null;
let cachedLogs = null;

// Initial Officers Seed
const INITIAL_OFFICERS = [
  { id: 1, name: 'Doni Abiyantoro', role: 'Chief Accountant', phone: '', isActive: 1 },
  { id: 2, name: 'Bekti Utami', role: 'Asst. Sales Marketing Manager', phone: '', isActive: 1 },
  { id: 3, name: 'Fajar F', role: 'Chief Engineer', phone: '', isActive: 1 },
  { id: 4, name: 'Ardhiny', role: 'HR Manager', phone: '', isActive: 1 },
  { id: 5, name: 'Rama', role: 'FO Manager', phone: '', isActive: 1 },
  { id: 6, name: 'Sugiartono', role: 'Bookkeeper', phone: '', isActive: 1 },
  { id: 7, name: 'Iqbal', role: 'Junior Sous Chef', phone: '', isActive: 1 },
  { id: 8, name: 'Agus Budiono Prastyo', role: 'IT Asst Manager', phone: '', isActive: 1 },
  { id: 9, name: 'Lukman Prayogo', role: 'R&B Asst. Manager', phone: '', isActive: 1 },
  { id: 10, name: 'Ota Setiawan', role: 'Asst EHK', phone: '', isActive: 1 },
  { id: 11, name: 'Dian Nurkhasanah', role: 'Sales Executive', phone: '', isActive: 1 },
  { id: 12, name: 'Ayu', role: 'AR/IA', phone: '', isActive: 1 },
  { id: 13, name: 'Fajar Kuncoro', role: 'Purchasing', phone: '', isActive: 1 },
  { id: 14, name: 'Hendri D Prayogo', role: 'AP/GC', phone: '', isActive: 1 },
  { id: 15, name: 'Septi Fira', role: 'Sales Executive', phone: '', isActive: 1 },
  { id: 16, name: 'Faizin', role: 'ENG Supervisor', phone: '', isActive: 1 },
  { id: 17, name: 'Guntur', role: 'HK Shift Leader', phone: '', isActive: 1 },
  { id: 18, name: 'Hendri', role: 'FBP', phone: '', isActive: 1 },
  { id: 19, name: 'Syahrul', role: 'FBP', phone: '', isActive: 1 }
];

// Initialize Officers file if not exists
function initOfficers() {
  if (!fs.existsSync(OFFICERS_FILE)) {
    try {
      fs.writeFileSync(OFFICERS_FILE, JSON.stringify(INITIAL_OFFICERS, null, 2), 'utf8');
      cachedOfficers = [...INITIAL_OFFICERS];
    } catch (e) {
      console.error('Error writing initial officers:', e);
      cachedOfficers = [...INITIAL_OFFICERS];
    }
  } else {
    try {
      cachedOfficers = JSON.parse(fs.readFileSync(OFFICERS_FILE, 'utf8'));
    } catch (e) {
      cachedOfficers = [...INITIAL_OFFICERS];
    }
  }
}
initOfficers();

// 1. Config
function getConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      cachedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return cachedConfig;
    }
  } catch (err) {
    console.error('Error reading config.json:', err);
  }
  return {};
}

function saveConfig(config) {
  try {
    cachedConfig = config;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving config.json:', err);
    return false;
  }
}

// 2. Delivery Logs
function getLogs(limit = 100) {
  if (!cachedLogs) {
    try {
      if (fs.existsSync(LOGS_FILE)) {
        cachedLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
      } else {
        cachedLogs = [];
      }
    } catch (err) {
      console.error('Error reading logs.json:', err);
      cachedLogs = [];
    }
  }
  return cachedLogs.slice(0, limit);
}

function addLog(entry) {
  const logItem = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...entry
  };

  if (!cachedLogs) {
    getLogs(100);
  }

  cachedLogs.unshift(logItem);
  if (cachedLogs.length > 500) {
    cachedLogs = cachedLogs.slice(0, 500);
  }

  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(cachedLogs, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing logs.json:', err);
  }

  return logItem;
}

// 3. Schedules Cache
function getCachedSchedule(sheetName = 'October 2026') {
  try {
    const filename = `${sheetName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    const filePath = path.join(SCHEDULES_DIR, filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading cached schedule:', err);
  }
  return null;
}

function saveCachedSchedule(data) {
  try {
    if (data && data.sheetName) {
      const filename = `${data.sheetName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      const filePath = path.join(SCHEDULES_DIR, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    }
  } catch (err) {
    console.error('Error saving cached schedule:', err);
  }
  return false;
}

// 4. Master Officers
function getAllOfficers(onlyActive = false) {
  if (!cachedOfficers) {
    initOfficers();
  }
  if (onlyActive) {
    return cachedOfficers.filter(o => o.isActive === 1 || o.isActive === true);
  }
  return [...cachedOfficers].sort((a, b) => a.name.localeCompare(b.name));
}

function addOfficer({ name, role, phone = '', isActive = 1 }) {
  if (!name || !role) {
    return { success: false, error: 'Nama dan Jabatan wajib diisi' };
  }
  if (!cachedOfficers) initOfficers();

  const trimmedName = name.trim();
  if (cachedOfficers.some(o => o.name.toLowerCase() === trimmedName.toLowerCase())) {
    return { success: false, error: `Petugas "${trimmedName}" sudah ada dalam data!` };
  }

  const nextId = cachedOfficers.length > 0 ? Math.max(...cachedOfficers.map(o => o.id || 0)) + 1 : 1;
  const newOfficer = {
    id: nextId,
    name: trimmedName,
    role: role.trim(),
    phone: (phone || '').trim(),
    isActive: isActive ? 1 : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  cachedOfficers.push(newOfficer);
  try {
    fs.writeFileSync(OFFICERS_FILE, JSON.stringify(cachedOfficers, null, 2), 'utf8');
    return { success: true, message: `Petugas "${trimmedName}" berhasil ditambahkan!` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateOfficer(id, { name, role, phone = '', isActive = 1 }) {
  if (!cachedOfficers) initOfficers();
  const numId = Number(id);
  const index = cachedOfficers.findIndex(o => o.id === numId);
  if (index === -1) {
    return { success: false, error: 'Petugas tidak ditemukan' };
  }

  cachedOfficers[index] = {
    ...cachedOfficers[index],
    name: name ? name.trim() : cachedOfficers[index].name,
    role: role ? role.trim() : cachedOfficers[index].role,
    phone: phone !== undefined ? String(phone).trim() : cachedOfficers[index].phone,
    isActive: isActive !== undefined ? (isActive ? 1 : 0) : cachedOfficers[index].isActive,
    updatedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(OFFICERS_FILE, JSON.stringify(cachedOfficers, null, 2), 'utf8');
    return { success: true, message: 'Data petugas berhasil diperbarui!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteOfficer(id) {
  if (!cachedOfficers) initOfficers();
  const numId = Number(id);
  const initialLen = cachedOfficers.length;
  cachedOfficers = cachedOfficers.filter(o => o.id !== numId);

  if (cachedOfficers.length === initialLen) {
    return { success: false, error: 'Petugas tidak ditemukan' };
  }

  try {
    fs.writeFileSync(OFFICERS_FILE, JSON.stringify(cachedOfficers, null, 2), 'utf8');
    return { success: true, message: 'Petugas berhasil dihapus dari master data!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getDb() {
  return null;
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
