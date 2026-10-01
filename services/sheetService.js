const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const storage = require('./storageService');

const SCHEDULES_DIR = path.join(__dirname, '..', 'data', 'schedules');
if (!fs.existsSync(SCHEDULES_DIR)) {
  fs.mkdirSync(SCHEDULES_DIR, { recursive: true });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const HARI_INDONESIA = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu'
};

const BULAN_INDONESIA = {
  0: 'Januari',
  1: 'Februari',
  2: 'Maret',
  3: 'April',
  4: 'Mei',
  5: 'Juni',
  6: 'Juli',
  7: 'Agustus',
  8: 'September',
  9: 'Oktober',
  10: 'November',
  11: 'Desember'
};

// Built-in initial sample data from user's October 2026 sheet
const SEED_OFFICERS = [
  { name: 'Doni Abiyantoro', role: 'Chief Accountant', shifts: { 17: 'MOD1', 24: 'MOD1', 31: 'MOD2' } },
  { name: 'Bekti Utami', role: 'Asst. Sales Marketing Manager', shifts: { 3: 'MOD1', 10: 'MOD1' } },
  { name: 'Fajar F', role: 'Chief Engineer', shifts: { 3: 'MOD2', 11: 'MOD1', 18: 'MOD2' } },
  { name: 'Ardhiny', role: 'HR Manager', shifts: { 4: 'MOD2', 11: 'MOD2' } },
  { name: 'Rama', role: 'FO Manager', shifts: { 4: 'MOD1', 25: 'MOD1' } },
  { name: 'Sugiartono', role: 'Bookkeeper', shifts: { 17: 'MOD2', 30: 'MOD' } },
  { name: 'Iqbal', role: 'Junior Sous Chef', shifts: { 1: 'MOD', 24: 'MOD2' } },
  { name: 'Agus Budiono Prastyo', role: 'IT Asst Manager', shifts: { 10: 'MOD2', 29: 'MOD' } },
  { name: 'Lukman Prayogo', role: 'R&B Asst. Manager', shifts: { 2: 'MOD', 25: 'MOD2' } },
  { name: 'Ota Setiawan', role: 'Asst EHK', shifts: { 18: 'MOD1', 31: 'MOD1' } },
  { name: 'Dian Nurkhasanah', role: 'Sales Executive', shifts: { 5: 'MOD', 16: 'MOD' } },
  { name: 'Ayu', role: 'AR/IA', shifts: { 8: 'MOD', 19: 'MOD' } },
  { name: 'Fajar Kuncoro', role: 'Purchasing', shifts: { 7: 'MOD', 20: 'MOD' } },
  { name: 'Hendri D Prayogo', role: 'AP/GC', shifts: { 6: 'MOD', 21: 'MOD' } },
  { name: 'Septi Fira', role: 'Sales Executive', shifts: { 12: 'MOD', 22: 'MOD' } },
  { name: 'Faizin', role: 'ENG Supervisor', shifts: { 9: 'MOD', 23: 'MOD' } },
  { name: 'Guntur', role: 'HK Shift Leader', shifts: { 13: 'MOD', 26: 'MOD' } },
  { name: 'Hendri', role: 'FBP', shifts: { 14: 'MOD', 27: 'MOD' } },
  { name: 'Syahrul', role: 'FBP', shifts: { 15: 'MOD', 28: 'MOD' } }
];

function extractSpreadsheetId(input) {
  if (!input) return '';
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return input.trim();
}

function extractGid(input) {
  if (!input) return null;
  const match = input.match(/gid=([0-9]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      // Handle redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP Status ${res.statusCode}: ${res.statusMessage}`));
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(2500, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function parseCsv(csvText) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let insideQuote = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentVal.trim());
      if (currentRow.some(c => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(c => c !== '')) {
      rows.push(currentRow);
    }
  }
  return rows;
}

function parseSpreadsheetRows(rows, sheetName = 'October 2026') {
  let dateRowIndex = -1;
  let nameCol = 0;
  let roleCol = 1;
  let dateCols = {}; // { colIndex: dayNumber }

  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = rows[r];
    let numMatches = 0;
    row.forEach((cell, idx) => {
      const trimmed = cell.replace(/^0+/, '');
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= 31) {
        numMatches++;
      }
    });
    if (numMatches >= 10) {
      dateRowIndex = r;
      row.forEach((cell, idx) => {
        const trimmed = cell.replace(/^0+/, '');
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= 31) {
          dateCols[idx] = num;
        }
      });
      break;
    }
  }

  const officers = [];

  if (dateRowIndex !== -1) {
    for (let r = dateRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;
      const name = (row[nameCol] || '').trim();
      const role = (row[roleCol] || '').trim();
      
      if (!name || name.toLowerCase().includes('total') || name.toLowerCase().includes('count')) {
        continue;
      }

      const shifts = {};
      Object.keys(dateCols).forEach(colIdx => {
        const day = dateCols[colIdx];
        const val = (row[colIdx] || '').trim().toUpperCase();
        if (val && (val === 'MOD' || val === 'MOD1' || val === 'MOD2' || val.startsWith('MOD'))) {
          shifts[day] = val;
        }
      });

      officers.push({
        name,
        role,
        shifts
      });
    }
  }

  return {
    sheetName,
    officers: officers.length > 0 ? officers : SEED_OFFICERS,
    lastUpdated: new Date().toISOString()
  };
}

