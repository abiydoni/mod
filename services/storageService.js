const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEDULES_DIR = path.join(DATA_DIR, 'schedules');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SCHEDULES_DIR)) {
  fs.mkdirSync(SCHEDULES_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const OFFICERS_FILE = path.join(DATA_DIR, 'officers.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SWAPS_FILE = path.join(DATA_DIR, 'schedule_swaps.json');
const DISPATCH_HISTORY_FILE = path.join(DATA_DIR, 'dispatch_history.json');
const LOCKS_DIR = path.join(DATA_DIR, 'locks');

if (!fs.existsSync(LOCKS_DIR)) {
  fs.mkdirSync(LOCKS_DIR, { recursive: true });
}

// In-Memory Cache for ultra-fast (sub-millisecond) response
let cachedConfig = null;
let cachedOfficers = null;
let cachedLogs = null;
let cachedUsers = null;
let cachedSwaps = null;

// Multi-Worker Passenger Dispatch Lock & Persistent Tracking
function acquireDispatchLock(lockKey, ttlMs = 60000) {
  const safeKey = lockKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  const lockFile = path.join(LOCKS_DIR, `${safeKey}.lock`);
  try {
    if (fs.existsSync(lockFile)) {
      const stats = fs.statSync(lockFile);
      const age = Date.now() - stats.mtimeMs;
      if (age < ttlMs) {
        return false; // Still held by another worker
      }
      try { fs.unlinkSync(lockFile); } catch (e) {}
    }
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, `${process.pid}_${Date.now()}`);
    fs.closeSync(fd);
    return true;
  } catch (err) {
    return false;
  }
}

function releaseDispatchLock(lockKey) {
  const safeKey = lockKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  const lockFile = path.join(LOCKS_DIR, `${safeKey}.lock`);
  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
  } catch (e) {}
}

function getDispatchHistory() {
  try {
    if (fs.existsSync(DISPATCH_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(DISPATCH_HISTORY_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function isShiftDispatchedToday(shiftKey, dateStr) {
  const history = getDispatchHistory();
  const key = `${dateStr}_${shiftKey}`;
  return !!(history[key] && history[key].success);
}

function recordShiftDispatch(shiftKey, dateStr, result) {
  const history = getDispatchHistory();
  const key = `${dateStr}_${shiftKey}`;
  history[key] = {
    timestamp: new Date().toISOString(),
    timeWib: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    shiftKey,
    date: dateStr,
    success: !!(result && (result.success || result.statusCode === 200 || result.status === 'SUCCESS')),
    pid: process.pid
  };
  try {
    fs.writeFileSync(DISPATCH_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing dispatch_history.json:', e);
  }
}

// Password Hashing using PBKDF2 (Native Node.js crypto, zero dependencies)
function hashPassword(password, salt = null) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, s, 1000, 64, 'sha512').toString('hex');
  return { hash: `${s}:${hash}`, salt: s };
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

// 0. Initialize Users Table
const DEFAULT_USERS = [
  {
    id: 1,
    username: 'admin',
    name: 'Administrator MOD',
    password: hashPassword('admin123').hash,
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function initUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2), 'utf8');
      cachedUsers = [...DEFAULT_USERS];
    } catch (e) {
      console.error('Error writing initial users:', e);
      cachedUsers = [...DEFAULT_USERS];
    }
  } else {
    try {
      cachedUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (!Array.isArray(cachedUsers) || cachedUsers.length === 0) {
        cachedUsers = [...DEFAULT_USERS];
        fs.writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2), 'utf8');
      }
    } catch (e) {
      cachedUsers = [...DEFAULT_USERS];
    }
  }
}
initUsers();

function normalizeLevel(level) {
  if (!level) return 'Supervisor';
  const str = String(level).trim().toLowerCase();
  if (str.includes('asst') || str.includes('ass ') || str.startsWith('ass') || str.includes('assistant')) {
    return 'Asst Manager';
  }
  if (str.includes('manager') || str.includes('chief') || str.includes('mgr')) {
    return 'Manager';
  }
  if (str.includes('supervisor') || str.includes('spv') || str.includes('leader')) {
    return 'Supervisor';
  }
  return 'Supervisor';
}

function getLevelWeight(level) {
  const norm = normalizeLevel(level);
  if (norm === 'Manager') return 1;
  if (norm === 'Asst Manager') return 2;
  if (norm === 'Supervisor') return 3;
  return 4;
}

function sortOfficersByLevel(officers) {
  return [...officers].sort((a, b) => {
    const wA = getLevelWeight(a.level);
    const wB = getLevelWeight(b.level);
    if (wA !== wB) return wA - wB;
    return (a.name || '').localeCompare(b.name || '');
  });
}

// Initial Officers Seed
const INITIAL_OFFICERS = [
  { id: 1, name: 'Doni Abiyantoro', role: 'Chief Accountant', level: 'Manager', phone: '', isActive: 1 },
  { id: 2, name: 'Bekti Utami', role: 'Asst. Sales Marketing Manager', level: 'Asst Manager', phone: '', isActive: 1 },
  { id: 3, name: 'Fajar F', role: 'Chief Engineer', level: 'Manager', phone: '', isActive: 1 },
  { id: 4, name: 'Ardhiny', role: 'HR Manager', level: 'Manager', phone: '', isActive: 1 },
  { id: 5, name: 'Rama', role: 'FO Manager', level: 'Manager', phone: '', isActive: 1 },
  { id: 6, name: 'Sugiartono', role: 'Bookkeeper', level: 'Asst Manager', phone: '', isActive: 1 },
  { id: 7, name: 'Iqbal', role: 'Junior Sous Chef', level: 'Asst Manager', phone: '', isActive: 1 },
  { id: 8, name: 'Agus Budiono Prastyo', role: 'IT Asst Manager', level: 'Asst Manager', phone: '', isActive: 1 },
  { id: 9, name: 'Lukman Prayogo', role: 'R&B Asst. Manager', level: 'Asst Manager', phone: '', isActive: 1 },
  { id: 10, name: 'Ota Setiawan', role: 'Asst EHK', level: 'Asst Manager', phone: '', isActive: 1 },
  { id: 11, name: 'Dian Nurkhasanah', role: 'Sales Executive', level: 'Supervisor', phone: '', isActive: 1 },
  { id: 12, name: 'Ayu', role: 'AR/IA', level: 'Supervisor', phone: '', isActive: 1 },
  { id: 13, name: 'Fajar Kuncoro', role: 'Purchasing', level: 'Supervisor', phone: '', isActive: 1 },
  { id: 14, name: 'Hendri D Prayogo', role: 'AP/GC', level: 'Supervisor', phone: '', isActive: 1 },
  { id: 15, name: 'Septi Fira', role: 'Sales Executive', level: 'Supervisor', phone: '', isActive: 1 },
  { id: 16, name: 'Faizin', role: 'ENG Supervisor', level: 'Supervisor', phone: '', isActive: 1 },
  { id: 17, name: 'Guntur', role: 'HK Shift Leader', level: 'Supervisor', phone: '', isActive: 1 },
  { id: 18, name: 'Hendri', role: 'FBP', level: 'Supervisor', phone: '', isActive: 1 },
  { id: 19, name: 'Syahrul', role: 'FBP', level: 'Supervisor', phone: '', isActive: 1 }
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
      // Auto migrate missing level field if any
      let modified = false;
      cachedOfficers.forEach(o => {
        if (!o.level) {
          const rLower = (o.role || '').toLowerCase();
          if (rLower.includes('asst') || rLower.includes('assistant')) o.level = 'Asst Manager';
          else if (rLower.includes('manager') || rLower.includes('chief')) o.level = 'Manager';
          else o.level = 'Supervisor';
          modified = true;
        }
      });
      if (modified) {
        fs.writeFileSync(OFFICERS_FILE, JSON.stringify(cachedOfficers, null, 2), 'utf8');
      }
    } catch (e) {
      cachedOfficers = [...INITIAL_OFFICERS];
    }
  }
}
initOfficers();

