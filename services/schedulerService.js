const cron = require('node-cron');
const sheetService = require('./sheetService');
const waService = require('./waService');
const storage = require('./storageService');

let activeJobs = {};
let inFlightDispatch = {}; // In-memory lock per process
let isMasterProcess = false;
let heartbeatTimer = null;

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
  console.log(`[SCHEDULER] Triggering dispatch for ${shiftKey} at ${timeWib} WIB (PID: ${process.pid}, isManual: ${isManual})...`);

  // 1. In-process in-flight debounce: prevent any duplicate re-entry within the same process
  if (!isManual && inFlightDispatch[todayKey]) {
    console.log(`[SCHEDULER] Dispatch for ${todayKey} already in-flight in process PID ${process.pid}. Skipping.`);
    return {
      success: false,
      skipped: true,
      reason: `Pengiriman ${shiftKey} sedang diproses dalam worker ini.`
    };
  }

  // 2. Persistent Daily Check: Has this shift already been completed today by ANY worker process?
  if (!isManual && storage.isShiftDispatchedToday(shiftKey, dateStr)) {
    console.log(`[SCHEDULER] Shift ${shiftKey} already dispatched/handled today (${dateStr}). Skipping duplicate.`);
    return {
      success: false,
      skipped: true,
      reason: `Shift ${shiftKey} sudah terkirim hari ini (${dateStr}). Pengiriman duplikat diabaikan.`
    };
  }

  // 3. Multi-Worker Atomic Slot Claim: OS-level atomic lock ensuring only ONE process can proceed
  const claim = isManual ? { acquired: true } : storage.claimShiftDispatchSlot(shiftKey, dateStr);
  if (!claim.acquired) {
    console.log(`[SCHEDULER] Slot claim for ${todayKey} rejected (${claim.reason}). Skipping duplicate.`);
    return {
      success: false,
      skipped: true,
      reason: `Pengiriman ${shiftKey} sudah atau sedang diproses oleh worker lain (${claim.reason}).`
    };
  }

  inFlightDispatch[todayKey] = true;

  try {
    const schedule = await sheetService.fetchScheduleFromGoogle();
    const duty = sheetService.getDutyForDate(schedule, new Date());
    
    const officers = shiftKey === 'ALL' ? (duty.all || []) : (duty[shiftKey] || []);
    if (!officers || officers.length === 0) {
      console.log(`[SCHEDULER] No officers for shift ${shiftKey} today (${timeWib} WIB). Skipping WhatsApp broadcast.`);
      if (!isManual) {
        storage.failShiftDispatchSlot(shiftKey, dateStr, 'NO_OFFICERS_SCHEDULED');
      }
      delete inFlightDispatch[todayKey];
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
      if (!isManual) {
        // Permanently records completion on disk for today (NEVER unlinked)
        storage.completeShiftDispatchSlot(shiftKey, dateStr, res);
      }
      console.log(`[SCHEDULER] Dispatch for ${shiftKey} COMPLETED successfully at ${timeWib} WIB.`);
    } else {
      if (!isManual) {
        storage.failShiftDispatchSlot(shiftKey, dateStr, res?.reason || 'SEND_FAILED');
      }
      console.log(`[SCHEDULER] Dispatch for ${shiftKey} FAILED/SKIPPED at ${timeWib} WIB:`, res?.reason);
    }

    delete inFlightDispatch[todayKey];
    return res;
  } catch (err) {
    if (!isManual) {
      storage.failShiftDispatchSlot(shiftKey, dateStr, err.message);
    }
    delete inFlightDispatch[todayKey];
    console.error(`[SCHEDULER] Error during ${shiftKey} dispatch:`, err);
    return { success: false, error: err.message };
  }
}

function stopAllCronJobs() {
  Object.keys(activeJobs).forEach(k => {
    if (activeJobs[k]) {
      try { activeJobs[k].stop(); } catch (e) {}
    }
  });
  activeJobs = {};
}

