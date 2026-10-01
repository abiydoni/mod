const express = require('express');
const cors = require('cors');
const path = require('path');
const storage = require('./services/storageService');
const sheetService = require('./services/sheetService');
const waService = require('./services/waService');
const scheduler = require('./services/schedulerService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. System Status
app.get('/api/status', (req, res) => {
  const schedulerStatus = scheduler.getSchedulerStatus();
  const config = storage.getConfig();
  res.json({
    status: 'OK',
    app: 'MOD WA Scheduler Web',
    time: schedulerStatus.currentTime,
    scheduler: schedulerStatus,
    gateway: {
      enabled: config.waGateway?.enabled,
      targetNumber: config.waGateway?.targetNumber,
      apiUrl: config.waGateway?.apiUrl
    },
    spreadsheet: {
      id: config.spreadsheet?.spreadsheetId,
      activeSheet: config.spreadsheet?.activeSheetName
    }
  });
});

// 2. Get Current Schedule Data
app.get('/api/schedule/current', async (req, res) => {
  try {
    const sheetName = req.query.sheet;
    const schedule = await sheetService.fetchScheduleFromGoogle(sheetName);
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Duty for a Specific Date
app.get('/api/schedule/duty', async (req, res) => {
  try {
    const dateParam = req.query.date ? new Date(req.query.date) : new Date();
    const sheetName = req.query.sheet;
    const schedule = await sheetService.fetchScheduleFromGoogle(sheetName);
    const duty = sheetService.getDutyForDate(schedule, dateParam);
    res.json({
      duty,
      source: schedule.source,
      lastUpdated: schedule.lastUpdated,
      syncWarning: schedule.syncWarning
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Force Sync Google Sheet
app.post('/api/schedule/sync', async (req, res) => {
  try {
    const sheetName = req.body.sheetName;
    const schedule = await sheetService.fetchScheduleFromGoogle(sheetName, true);
    res.json({
      success: true,
      message: 'Google Sheet disinkronkan.',
      source: schedule.source,
      officersCount: schedule.officers?.length || 0,
      syncWarning: schedule.syncWarning
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4a. Test Google Sheet / Email Connection Check
app.post('/api/sheet/test-connection', async (req, res) => {
  try {
    const { sheetUrl, scriptWebhookUrl, sheetName = 'October 2026' } = req.body;
    const testResult = await sheetService.testSheetConnection({ sheetUrl, scriptWebhookUrl, sheetName });
    res.json(testResult);
  } catch (err) {
    res.status(500).json({ success: false, connected: false, error: err.message });
  }
});

// 4b. Save Custom Schedule (Directly created/edited from the app)
app.post('/api/schedule/save', async (req, res) => {
  try {
    const { sheetName = 'October 2026', officers = [] } = req.body;
    const data = {
      sheetName,
      officers,
      lastUpdated: new Date().toISOString(),
      source: 'app_database'
    };
    const ok = sheetService.saveLocalMonthSchedule(sheetName, data);
    if (ok) {
      res.json({ success: true, message: `Jadwal ${sheetName} berhasil disimpan ke database lokal!` });
    } else {
      res.status(500).json({ success: false, error: 'Gagal menyimpan jadwal.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4c. Generate Smart Auto Schedule
app.post('/api/schedule/generate', async (req, res) => {
  try {
    const { month = 'October', year = 2026, officers = [] } = req.body;
    const generated = sheetService.generateSmartSchedule(officers, month, parseInt(year, 10));
    sheetService.saveLocalMonthSchedule(generated.sheetName, generated);
    res.json({
      success: true,
      message: `Jadwal otomatis untuk ${generated.sheetName} berhasil dibuat!`,
      schedule: generated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4d. Export Schedule as CSV (for Excel / Google Sheets)
app.get('/api/schedule/export', async (req, res) => {
  try {
    const sheetName = req.query.sheet || 'October 2026';
    const schedule = await sheetService.fetchScheduleFromGoogle(sheetName);
    const csv = sheetService.exportScheduleToCsv(schedule);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=MOD_Schedule_${sheetName.replace(/\s+/g, '_')}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).send('Error generating CSV: ' + err.message);
  }
});

// 4e. Master Data Officers CRUD API
app.get('/api/officers', (req, res) => {
  const onlyActive = req.query.active === 'true';
  const list = storage.getAllOfficers(onlyActive);
  res.json({ officers: list });
});

app.post('/api/officers', (req, res) => {
  const result = storage.addOfficer(req.body);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.put('/api/officers/:id', (req, res) => {
  const result = storage.updateOfficer(req.params.id, req.body);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.delete('/api/officers/:id', (req, res) => {
  const result = storage.deleteOfficer(req.params.id);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// 5. Preview WA Message
app.post('/api/preview', async (req, res) => {
  try {
    const { shift = 'ALL', date = null } = req.body;
    const targetDate = date ? new Date(date) : new Date();
    const schedule = await sheetService.fetchScheduleFromGoogle();
    const duty = sheetService.getDutyForDate(schedule, targetDate);
    
    const config = storage.getConfig();
    const templates = config.messageTemplates || {};
    const template = templates[shift] || templates['ALL'] || 'Jadwal MOD: {daftar_petugas}';
    
    const message = waService.buildMessage(template, duty, shift);
    res.json({
      shift,
      date: duty.date,
      message,
      officers: shift === 'ALL' ? duty.all : duty[shift]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Manual Send Shift Message to WA
app.post('/api/send/shift', async (req, res) => {
  try {
    const { shift = 'ALL', date = null } = req.body;
    const targetDate = date ? new Date(date) : new Date();
    const schedule = await sheetService.fetchScheduleFromGoogle();
    const duty = sheetService.getDutyForDate(schedule, targetDate);

    const result = await waService.sendWhatsAppMessage({
      shiftKey: shift,
      dutyData: duty,
      manual: true
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Send Custom Message
app.post('/api/send/custom', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong' });
    }

    const result = await waService.sendWhatsAppMessage({
      shiftKey: 'CUSTOM',
      dutyData: {},
      customMessage: message.trim(),
      manual: true
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  const logs = storage.getLogs(limit);
  res.json({ logs });
});

// 9. Config
app.get('/api/config', (req, res) => {
  res.json(storage.getConfig());
});

app.post('/api/config', (req, res) => {
  try {
    const newConfig = req.body;
    const ok = storage.saveConfig(newConfig);
    if (ok) {
      scheduler.initScheduler(); // Re-init scheduler with new timing
      res.json({ success: true, message: 'Konfigurasi berhasil disimpan dan Scheduler diperbarui.' });
    } else {
      res.status(500).json({ success: false, error: 'Gagal menyimpan konfigurasi.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Authentication & User Management
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = storage.authenticateUser(username, password);
    if (user) {
      res.json({
        success: true,
        user,
        message: `Selamat datang, ${user.name}!`
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Username atau password salah.'
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    const result = storage.changePassword(userId, currentPassword, newPassword);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Users CRUD (Admin)
app.get('/api/users', (req, res) => {
  try {
    const users = storage.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const { username, name, password, role } = req.body;
    const result = storage.addUser({ username, name, password, role });
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, role } = req.body;
    const result = storage.updateUser(id, { name, role });
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users/:id/reset-password', (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const result = storage.resetUserPassword(id, newPassword);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = storage.deleteUser(id);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Catch-all for SPA UI
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server and cron scheduler
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 MOD WA Scheduler Server is running on port ${PORT}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    console.log(`====================================================`);
    scheduler.initScheduler();
  });
}

module.exports = app;