// 1. Config
function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      cachedConfig = data;
      return data;
    } else if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      cachedConfig = data;
      return data;
    }
  } catch (err) {
    console.error('Error reading config:', err);
  }
  return cachedConfig || {};
}

function saveConfig(config) {
  try {
    cachedConfig = config;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
      console.warn('Could not write backup settings.json:', e.message);
    }
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
  try {
    if (fs.existsSync(OFFICERS_FILE)) {
      cachedOfficers = JSON.parse(fs.readFileSync(OFFICERS_FILE, 'utf8'));
    }
  } catch (e) {}
  if (!cachedOfficers) {
    initOfficers();
  }
  let list = cachedOfficers;
  if (onlyActive) {
    list = list.filter(o => o.isActive === 1 || o.isActive === true);
  }
  return sortOfficersByLevel(list);
}

function addOfficer({ name, role, level = 'Supervisor', phone = '', isActive = 1 }) {
  if (!name || !role) {
    return { success: false, error: 'Nama dan Jabatan wajib diisi' };
  }
  try {
    if (fs.existsSync(OFFICERS_FILE)) {
      cachedOfficers = JSON.parse(fs.readFileSync(OFFICERS_FILE, 'utf8'));
    }
  } catch (e) {}
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
    level: normalizeLevel(level),
    phone: (phone || '').trim(),
    isActive: isActive ? 1 : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  cachedOfficers.push(newOfficer);
  try {
    fs.writeFileSync(OFFICERS_FILE, JSON.stringify(cachedOfficers, null, 2), 'utf8');
    return { success: true, message: `Petugas "${trimmedName}" berhasil ditambahkan!`, officer: newOfficer };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateOfficer(id, { name, role, level, phone = '', isActive = 1 }) {
  try {
    if (fs.existsSync(OFFICERS_FILE)) {
      cachedOfficers = JSON.parse(fs.readFileSync(OFFICERS_FILE, 'utf8'));
    }
  } catch (e) {}
  if (!cachedOfficers) initOfficers();
  const numId = Number(id);
  const index = cachedOfficers.findIndex(o => o.id === numId);
  if (index === -1) {
    return { success: false, error: 'Petugas tidak ditemukan' };
  }

  const currentLevel = cachedOfficers[index].level || 'Supervisor';
  const newLevel = level !== undefined ? normalizeLevel(level) : currentLevel;

  cachedOfficers[index] = {
    ...cachedOfficers[index],
    name: name ? name.trim() : cachedOfficers[index].name,
    role: role ? role.trim() : cachedOfficers[index].role,
    level: newLevel,
    phone: phone !== undefined ? String(phone).trim() : cachedOfficers[index].phone,
    isActive: isActive !== undefined ? (isActive ? 1 : 0) : cachedOfficers[index].isActive,
    updatedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(OFFICERS_FILE, JSON.stringify(cachedOfficers, null, 2), 'utf8');
    return { success: true, message: 'Data petugas berhasil diperbarui!', officer: cachedOfficers[index] };
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

// 5. Authentication & User Management
function authenticateUser(username, password) {
  if (!cachedUsers) initUsers();
  if (!username || !password) return null;

  const user = cachedUsers.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) return null;

  const isValid = verifyPassword(password, user.password);
  if (!isValid) return null;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };
}

function getAllUsers() {
  if (!cachedUsers) initUsers();
  return cachedUsers.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  }));
}