function startMasterCronJobs() {
  stopAllCronJobs();

  const config = storage.getConfig();
  const schedules = config.schedules || {
    MOD1: { cron: '0 8 * * *', enabled: true },
    MOD2: { cron: '0 15 * * *', enabled: true },
    MOD: { cron: '0 17 * * *', enabled: true }
  };

  // Setup MOD1 (Pagi)
  if (schedules.MOD1 && schedules.MOD1.enabled) {
    const cronExp = schedules.MOD1.cron || '0 8 * * *';
    activeJobs.MOD1 = cron.schedule(cronExp, () => {
      triggerShiftDispatch('MOD1');
    }, {
      timezone: 'Asia/Jakarta'
    });
    console.log(`[SCHEDULER] Master (PID ${process.pid}) scheduled MOD1 at '${cronExp}' (Timezone: Asia/Jakarta)`);
  }

  // Setup MOD2 (Sore 1)
  if (schedules.MOD2 && schedules.MOD2.enabled) {
    const cronExp = schedules.MOD2.cron || '0 15 * * *';
    activeJobs.MOD2 = cron.schedule(cronExp, () => {
      triggerShiftDispatch('MOD2');
    }, {
      timezone: 'Asia/Jakarta'
    });
    console.log(`[SCHEDULER] Master (PID ${process.pid}) scheduled MOD2 at '${cronExp}' (Timezone: Asia/Jakarta)`);
  }

  // Setup MOD (Sore 2)
  if (schedules.MOD && schedules.MOD.enabled) {
    const cronExp = schedules.MOD.cron || '0 17 * * *';
    activeJobs.MOD = cron.schedule(cronExp, () => {
      triggerShiftDispatch('MOD');
    }, {
      timezone: 'Asia/Jakarta'
    });
    console.log(`[SCHEDULER] Master (PID ${process.pid}) scheduled MOD at '${cronExp}' (Timezone: Asia/Jakarta)`);
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

  console.log(`[SCHEDULER] All cron schedules initialized on Master Process (PID ${process.pid}).`);
}

function initScheduler() {
  // Master Election: In Passenger / multi-process environments, ONLY the Master process runs cron!
  const elected = storage.tryElectMasterScheduler();
  if (elected) {
    isMasterProcess = true;
    console.log(`[SCHEDULER] Process PID ${process.pid} ELECTED as MASTER SCHEDULER.`);
    startMasterCronJobs();
  } else {
    isMasterProcess = false;
    stopAllCronJobs();
    const status = storage.getSchedulerMasterStatus();
    console.log(`[SCHEDULER] Process PID ${process.pid} is FOLLOWER worker (Active Master PID: ${status.masterPid}). Cron scheduler inactive in this worker.`);
  }

  // Heartbeat & leader liveness check every 20 seconds
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      if (isMasterProcess) {
        // Renew our master lease
        storage.tryElectMasterScheduler();
      } else {
        // Check if master died/stale; if so, elect ourselves
        const electedNow = storage.tryElectMasterScheduler();
        if (electedNow) {
          isMasterProcess = true;
          console.log(`[SCHEDULER] Master lease expired. Process PID ${process.pid} PROMOTED to MASTER SCHEDULER!`);
          startMasterCronJobs();
        }
      }
    }, 20000);
    if (heartbeatTimer.unref) heartbeatTimer.unref();
  }
}

// Clean up master lock on graceful termination
process.on('beforeExit', () => {
  storage.releaseMasterScheduler();
});
process.on('SIGTERM', () => {
  storage.releaseMasterScheduler();
});
process.on('SIGINT', () => {
  storage.releaseMasterScheduler();
});

function getSchedulerStatus() {
  const config = storage.getConfig();
  const schedules = config.schedules || {};
  const todayStr = getTodayDateStr();
  const masterStatus = storage.getSchedulerMasterStatus();

  return {
    timezone: 'Asia/Jakarta',
    currentTime: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    pid: process.pid,
    isMasterScheduler: isMasterProcess,
    masterPid: masterStatus.masterPid,
    activeSchedules: {
      MOD1: {
        time: (schedules.MOD1 && schedules.MOD1.time) || '08:00',
        cron: (schedules.MOD1 && schedules.MOD1.cron) || '0 8 * * *',
        enabled: schedules.MOD1 ? schedules.MOD1.enabled : true,
        dispatchedToday: storage.isShiftDispatchedToday('MOD1', todayStr)
      },
      MOD2: {
        time: (schedules.MOD2 && schedules.MOD2.time) || '15:00',
        cron: (schedules.MOD2 && schedules.MOD2.cron) || '0 15 * * *',
        enabled: schedules.MOD2 ? schedules.MOD2.enabled : true,
        dispatchedToday: storage.isShiftDispatchedToday('MOD2', todayStr)
      },
      MOD: {
        time: (schedules.MOD && schedules.MOD.time) || '17:00',
        cron: (schedules.MOD && schedules.MOD.cron) || '0 17 * * *',
        enabled: schedules.MOD ? schedules.MOD.enabled : true,
        dispatchedToday: storage.isShiftDispatchedToday('MOD', todayStr)
      }
    }
  };
}

module.exports = {
  initScheduler,
  triggerShiftDispatch,
  getSchedulerStatus
};
