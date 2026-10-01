const cron = require('node-cron');
const sheetService = require('./sheetService');
const waService = require('./waService');
const storage = require('./storageService');

let activeJobs = {};
let dispatchedToday = {}; // { 'YYYY-MM-DD_MOD1': true }

function getTodayKey(shiftKey) {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  return `${todayStr}_${shiftKey}`;
}

async function triggerShiftDispatch(shiftKey) {
  const timeWib = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
  console.log(`[SCHEDULER] Triggering scheduled dispatch for ${shiftKey} at ${timeWib} WIB...`);
  
  try {
    const schedule = await sheetService.fetchScheduleFromGoogle();
    const duty = sheetService.getDutyForDate(schedule, new Date());
    
    const officers = duty[shiftKey] || [];
    if (officers.length === 0) {
      console.log(`[SCHEDULER] No officers for shift ${shiftKey} today (${timeWib} WIB).`);
    }

    const res = await waService.sendWhatsAppMessage({
      shiftKey,
      dutyData: duty,
      manual: false
    });

    const todayKey = getTodayKey(shiftKey);
    dispatchedToday[todayKey] = {
      time: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      result: res
    };

    console.log(`[SCHEDULER] Dispatch for ${shiftKey} completed. Status: ${res.success ? 'OK' : 'FAILED'}`);
    return res;
  } catch (err) {
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
  const todayStr = new Date().toISOString().split('T')[0];

  return {
    timezone: 'Asia/Jakarta',
    currentTime: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    activeSchedules: {
      MOD1: {
        time: (schedules.MOD1 && schedules.MOD1.time) || '09:00',
        cron: (schedules.MOD1 && schedules.MOD1.cron) || '0 9 * * *',
        enabled: schedules.MOD1 ? schedules.MOD1.enabled : true,
        dispatchedToday: !!dispatchedToday[`${todayStr}_MOD1`]
      },
      MOD2: {
        time: (schedules.MOD2 && schedules.MOD2.time) || '16:00',
        cron: (schedules.MOD2 && schedules.MOD2.cron) || '0 16 * * *',
        enabled: schedules.MOD2 ? schedules.MOD2.enabled : true,
        dispatchedToday: !!dispatchedToday[`${todayStr}_MOD2`]
      },
      MOD: {
        time: (schedules.MOD && schedules.MOD.time) || '18:00',
        cron: (schedules.MOD && schedules.MOD.cron) || '0 18 * * *',
        enabled: schedules.MOD ? schedules.MOD.enabled : true,
        dispatchedToday: !!dispatchedToday[`${todayStr}_MOD`]
      }
    }
  };
}

module.exports = {
  initScheduler,
  triggerShiftDispatch,
  getSchedulerStatus
};
