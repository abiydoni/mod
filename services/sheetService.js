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
  { name: 'Doni Abiyantoro', role: 'Chief Accountant', level: 'Manager', shifts: { 17: 'MOD1', 24: 'MOD1', 31: 'MOD2' } },
  { name: 'Bekti Utami', role: 'Asst. Sales Marketing Manager', level: 'Asst Manager', shifts: { 3: 'MOD1', 10: 'MOD1' } },
  { name: 'Fajar F', role: 'Chief Engineer', level: 'Manager', shifts: { 3: 'MOD2', 11: 'MOD1', 18: 'MOD2' } },
  { name: 'Ardhiny', role: 'HR Manager', level: 'Manager', shifts: { 4: 'MOD2', 11: 'MOD2' } },
  { name: 'Rama', role: 'FO Manager', level: 'Manager', shifts: { 4: 'MOD1', 25: 'MOD1' } },
  { name: 'Sugiartono', role: 'Bookkeeper', level: 'Asst Manager', shifts: { 17: 'MOD2', 30: 'MOD' } },
  { name: 'Iqbal', role: 'Junior Sous Chef', level: 'Asst Manager', shifts: { 1: 'MOD', 24: 'MOD2' } },
  { name: 'Agus Budiono Prastyo', role: 'IT Asst Manager', level: 'Asst Manager', shifts: { 10: 'MOD2', 29: 'MOD' } },
  { name: 'Lukman Prayogo', role: 'R&B Asst. Manager', level: 'Asst Manager', shifts: { 2: 'MOD', 25: 'MOD2' } },
  { name: 'Ota Setiawan', role: 'Asst EHK', level: 'Asst Manager', shifts: { 18: 'MOD1', 31: 'MOD1' } },
  { name: 'Dian Nurkhasanah', role: 'Sales Executive', level: 'Supervisor', shifts: { 5: 'MOD', 16: 'MOD' } },
  { name: 'Ayu', role: 'AR/IA', level: 'Supervisor', shifts: { 8: 'MOD', 19: 'MOD' } },
  { name: 'Fajar Kuncoro', role: 'Purchasing', level: 'Supervisor', shifts: { 7: 'MOD', 20: 'MOD' } },
  { name: 'Hendri D Prayogo', role: 'AP/GC', level: 'Supervisor', shifts: { 6: 'MOD', 21: 'MOD' } },
  { name: 'Septi Fira', role: 'Sales Executive', level: 'Supervisor', shifts: { 12: 'MOD', 22: 'MOD' } },
  { name: 'Faizin', role: 'ENG Supervisor', level: 'Supervisor', shifts: { 9: 'MOD', 23: 'MOD' } },
  { name: 'Guntur', role: 'HK Shift Leader', level: 'Supervisor', shifts: { 13: 'MOD', 26: 'MOD' } },
  { name: 'Hendri', role: 'FBP', level: 'Supervisor', shifts: { 14: 'MOD', 27: 'MOD' } },
  { name: 'Syahrul', role: 'FBP', level: 'Supervisor', shifts: { 15: 'MOD', 28: 'MOD' } }
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
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Request timeout (8s)'));
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

      const masterMap = {};
      const allMasters = storage.getAllOfficers();
      allMasters.forEach(m => {
        masterMap[m.name.toLowerCase().trim()] = m.level || 'Supervisor';
      });

      officers.push({
        name,
        role,
        level: masterMap[name.toLowerCase()] || 'Supervisor',
        shifts
      });
    }
  }

  const finalOfficers = officers.length > 0 ? storage.sortOfficersByLevel(officers) : SEED_OFFICERS;

  return {
    sheetName,
    officers: finalOfficers,
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
    return true;
  } catch (e) {
    console.error('Error saving local schedule file:', e);
    return false;
  }
}

function getCandidateSheetNames(targetSheet) {
  const candidates = new Set();
  candidates.add(targetSheet);

  const monthEnToId = {
    'January': 'Januari', 'February': 'Februari', 'March': 'Maret', 'April': 'April',
    'May': 'Mei', 'June': 'Juni', 'July': 'Juli', 'August': 'Agustus',
    'September': 'September', 'October': 'Oktober', 'November': 'November', 'December': 'Desember'
  };

  const monthIdToEn = {};
  Object.entries(monthEnToId).forEach(([en, id]) => { monthIdToEn[id] = en; });

  const parts = targetSheet.split(' ');
  if (parts.length >= 2) {
    const m = parts[0];
    const y = parts[1];
    if (monthEnToId[m]) {
      candidates.add(`${monthEnToId[m]} ${y}`);
      candidates.add(m);
      candidates.add(monthEnToId[m]);
    }
    if (monthIdToEn[m]) {
      candidates.add(`${monthIdToEn[m]} ${y}`);
      candidates.add(m);
      candidates.add(monthIdToEn[m]);
    }
  } else if (parts.length === 1) {
    const m = parts[0];
    if (monthEnToId[m]) candidates.add(monthEnToId[m]);
    if (monthIdToEn[m]) candidates.add(monthIdToEn[m]);
  }

  return Array.from(candidates);
}