function getLocalSchedulePath(sheetName) {
  const safeName = (sheetName || 'October 2026').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(SCHEDULES_DIR, `${safeName}.json`);
}

function loadLocalMonthSchedule(sheetName) {
  const filePath = getLocalSchedulePath(sheetName);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error('Error reading local schedule file:', e);
    }
  }
  return null;
}

function sendHttpsPost(url, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };

    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      // Handle Google Apps Script 302 redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Google redirect requires following GET or POST
        return fetchUrl(res.headers.location).then(body => resolve({ statusCode: 200, body })).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Google Apps Script request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

async function syncToGoogleAppsScript(sheetName, officers) {
  const config = storage.getConfig();
  const scriptUrl = config.spreadsheet && config.spreadsheet.scriptWebhookUrl;

  if (!scriptUrl) {
    return { success: false, reason: 'Script Webhook URL belum diatur di Pengaturan.' };
  }

  try {
    const payload = {
      action: 'save_schedule',
      sheetName,
      officers,
      timestamp: new Date().toISOString()
    };
    const res = await sendHttpsPost(scriptUrl, payload);
    return { success: true, response: res.body };
  } catch (err) {
    console.error('Error syncing to Google Apps Script:', err);
    return { success: false, error: err.message };
  }
}

function saveLocalMonthSchedule(sheetName, data) {
  const filePath = getLocalSchedulePath(sheetName);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    storage.saveCachedSchedule(data);
    
    // Auto sync to Google Apps Script if configured
    syncToGoogleAppsScript(sheetName, data.officers || []).catch(e => {
      console.warn('Background Google Apps Script sync:', e.message);
    });

    return true;
  } catch (e) {
    console.error('Error saving local schedule file:', e);
    return false;
  }
}

async function fetchScheduleFromGoogle(sheetName = null, forceLive = false) {
  const config = storage.getConfig();
  const targetSheet = sheetName || (config.spreadsheet && config.spreadsheet.activeSheetName) || 'October 2026';

  // 1. Jika TIDAK forceLive (misal view dashboard biasa), selalu baca dari SQLite instan (1 ms)
  if (!forceLive) {
    // Coba baca dari SQLite
    const cachedSqlite = storage.getCachedSchedule(targetSheet);
    if (cachedSqlite && cachedSqlite.officers && cachedSqlite.officers.length > 0) {
      return cachedSqlite;
    }

    const localSaved = loadLocalMonthSchedule(targetSheet);
    if (localSaved && localSaved.officers && localSaved.officers.length > 0) {
      return {
        ...localSaved,
        source: localSaved.source || 'sqlite_db',
        sheetName: targetSheet
      };
    }

    // Jika belum ada jadwal sama sekali untuk bulan ini, gunakan master active officers atau seed
    const activeMasters = storage.getAllOfficers(true);
    if (activeMasters && activeMasters.length > 0) {
      const initialFromMasters = {
        sheetName: targetSheet,
        officers: activeMasters.map(o => ({ name: o.name, role: o.role, shifts: {} })),
        lastUpdated: new Date().toISOString(),
        source: 'sqlite_db'
      };
      saveLocalMonthSchedule(targetSheet, initialFromMasters);
      return initialFromMasters;
    }

    const seedData = {
      sheetName: targetSheet,
      officers: SEED_OFFICERS,
      lastUpdated: new Date().toISOString(),
      source: 'seed_initial'
    };
    saveLocalMonthSchedule(targetSheet, seedData);
    return seedData;
  }

  // 2. Jika forceLive === true (tombol Sync ditekan), lakukan live fetch dari Google Sheets
  const rawInput = (config.spreadsheet && (config.spreadsheet.sheetUrl || config.spreadsheet.spreadsheetId)) || '';
  const spreadsheetId = extractSpreadsheetId(rawInput);
  const gid = extractGid(rawInput);
  let errorMsg = null;

  if (spreadsheetId) {
    const urlsToTry = [];
    if (gid) {
      urlsToTry.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`);
    }
    urlsToTry.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(targetSheet)}`);

    for (const url of urlsToTry) {
      try {
        const csv = await fetchUrl(url);
        if (csv && csv.length > 50 && !csv.includes('<!DOCTYPE html>')) {
          const rows = parseCsv(csv);
          const parsed = parseSpreadsheetRows(rows, targetSheet);
          parsed.source = 'live_google_sheet';
          saveLocalMonthSchedule(targetSheet, parsed);
          return parsed;
        }
      } catch (err) {
        errorMsg = err.message;
      }
    }
  }

  // Fallback jika sync gagal
  const existing = loadLocalMonthSchedule(targetSheet) || { sheetName: targetSheet, officers: SEED_OFFICERS, source: 'cached_data' };
  existing.syncWarning = errorMsg ? `Google Sheet belum dapat dijangkau (${errorMsg}). Menggunakan data SQLite lokal.` : null;
  return existing;
}