function addUser({ username, name, password, role = 'operator' }) {
  if (!cachedUsers) initUsers();
  const uTrim = (username || '').trim();
  const nTrim = (name || '').trim();
  const pTrim = (password || '').trim();

  if (!uTrim || !nTrim || !pTrim) {
    return { success: false, error: 'Username, Nama, dan Password wajib diisi.' };
  }
  if (pTrim.length < 4) {
    return { success: false, error: 'Password minimal 4 karakter.' };
  }

  if (cachedUsers.some(u => u.username.toLowerCase() === uTrim.toLowerCase())) {
    return { success: false, error: `Username "${uTrim}" sudah digunakan.` };
  }

  const nextId = cachedUsers.length > 0 ? Math.max(...cachedUsers.map(u => u.id || 0)) + 1 : 1;
  const newUser = {
    id: nextId,
    username: uTrim,
    name: nTrim,
    password: hashPassword(pTrim).hash,
    role: role === 'admin' ? 'admin' : 'operator',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  cachedUsers.push(newUser);
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(cachedUsers, null, 2), 'utf8');
    return { success: true, message: `Pengguna "${uTrim}" berhasil ditambahkan!`, user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateUser(id, { name, role }) {
  if (!cachedUsers) initUsers();
  const numId = Number(id);
  const idx = cachedUsers.findIndex(u => u.id === numId);
  if (idx === -1) {
    return { success: false, error: 'Pengguna tidak ditemukan.' };
  }

  cachedUsers[idx] = {
    ...cachedUsers[idx],
    name: name ? name.trim() : cachedUsers[idx].name,
    role: role !== undefined ? (role === 'admin' ? 'admin' : 'operator') : cachedUsers[idx].role,
    updatedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(cachedUsers, null, 2), 'utf8');
    return { success: true, message: 'Data pengguna berhasil diperbarui!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function changePassword(userId, currentPassword, newPassword) {
  if (!cachedUsers) initUsers();
  const numId = Number(userId);
  const user = cachedUsers.find(u => u.id === numId);
  if (!user) {
    return { success: false, error: 'Pengguna tidak ditemukan.' };
  }

  if (!verifyPassword(currentPassword, user.password)) {
    return { success: false, error: 'Password saat ini salah!' };
  }

  if (!newPassword || newPassword.trim().length < 4) {
    return { success: false, error: 'Password baru minimal 4 karakter.' };
  }

  user.password = hashPassword(newPassword.trim()).hash;
  user.updatedAt = new Date().toISOString();

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(cachedUsers, null, 2), 'utf8');
    return { success: true, message: 'Password berhasil diubah!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function resetUserPassword(userId, newPassword) {
  if (!cachedUsers) initUsers();
  const numId = Number(userId);
  const user = cachedUsers.find(u => u.id === numId);
  if (!user) {
    return { success: false, error: 'Pengguna tidak ditemukan.' };
  }

  if (!newPassword || newPassword.trim().length < 4) {
    return { success: false, error: 'Password baru minimal 4 karakter.' };
  }

  user.password = hashPassword(newPassword.trim()).hash;
  user.updatedAt = new Date().toISOString();

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(cachedUsers, null, 2), 'utf8');
    return { success: true, message: `Password pengguna "${user.username}" berhasil direset!` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteUser(userId) {
  if (!cachedUsers) initUsers();
  const numId = Number(userId);
  const user = cachedUsers.find(u => u.id === numId);
  if (!user) {
    return { success: false, error: 'Pengguna tidak ditemukan.' };
  }

  const adminCount = cachedUsers.filter(u => u.role === 'admin').length;
  if (user.role === 'admin' && adminCount <= 1) {
    return { success: false, error: 'Tidak dapat menghapus admin utama satu-satunya.' };
  }

  cachedUsers = cachedUsers.filter(u => u.id !== numId);
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(cachedUsers, null, 2), 'utf8');
    return { success: true, message: `Pengguna "${user.username}" berhasil dihapus.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getScheduleSwaps() {
  if (cachedSwaps) return cachedSwaps;
  if (!fs.existsSync(SWAPS_FILE)) {
    cachedSwaps = [];
    return cachedSwaps;
  }
  try {
    cachedSwaps = JSON.parse(fs.readFileSync(SWAPS_FILE, 'utf8'));
    if (!Array.isArray(cachedSwaps)) cachedSwaps = [];
  } catch (e) {
    cachedSwaps = [];
  }
  return cachedSwaps;
}

function saveScheduleSwap(swapRecord) {
  const swaps = getScheduleSwaps();
  swaps.unshift(swapRecord);
  cachedSwaps = swaps;
  try {
    fs.writeFileSync(SWAPS_FILE, JSON.stringify(swaps, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving schedule swap record:', e);
    return false;
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
  deleteOfficer,
  authenticateUser,
  getAllUsers,
  addUser,
  updateUser,
  changePassword,
  resetUserPassword,
  sortOfficersByLevel,
  getLevelWeight,
  deleteUser,
  getScheduleSwaps,
  saveScheduleSwap,
  acquireDispatchLock,
  releaseDispatchLock,
  isShiftDispatchedToday,
  recordShiftDispatch,
  getDispatchHistory
};
