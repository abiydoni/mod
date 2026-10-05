const cron = require('node-cron');
const sheetService = require('./sheetService');
const waService = require('./waService');
const storage = require('./storageService');

let activeJobs = {};
let dispatchedToday = {}; // { 'YYYY-MM-DD_MOD1': true }

function getTodayDateStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function getTodayKey(shiftKey) {
  return `${getTodayDateStr()}_${shiftKey}`;
}

async function triggerShiftDispatch(shiftKey, isManual = false) {
  const timeWib = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
  const dateStr = getTodayDateStr();
  const todayKey = `${dateStr}_${shiftKey}`;
  console.log(`[SCHEDULER] Triggering scheduled dispatch for ${shiftKey} at ${timeWib} WIB...`);
  
  // 1. Persistent Check: Has this shift already been dispatched successfully today by ANY worker process?
  if (!isManual && (storage.isShiftDispatchedToday(shiftKey, dateStr) || (dispatchedToday[todayKey] && dispatchedToday[todayKey].result && dispatchedToday[todayKey].result.success))) {
    console.log(`[SCHEDULER] Shift ${shiftKey} already dispatched today (${dateStr}). Skipping duplicate.`);
    return {
      success: false,
      skipped: true,
      reason: `Shift ${shiftKey} sudah terkirim hari ini (${dateStr}). Pengiriman duplikat diabaikan.`
    };
  }

  // 2. Multi-Worker Concurrency Lock: Prevent multiple Passenger processes from firing at the exact same millisecond
  const lockAcquired = isManual || storage.acquireDispatchLock(todayKey, 60000);
  if (!lockAcquired) {
    console.log(`[SCHEDULER] Dispatch lock for ${todayKey} already held by another worker process. Skipping concurrent duplicate.`);
    return {
      success: false,
      skipped: true,
      reason: `Pengiriman ${shiftKey} sedang diproses oleh worker lain.`
    };
  }

  try {
    const schedule = await sheetService.fetchScheduleFromGoogle();
    const duty = sheetService.getDutyForDate(schedule, new Date());
    
    const officers = shiftKey === 'ALL' ? (duty.all || []) : (duty[shiftKey] || []);
    if (!officers || officers.length === 0) {
      console.log(`[SCHEDULER] No officers for shift ${shiftKey} today (${timeWib} WIB). Skipping WhatsApp broadcast.`);
      storage.releaseDispatchLock(todayKey);
      return {
        success: false,
        skipped: true,
        reason: `Tidak ada petugas yang dijadwalkan untuk shift ${shiftKey} hari ini.`
      };
    }

    const res = await waService.sendWhatsAppMessage({
      shiftKey,
      dutyData: duty,
      manual: isManual
    });

    if (res && res.success) {
      storage.recordShiftDispatch(shiftKey, dateStr, res);
      dispatchedToday[todayKey] = {
        time: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        result: res
      };
    }

    storage.releaseDispatchLock(todayKey);
    console.log(`[SCHEDULER] Dispatch for ${shiftKey} completed. Status: ${res.success ? 'OK' : (res.skipped ? 'SKIPPED' : 'FAILED')}`);
    return res;
  } catch (err) {
    storage.releaseDispatchLock(todayKey);
    console.error(`[SCHEDULER] Error during ${shiftKey} dispatch:`, err);
    return { success: false, error: err.message };
  }
}

function initScheduler() {
  // Clear any existing jobs
  Object.keys(activeJobs).forEach(k => {
    if (activeJobs[k]) activeJobs[k].stop();
  });
  activeJobs = {};

  const config = storage.getConfig();
  const schedules = config.schedules || {
    MOD1: { cron: '0 9 * * *', enabled: true },
    MOD2: { cron: '0 16 * * *', enabled: true },
    MOD: { cron: '0 18 * * *', enabled: true }
  };

  // Setup MOD1 (09:00 WIB)
  if (schedules.MOD1 && schedules.MOD1.enabled) {
    const cronExp = schedules.MOD1.cron || '0 9 * * *';
    activeJobs.MOD1 = cron.schedule(cronExp, () => {
      triggerShiftDispatch('MOD1');
    }, {
      timezone: 'Asia/Jakarta'
    });
    console.log(`[SCHEDULER] Scheduled MOD1 at '${cronExp}' (Timezone: Asia/Jakarta)`);
  }

  // Setup MOD2 (16:00 WIB)
  if (schedules.MOD2 && schedules.MOD2.enabled) {
    const cronExp = schedules.MOD2.cron || '0 16 * * *';
    activeJobs.MOD2 = cron.schedule(cronExp, () => {
      triggerShiftDispatch('MOD2');
    }, {
      timezone: 'Asia/Jakarta'
    });
    console.log(`[SCHEDULER] Scheduled MOD2 at '${cronExp}' (Timezone: Asia/Jakarta)`);
  }

  // Setup MOD (18:00 WIB)
  if (schedules.MOD && schedules.MOD.enabled) {
    const cronExp = schedules.MOD.cron || '0 18 * * *';
    activeJobs.MOD = cron.schedule(cronExp, () => {
      triggerShiftDispatch('MOD');
    }, {
      timezone: 'Asia/Jakarta'
    });
    console.log(`[SCHEDULER] Scheduled MOD at '${cronExp}' (Timezone: Asia/Jakarta)`);
  }

  // Periodic Google Sheets Sync (every 30 mins)
  activeJobs.sync = cron.schedule('*/30 * * * *', async () => {
    console.log('[SCHEDULER] Running periodic Google Sheet sync...');
    try {
      await sheetService.fetchScheduleFromGoogle();
    } catch (e) {
      console.error('[SCHEDULER] Periodic sync failed:', e.message);
    }
  });

  console.log('[SCHEDULER] All cron schedules initialized successfully.');
}

function getSchedulerStatus() {
  const config = storage.getConfig();
  const schedules = config.schedules || {};
  const todayStr = getTodayDateStr();

  return {
    timezone: 'Asia/Jakarta',
    currentTime: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    activeSchedules: {
      MOD1: {
        time: (schedules.MOD1 && schedules.MOD1.time) || '08:00',
        cron: (schedules.MOD1 && schedules.MOD1.cron) || '0 8 * * *',
        enabled: schedules.MOD1 ? schedules.MOD1.enabled : true,
        dispatchedToday: storage.isShiftDispatchedToday('MOD1', todayStr) || !!dispatchedToday[`${todayStr}_MOD1`]
      },
      MOD2: {
        time: (schedules.MOD2 && schedules.MOD2.time) || '15:00',
        cron: (schedules.MOD2 && schedules.MOD2.cron) || '0 15 * * *',
        enabled: schedules.MOD2 ? schedules.MOD2.enabled : true,
        dispatchedToday: storage.isShiftDispatchedToday('MOD2', todayStr) || !!dispatchedToday[`${todayStr}_MOD2`]
      },
      MOD: {
        time: (schedules.MOD && schedules.MOD.time) || '17:00',
        cron: (schedules.MOD && schedules.MOD.cron) || '0 17 * * *',
        enabled: schedules.MOD ? schedules.MOD.enabled : true,
        dispatchedToday: storage.isShiftDispatchedToday('MOD', todayStr) || !!dispatchedToday[`${todayStr}_MOD`]
      }
    }
  };
}

module.exports = {
  initScheduler,
  triggerShiftDispatch,
  getSchedulerStatus
};