function generateSmartSchedule(officersList, monthName = 'October', year = 2026) {
  const monthIdx = MONTH_NAMES.indexOf(monthName) !== -1 ? MONTH_NAMES.indexOf(monthName) : 9;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const officers = (officersList && officersList.length > 0) ? officersList.map(o => ({
    name: o.name,
    role: o.role || 'Officer',
    shifts: {}
  })) : SEED_OFFICERS.map(o => ({
    name: o.name,
    role: o.role,
    shifts: {}
  }));

  let officerIndex = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, monthIdx, d);
    const dayOfWeek = dateObj.getDay();

    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    if (isWeekend) {
      const off1 = officers[officerIndex % officers.length];
      off1.shifts[d] = 'MOD1';
      officerIndex++;

      const off2 = officers[officerIndex % officers.length];
      off2.shifts[d] = 'MOD2';
      officerIndex++;
    } else {
      const off = officers[officerIndex % officers.length];
      off.shifts[d] = 'MOD';
      officerIndex++;
    }
  }

  return {
    sheetName: `${monthName} ${year}`,
    officers,
    lastUpdated: new Date().toISOString(),
    source: 'app_database'
  };
}

function exportScheduleToCsv(scheduleData) {
  const officers = scheduleData.officers || [];
  let csv = `Schedule MOD ${scheduleData.sheetName || 'October 2026'}\n`;

  let row1 = ['Name', 'Role'];
  let row2 = ['Day', 'Position'];

  for (let d = 1; d <= 31; d++) {
    row1.push(`Day`);
    row2.push(String(d).padStart(2, '0'));
  }
  row2.push('Count');

  csv += row1.join(',') + '\n';
  csv += row2.join(',') + '\n';

  officers.forEach(o => {
    let row = [`"${o.name}"`, `"${o.role}"`];
    let count = 0;
    for (let d = 1; d <= 31; d++) {
      const s = (o.shifts && o.shifts[d]) || '';
      if (s) count++;
      row.push(s);
    }
    row.push(count);
    csv += row.join(',') + '\n';
  });

  return csv;
}

function getDutyForDate(scheduleData, targetDate = new Date()) {
  let day, dayOfWeek, monthIdx, year;

  if (typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())) {
    const [y, m, d] = targetDate.trim().split('-').map(Number);
    year = y;
    monthIdx = m - 1;
    day = d;
    dayOfWeek = new Date(Date.UTC(year, monthIdx, day)).getUTCDay();
  } else {
    const dObj = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
    const parts = formatter.formatToParts(dObj);
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    day = parseInt(map.day, 10);
    monthIdx = parseInt(map.month, 10) - 1;
    year = parseInt(map.year, 10);
    dayOfWeek = new Date(Date.UTC(year, monthIdx, day)).getUTCDay();
  }

  const hari = HARI_INDONESIA[dayOfWeek] || 'Hari';
  const bulan = BULAN_INDONESIA[monthIdx] || 'Bulan';

  const duty = {
    date: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    day,
    hari,
    bulan,
    tahun: year,
    MOD1: [],
    MOD2: [],
    MOD: [],
    all: []
  };

  const officers = (scheduleData && scheduleData.officers) || SEED_OFFICERS;

  officers.forEach(officer => {
    const shift = officer.shifts ? officer.shifts[day] : null;
    if (shift) {
      const officerInfo = {
        name: officer.name,
        role: officer.role,
        shift
      };

      if (shift === 'MOD1') {
        duty.MOD1.push(officerInfo);
      } else if (shift === 'MOD2') {
        duty.MOD2.push(officerInfo);
      } else if (shift === 'MOD') {
        duty.MOD.push(officerInfo);
      } else {
        duty.MOD.push(officerInfo);
      }
      duty.all.push(officerInfo);
    }
  });

  return duty;
}

module.exports = {
  fetchScheduleFromGoogle,
  saveLocalMonthSchedule,
  loadLocalMonthSchedule,
  generateSmartSchedule,
  exportScheduleToCsv,
  syncToGoogleAppsScript,
  getDutyForDate,
  extractSpreadsheetId,
  extractGid,
  MONTH_NAMES,
  HARI_INDONESIA,
  BULAN_INDONESIA,
  SEED_OFFICERS
};
