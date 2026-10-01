const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const LOGS_FILE = path.join(__dirname, '..', 'data', 'logs.json');
const CACHE_FILE = path.join(__dirname, '..', 'data', 'schedule_cache.json');

// Ensure data folder exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading config:', err);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving config:', err);
    return false;
  }
}

function getLogs(limit = 100) {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
      return logs.slice(0, limit);
    }
  } catch (err) {
    console.error('Error reading logs:', err);
  }
  return [];
}

function addLog(entry) {
  try {
    let logs = [];
    if (fs.existsSync(LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    }
    const logItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...entry
    };
    logs.unshift(logItem);
    // Keep max 500 logs
    if (logs.length > 500) logs = logs.slice(0, 500);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
    return logItem;
  } catch (err) {
    console.error('Error adding log:', err);
  }
}

function getCachedSchedule() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading cache:', err);
  }
  return null;
}

function saveCachedSchedule(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving cached schedule:', err);
    return false;
  }
}

module.exports = {
  getConfig,
  saveConfig,
  getLogs,
  addLog,
  getCachedSchedule,
  saveCachedSchedule
};