function countScheduleShifts(schedule) {
  if (!schedule || !Array.isArray(schedule.officers)) return 0;
  let count = 0;
  schedule.officers.forEach(o => {
    if (o.shifts && typeof o.shifts === 'object') {
      count += Object.keys(o.shifts).length;
    }
  });
  return count;
}

let cachedTabsMap = { id: null, tabs: {}, lastFetched: 0 };

async function getSpreadsheetTabsMap(spreadsheetId, force = false) {
  const now = Date.now();
  if (!force && cachedTabsMap.id === spreadsheetId && (now - cachedTabsMap.lastFetched) < 120000 && Object.keys(cachedTabsMap.tabs).length > 0) {
    return cachedTabsMap.tabs;
  }

  const map = {};
  try {
    const html = await fetchUrl(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`);
    const regex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:[^}]+gid:\s*"([0-9]+)"/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const name = m[1].trim();
      const gid = m[2].trim();
      map[name.toLowerCase()] = gid;
    }
    if (Object.keys(map).length > 0) {
      cachedTabsMap = { id: spreadsheetId, tabs: map, lastFetched: now };
    }
  } catch (e) {
    console.warn('Could not discover sheet tabs map from htmlview:', e.message);
  }
  return map;
}

async function fetchScheduleFromGoogle(sheetName = null, forceLive = false) {
  const config = storage.getConfig();
  const targetSheet = sheetName || (config.spreadsheet && config.spreadsheet.activeSheetName) || 'October 2026';

  // 1. Check local cache (SQLite or local JSON file)
  const cachedSqlite = storage.getCachedSchedule(targetSheet);
  const localSaved = loadLocalMonthSchedule(targetSheet);
  const existingLocal = (cachedSqlite && countScheduleShifts(cachedSqlite) > 0)
    ? cachedSqlite
    : ((localSaved && countScheduleShifts(localSaved) > 0) ? localSaved : null);

  // If NOT forceLive and we already have a populated local schedule with shifts, return immediately
  if (!forceLive && existingLocal) {
    return {
      ...existingLocal,
      source: existingLocal.source || 'sqlite_db',
      sheetName: targetSheet
    };
  }

  // 2. Fetch live from Google Sheets if forceLive OR if local schedule has no shifts yet
  const rawInput = (config.spreadsheet && (config.spreadsheet.sheetUrl || config.spreadsheet.spreadsheetId)) || '';
  const spreadsheetId = extractSpreadsheetId(rawInput);
  const gid = extractGid(rawInput);
  let errorMsg = null;

  if (spreadsheetId) {
    const candidateNames = getCandidateSheetNames(targetSheet);
    const tabsMap = await getSpreadsheetTabsMap(spreadsheetId, forceLive);
    const urlsToTry = [];

    // 1. First priority: Exact GID matched from discovered spreadsheet tabs (100% reliable CSV export)
    for (const cName of candidateNames) {
      const matchedGid = tabsMap[cName.toLowerCase()];
      if (matchedGid) {
        urlsToTry.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${matchedGid}`);
      }
    }

    // 2. Second priority: GID in user config URL if targetSheet matches activeSheetName
    if (gid && (!sheetName || targetSheet === config.spreadsheet?.activeSheetName)) {
      urlsToTry.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`);
    }

    // 3. Fallback: GViz query URLs
    candidateNames.forEach(cName => {
      urlsToTry.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cName)}`);
    });

    for (const url of urlsToTry) {
      try {
        const csv = await fetchUrl(url);
        if (csv && csv.length > 50 && !csv.includes('<!DOCTYPE html>')) {
          const rows = parseCsv(csv);
          const parsed = parseSpreadsheetRows(rows, targetSheet);
          if (parsed && parsed.officers && parsed.officers.length > 0 && countScheduleShifts(parsed) > 0) {
            parsed.source = 'live_google_sheet';
            saveLocalMonthSchedule(targetSheet, parsed);
            return parsed;
          }
        }
      } catch (err) {
        errorMsg = err.message;
      }
    }
  }

  // 3. Fallback: if Google Sheet fetch was not successful, use existing local or initialize
  if (existingLocal) {
    existingLocal.syncWarning = errorMsg ? `Google Sheet belum dapat dijangkau (${errorMsg}). Menggunakan data lokal.` : null;
    return existingLocal;
  }

  if (localSaved && localSaved.officers && localSaved.officers.length > 0) {
    return { ...localSaved, source: 'sqlite_db', sheetName: targetSheet };
  }

  const activeMasters = storage.getAllOfficers(true);
  if (activeMasters && activeMasters.length > 0) {
    const initialFromMasters = {
      sheetName: targetSheet,
      officers: storage.sortOfficersByLevel(activeMasters.map(o => ({
        name: o.name,
        role: o.role,
        level: o.level || 'Supervisor',
        shifts: {}
      }))),
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

function generateSmartSchedule(officersList, monthName = 'October', year = 2026) {
  const monthIdx = MONTH_NAMES.indexOf(monthName) !== -1 ? MONTH_NAMES.indexOf(monthName) : 9;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  // 1. Determine Previous Month & Year to read previous duty spacing
  let prevMonthIdx = monthIdx - 1;
  let prevYear = year;
  if (prevMonthIdx < 0) {
    prevMonthIdx = 11;
    prevYear = year - 1;
  }
  const prevMonthName = MONTH_NAMES[prevMonthIdx];
  const prevSheetName = `${prevMonthName} ${prevYear}`;
  const prevDaysInMonth = new Date(prevYear, prevMonthIdx + 1, 0).getDate();

  // 2. Fetch previous month schedule (from cache / sqlite / disk)
  let prevSchedule = storage.getCachedSchedule(prevSheetName);
  if (!prevSchedule || !prevSchedule.officers || prevSchedule.officers.length === 0) {
    prevSchedule = loadLocalMonthSchedule(prevSheetName);
  }

  // Build map of last duty in previous month: { officerNameLower: relativeTimelineIndex }
  const prevDutyMap = {};
  if (prevSchedule && Array.isArray(prevSchedule.officers)) {
    prevSchedule.officers.forEach(po => {
      const nameKey = (po.name || '').toLowerCase().trim();
      let maxD = -1;
      if (po.shifts) {
        Object.keys(po.shifts).forEach(d => {
          const num = parseInt(d, 10);
          if (num > maxD) maxD = num;
        });
      }
      if (maxD > 0) {
        // relative timeline index (e.g. Day 31 in 31-day month = 0, Day 30 = -1, Day 10 = -21)
        prevDutyMap[nameKey] = maxD - prevDaysInMonth;
      }
    });
  }

  // Master level map
  const masterLevelMap = {};
  const allMasters = storage.getAllOfficers();
  allMasters.forEach(m => {
    masterLevelMap[(m.name || '').toLowerCase().trim()] = m.level || 'Supervisor';
  });

  // 3. Prepare base officers with hierarchy sorting
  const baseOfficers = (officersList && officersList.length > 0) ? officersList.map(o => ({
    name: o.name,
    role: o.role || 'Officer',
    level: masterLevelMap[(o.name || '').toLowerCase().trim()] || o.level || 'Supervisor',
    shifts: {}
  })) : allMasters.filter(m => m.isActive === 1 || m.isActive === true).map(o => ({
    name: o.name,
    role: o.role,
    level: o.level || 'Supervisor',
    shifts: {}
  }));

  const sortedBase = storage.sortOfficersByLevel(baseOfficers);

  // 4. Initialize scheduling state for each officer
  const schedulingState = sortedBase.map((o, idx) => {
    const nameKey = (o.name || '').toLowerCase().trim();
    // If found in prev month, use actual gap. Otherwise initialize based on hierarchy order
    const initialTimeline = prevDutyMap[nameKey] !== undefined ? prevDutyMap[nameKey] : (-100 - idx);
    const weight = storage.getLevelWeight ? storage.getLevelWeight(o.level) : 3;

    return {
      name: o.name,
      role: o.role,
      level: o.level || 'Supervisor',
      levelWeight: weight,
      lastTimeline: initialTimeline,
      shifts: {},
      totalCount: 0,
      weekendCount: 0,
      weekdayCount: 0
    };
  });

  // 5. Day-by-day Fair Spacing Assignment
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, monthIdx, d);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    // Shifts required today
    const requiredShifts = isWeekend ? ['MOD1', 'MOD2'] : ['MOD'];
    const assignedToday = new Set();

    for (const shiftName of requiredShifts) {
      // Filter candidates who haven't worked today and didn't work on consecutive previous day (d - 1)
      let candidates = schedulingState.filter(s => {
        if (assignedToday.has(s.name)) return false;
        if (s.lastTimeline === d - 1) return false; // Prevent back-to-back consecutive duty days
        return true;
      });

      // If all candidates worked yesterday (only in extreme cases with tiny team), relax constraint
      if (candidates.length === 0) {
        candidates = schedulingState.filter(s => !assignedToday.has(s.name));
      }

      // Sort candidates by fairness and rest distance (spacing)
      candidates.sort((a, b) => {
        // 1. Total shift count in current month (lowest count first -> equal workload)
        if (a.totalCount !== b.totalCount) {
          return a.totalCount - b.totalCount;
        }

        // 2. Rest gap since last duty (longest rest first -> fair spacing across month border)
        const gapA = d - a.lastTimeline;
        const gapB = d - b.lastTimeline;
        if (gapA !== gapB) {
          return gapB - gapA;
        }

        // 3. Shift type balance (Weekend vs Weekday balance)
        if (isWeekend && a.weekendCount !== b.weekendCount) {
          return a.weekendCount - b.weekendCount;
        }
        if (!isWeekend && a.weekdayCount !== b.weekdayCount) {
          return a.weekdayCount - b.weekdayCount;
        }

        // 4. Hierarchy level weight (Manager -> Asst Manager -> Supervisor)
        if (a.levelWeight !== b.levelWeight) {
          return a.levelWeight - b.levelWeight;
        }

        return a.name.localeCompare(b.name);
      });

      const chosen = candidates[0];
      if (chosen) {
        chosen.shifts[d] = shiftName;
        chosen.lastTimeline = d;
        chosen.totalCount++;
        if (isWeekend) chosen.weekendCount++; else chosen.weekdayCount++;
        assignedToday.add(chosen.name);
      }
    }
  }

  // 6. Map back to clean officer objects sorted by level
  const finalOfficers = sortedBase.map(b => {
    const found = schedulingState.find(s => s.name.toLowerCase() === b.name.toLowerCase());
    return {
      name: b.name,
      role: b.role,
      level: b.level || 'Supervisor',
      shifts: found ? found.shifts : {}
    };
  });

  return {
    sheetName: `${monthName} ${year}`,
    officers: storage.sortOfficersByLevel(finalOfficers),
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

async function testSheetConnection({ sheetUrl, scriptWebhookUrl, sheetName = 'October 2026' }) {
  const urlToUse = sheetUrl || (storage.getConfig().spreadsheet && storage.getConfig().spreadsheet.sheetUrl) || '';
  const spreadsheetId = extractSpreadsheetId(urlToUse);
  const gid = extractGid(urlToUse);

  if (!spreadsheetId && !scriptWebhookUrl) {
    return {
      success: false,
      connected: false,
      error: 'URL Spreadsheet atau Webhook belum dimasukkan.'
    };
  }

  // 1. Test Direct CSV Fetch from GDrive
  if (spreadsheetId) {
    const urlsToTry = [];
    if (gid) {
      urlsToTry.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`);
    }
    urlsToTry.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`);

    for (const url of urlsToTry) {
      try {
        const csv = await fetchUrl(url);
        if (csv && csv.length > 50 && !csv.includes('<!DOCTYPE html>')) {
          const rows = parseCsv(csv);
          const parsed = parseSpreadsheetRows(rows, sheetName);
          parsed.source = 'live_google_sheet';
          saveLocalMonthSchedule(sheetName, parsed);
          return {
            success: true,
            connected: true,
            method: 'Direct Google Drive Link',
            sheetName,
            spreadsheetId,
            officersCount: parsed.officers.length,
            message: `Koneksi Google Sheets Berhasil! Terbaca ${parsed.officers.length} petugas dinas.`
          };
        }
      } catch (err) {}
    }
  }

  // 2. Test Google Apps Script Webhook (for Private Sheets)
  const webhook = scriptWebhookUrl || (storage.getConfig().spreadsheet && storage.getConfig().spreadsheet.scriptWebhookUrl);
  if (webhook) {
    try {
      const res = await sendHttpsPost(webhook, { action: 'ping', sheetName });
      if (res && (res.statusCode === 200 || res.statusCode === 302)) {
        return {
          success: true,
          connected: true,
          method: 'Google Apps Script Webhook (Spreadsheet Privat)',
          sheetName,
          officersCount: 0,
          message: 'Koneksi ke Webhook Apps Script Berhasil!'
        };
      }
    } catch (e) {
      console.warn('Webhook test failed:', e.message);
    }
  }

  return {
    success: false,
    connected: false,
    error: 'Google Sheet saat ini berstatus Dibatasi (Restricted). Agar web dapat membaca data tanpa error 404, ubah Akses Umum di menu Bagikan menjadi "Siapa saja yang memiliki link" (Anyone with the link), atau pasang Google Apps Script Webhook (Opsi B).',
    spreadsheetId,
    sheetName
  };
}

module.exports = {
  fetchScheduleFromGoogle,
  saveLocalMonthSchedule,
  loadLocalMonthSchedule,
  generateSmartSchedule,
  exportScheduleToCsv,
  syncToGoogleAppsScript,
  getDutyForDate,
  testSheetConnection,
  extractSpreadsheetId,
  extractGid,
  MONTH_NAMES,
  HARI_INDONESIA,
  BULAN_INDONESIA,
  SEED_OFFICERS
};
