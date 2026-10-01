const app = {
  currentDate: new Date(),
  selectedShift: 'ALL',
  pendingModalShift: 'ALL',
  cachedDuty: null,
  cachedMatrix: null,
  config: null,
  editorOfficers: [],
  masterOfficers: [],
  editorMonth: 'October',
  editorYear: 2026,

  async init() {
    this.startClock();
    this.initDateSelector();
    this.setupEventListeners();
    
    this.setStatus('⚡ Memuat dashboard & data jadwal...', 'working');
    this.setProgress(30);

    // Load all data in parallel for instant page render (<50ms)
    await Promise.allSettled([
      this.loadConfig(),
      this.loadDutyData(),
      this.loadMatrixData(),
      this.loadMasterOfficers(),
      this.loadLogs()
    ]);

    this.setProgress(100, false);
    this.updateStatusPills();
    this.setStatus('🟢 Sistem Siap (Data Terkini & Live)', 'ready');
  },

  setStatus(text, state = 'ready') {
    const textEl = document.getElementById('status-action-text');
    const dotEl = document.getElementById('status-pulse-dot');
    if (textEl) textEl.innerText = text;
    if (dotEl) {
      dotEl.className = 'status-pulse-dot';
      if (state === 'working') dotEl.classList.add('working');
      else if (state === 'error') dotEl.classList.add('error');
    }
  },

  setProgress(percent, active = true) {
    const bar = document.getElementById('global-progress-bar');
    if (!bar) return;
    if (active) {
      bar.classList.add('active');
      bar.style.width = `${percent}%`;
    } else {
      bar.style.width = '100%';
      setTimeout(() => {
        bar.classList.remove('active');
        bar.style.width = '0%';
      }, 300);
    }
  },

  updateStatusPills() {
    const sheetPill = document.getElementById('pill-sheet-status');
    const waPill = document.getElementById('pill-wa-status');
    const cronPill = document.getElementById('pill-cron-status');
    
    if (sheetPill && this.config && this.config.spreadsheet) {
      sheetPill.innerText = `📊 GSheet: ${this.config.spreadsheet.activeSheetName || 'Aktif'}`;
    }
    if (waPill && this.config && this.config.waGateway) {
      const target = (this.config.waGateway.targetNumber || '').split('@')[0];
      waPill.innerText = `🤖 WA: ${this.config.waGateway.enabled ? 'Aktif' : 'Nonaktif'} (${target || 'Grup'})`;
    }
    if (cronPill && this.config && this.config.schedules) {
      cronPill.innerText = `⏰ Cron: ${this.config.schedules.MOD1?.time || '09:00'}, ${this.config.schedules.MOD2?.time || '16:00'}, ${this.config.schedules.MOD?.time || '18:00'} WIB`;
    }
  },

  setupEventListeners() {
    // Tab Switching
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId);
        if (tabId === 'tab-editor') {
          this.loadEditorData();
        } else if (tabId === 'tab-officers') {
          this.loadMasterOfficers();
        }
      });
    });

    // Date selector
    const dateInput = document.getElementById('date-selector');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          this.currentDate = new Date(e.target.value);
          this.loadDutyData();
        }
      });
    }

    const btnToday = document.getElementById('btn-today');
    if (btnToday) {
      btnToday.addEventListener('click', () => {
        this.currentDate = new Date();
        this.initDateSelector();
        this.loadDutyData();
      });
    }

    const btnTomorrow = document.getElementById('btn-tomorrow');
    if (btnTomorrow) {
      btnTomorrow.addEventListener('click', () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        this.currentDate = tomorrow;
        this.initDateSelector();
        this.loadDutyData();
      });
    }

    // Sync button
    const btnSync = document.getElementById('btn-sync-sheet');
    if (btnSync) {
      btnSync.addEventListener('click', () => {
        this.syncGoogleSheets();
      });
    }

    // Refresh Matrix
    const btnRefreshMatrix = document.getElementById('btn-refresh-matrix');
    if (btnRefreshMatrix) {
      btnRefreshMatrix.addEventListener('click', () => {
        this.loadMatrixData();
      });
    }

    // Search Matrix
    const matrixSearch = document.getElementById('matrix-search');
    if (matrixSearch) {
      matrixSearch.addEventListener('input', (e) => {
        this.filterMatrixTable(e.target.value);
      });
    }

    // Search Master Officers
    const offSearch = document.getElementById('officer-search');
    if (offSearch) {
      offSearch.addEventListener('input', (e) => {
        this.filterMasterOfficers(e.target.value);
      });
    }

    // Refresh Logs
    const btnRefreshLogs = document.getElementById('btn-refresh-logs');
    if (btnRefreshLogs) {
      btnRefreshLogs.addEventListener('click', () => {
        this.loadLogs();
      });
    }

    // Send Preview Button
    const btnSendPreview = document.getElementById('btn-send-preview');
    if (btnSendPreview) {
      btnSendPreview.addEventListener('click', () => {
        this.openSendModal(this.selectedShift);
      });
    }

    // Confirm Send in Modal
    const btnModalConfirm = document.getElementById('btn-modal-confirm-send');
    if (btnModalConfirm) {
      btnModalConfirm.addEventListener('click', () => {
        this.executeSendShift(this.pendingModalShift);
      });
    }

    // Broadcast Submit
    const btnBroadcast = document.getElementById('btn-submit-broadcast');
    if (btnBroadcast) {
      btnBroadcast.addEventListener('click', () => {
        this.sendCustomBroadcast();
      });
    }

    // Settings Save
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        this.saveConfig();
      });
    }

    // Master Officers: Open Add Modal
    const btnOpenAddOfficer = document.getElementById('btn-open-add-officer');
    if (btnOpenAddOfficer) {
      btnOpenAddOfficer.addEventListener('click', () => {
        this.openAddOfficerModal();
      });
    }

    // Editor: Load month
    const btnEditorLoad = document.getElementById('btn-editor-load');
    if (btnEditorLoad) {
      btnEditorLoad.addEventListener('click', () => {
        this.editorMonth = document.getElementById('editor-month').value;
        this.editorYear = parseInt(document.getElementById('editor-year').value, 10);
        this.loadEditorData();
      });
    }

    // Editor: Add officer modal button
    const btnAddOffModal = document.getElementById('btn-add-officer-modal');
    if (btnAddOffModal) {
      btnAddOffModal.addEventListener('click', () => {
        this.openAddOfficerModal();
      });
    }

    // Modal Officer: Save button
    const btnSaveOff = document.getElementById('btn-save-new-officer');
    if (btnSaveOff) {
      btnSaveOff.addEventListener('click', () => {
        this.saveOfficerMaster();
      });
    }

    // Editor: Auto generate
    const btnAutoGen = document.getElementById('btn-auto-generate-schedule');
    if (btnAutoGen) {
      btnAutoGen.addEventListener('click', () => {
        this.autoGenerateSchedule();
      });
    }

    // Editor: Save schedule
    const btnSaveEditor = document.getElementById('btn-save-editor-schedule');
    if (btnSaveEditor) {
      btnSaveEditor.addEventListener('click', () => {
        this.saveEditorSchedule();
      });
    }

    // Editor: Export CSV
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => {
        this.exportCsv();
      });
    }

    // Template selector change
    const tmplSelect = document.getElementById('cfg-template-select');
    if (tmplSelect) {
      tmplSelect.addEventListener('change', (e) => {
        this.populateTemplateText(e.target.value);
      });
    }

    // Template text change
    const tmplText = document.getElementById('cfg-template-text');
    if (tmplText) {
      tmplText.addEventListener('input', (e) => {
        const selected = document.getElementById('cfg-template-select').value;
        if (!this.config) this.config = {};
        if (!this.config.messageTemplates) this.config.messageTemplates = {};
        this.config.messageTemplates[selected] = e.target.value;
        this.updateWhatsAppPreview();
      });
    }

    // Test Sheet Button
    const btnTestSheet = document.getElementById('btn-test-sheet');
    if (btnTestSheet) {
      btnTestSheet.addEventListener('click', () => {
        this.testGoogleSheetConnection();
      });
    }

    // Copy Service Email Button
    const btnCopyEmail = document.getElementById('btn-copy-service-email');
    if (btnCopyEmail) {
      btnCopyEmail.addEventListener('click', () => {
        const emailEl = document.getElementById('system-service-email');
        if (emailEl) {
          navigator.clipboard.writeText(emailEl.innerText.trim()).then(() => {
            this.showToast('📋 Email sistem berhasil disalin ke clipboard!', 'success');
          }).catch(() => {
            this.showToast('Gagal menyalin, silakan pilih teks secara manual.', 'error');
          });
        }
      });
    }
  },

  startClock() {
    const update = () => {
      const now = new Date();
      const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Jakarta'
      };
      const formatted = new Intl.DateTimeFormat('id-ID', options).format(now);
      const clockEl = document.getElementById('current-datetime-display');
      if (clockEl) {
        clockEl.innerText = `🕒 ${formatted} WIB`;
      }
    };
    update();
    setInterval(update, 1000);
  },

  initDateSelector() {
    const wibDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(this.currentDate);
    const input = document.getElementById('date-selector');
    if (input) {
      input.value = wibDateStr;
    }
  },

  switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    const titles = {
      'tab-today': 'Jadwal Hari Ini & Pengiriman WA',
      'tab-editor': 'Buat & Edit Jadwal MOD',
      'tab-officers': 'Data Master Karyawan',
      'tab-matrix': 'Kalender Matrix Jadwal MOD',
      'tab-broadcast': 'Kirim Pesan Manual / Pengumuman',
      'tab-logs': 'Riwayat Log Pengiriman',
      'tab-settings': 'Pengaturan Sistem & Cron'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      titleEl.innerText = titles[tabId] || 'MOD Dispatcher';
    }
  },

  async loadConfig() {
    try {
      const res = await fetch('/api/config');
      this.config = await res.json();
      
      // Populate fields in Settings tab
      if (this.config.spreadsheet) {
        const sheetUrlEl = document.getElementById('cfg-sheet-url');
        if (sheetUrlEl) sheetUrlEl.value = this.config.spreadsheet.sheetUrl || this.config.spreadsheet.spreadsheetId || '';
        
        const webhookEl = document.getElementById('cfg-script-webhook');
        if (webhookEl) webhookEl.value = this.config.spreadsheet.scriptWebhookUrl || '';
        
        const sheetNameEl = document.getElementById('cfg-sheet-name');
        if (sheetNameEl) sheetNameEl.value = this.config.spreadsheet.activeSheetName || 'October 2026';
      }

      if (this.config.waGateway) {
        const waUrlEl = document.getElementById('cfg-wa-url');
        if (waUrlEl) waUrlEl.value = this.config.waGateway.apiUrl || '';

        const waKeyEl = document.getElementById('cfg-wa-key');
        if (waKeyEl) waKeyEl.value = this.config.waGateway.apiKey || '';

        const waSessionEl = document.getElementById('cfg-wa-session');
        if (waSessionEl) waSessionEl.value = this.config.waGateway.sessionId || '';

        const waTargetEl = document.getElementById('cfg-wa-target');
        if (waTargetEl) waTargetEl.value = this.config.waGateway.targetNumber || '';

        const waEnabledEl = document.getElementById('cfg-wa-enabled');
        if (waEnabledEl) waEnabledEl.checked = !!this.config.waGateway.enabled;

        const broadcastTargetEl = document.getElementById('broadcast-target');
        if (broadcastTargetEl) broadcastTargetEl.value = this.config.waGateway.targetNumber || 'Belum diatur';
      }

      if (this.config.schedules) {
        const tMod1 = document.getElementById('cfg-time-mod1');
        if (tMod1) tMod1.value = this.config.schedules.MOD1?.time || '09:00';

        const tMod2 = document.getElementById('cfg-time-mod2');
        if (tMod2) tMod2.value = this.config.schedules.MOD2?.time || '16:00';

        const tMod = document.getElementById('cfg-time-mod');
        if (tMod) tMod.value = this.config.schedules.MOD?.time || '18:00';

        const cMod1 = document.getElementById('cron-time-mod1');
        if (cMod1) cMod1.innerText = `${this.config.schedules.MOD1?.time || '09:00'} WIB`;

        const cMod2 = document.getElementById('cron-time-mod2');
        if (cMod2) cMod2.innerText = `${this.config.schedules.MOD2?.time || '16:00'} WIB`;

        const cMod = document.getElementById('cron-time-mod');
        if (cMod) cMod.innerText = `${this.config.schedules.MOD?.time || '18:00'} WIB`;
      }
      
      const currentSelectedTemplate = document.getElementById('cfg-template-select')?.value || 'MOD1';
      this.populateTemplateText(currentSelectedTemplate);
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  },

  populateTemplateText(shiftKey) {
    const templates = (this.config && this.config.messageTemplates) || {};
    const textEl = document.getElementById('cfg-template-text');
    if (textEl) {
      textEl.value = templates[shiftKey] || '';
    }
  },

  async loadDutyData() {
    try {
      const dateStr = this.currentDate.toISOString().split('T')[0];
      const res = await fetch(`/api/schedule/duty?date=${dateStr}`);
      const data = await res.json();
      this.cachedDuty = data.duty;

      const sourceLabel = document.getElementById('sheet-source-label');
      if (sourceLabel) {
        sourceLabel.innerText = data.source === 'live_google_sheet' ? '🟢 Google Sheets (Live)' : '🟡 Data SQLite Aktif';
      }

      const alertBanner = document.getElementById('alert-banner');
      if (alertBanner) {
        if (data.syncWarning) {
          alertBanner.innerText = `ℹ️ ${data.syncWarning}`;
          alertBanner.classList.remove('hidden');
        } else {
          alertBanner.classList.add('hidden');
        }
      }

      this.renderDutyCards(data.duty);
      this.updateWhatsAppPreview();
    } catch (e) {
      console.error('Failed to load duty data:', e);
    }
  },

  renderDutyCards(duty) {
    const renderList = (elementId, officers, emptyText) => {
      const container = document.getElementById(elementId);
      if (!container) return;
      if (!officers || officers.length === 0) {
        container.innerHTML = `<div class="no-officer">${emptyText}</div>`;
        return;
      }
      container.innerHTML = officers.map(o => `
        <div class="officer-item">
          <div class="officer-avatar">${(o.name || 'P').charAt(0).toUpperCase()}</div>
          <div class="officer-details">
            <h4>${o.name}</h4>
            <p>${o.role}</p>
          </div>
        </div>
      `).join('');
    };

    renderList('list-mod1', duty?.MOD1, 'Tidak ada petugas MOD 1 pada tanggal ini');
    renderList('list-mod2', duty?.MOD2, 'Tidak ada petugas MOD 2 pada tanggal ini');
    renderList('list-mod', duty?.MOD, 'Tidak ada petugas MOD pada tanggal ini');
  },

  switchPreviewShift(shiftKey) {
    this.selectedShift = shiftKey;
    document.querySelectorAll('.preview-toggle-group .btn-chip').forEach(chip => {
      chip.classList.toggle('active', chip.innerText.includes(shiftKey) || (shiftKey === 'ALL' && chip.innerText.includes('Semua')));
    });
    this.updateWhatsAppPreview();
  },

  async updateWhatsAppPreview() {
    if (!this.cachedDuty) return;
    try {
      const dateStr = this.currentDate.toISOString().split('T')[0];
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift: this.selectedShift, date: dateStr })
      });
      const data = await res.json();
      const previewText = document.getElementById('wa-preview-text');
      if (previewText) {
        previewText.innerText = data.message || 'Pesan kosong';
      }
      
      const timeMap = { 'MOD1': '09:00', 'MOD2': '16:00', 'MOD': '18:00', 'ALL': '08:00' };
      const previewTime = document.getElementById('wa-preview-time');
      if (previewTime) {
        previewTime.innerText = timeMap[this.selectedShift] || '09:00';
      }
    } catch (e) {
      console.error('Failed to preview message:', e);
    }
  },

  async syncGoogleSheets() {
    const btn = document.getElementById('btn-sync-sheet');
    if (!btn) return;
    const originalText = btn.innerHTML;
    this.setStatus('🔄 Menghubungi Google Sheets & menyinkronkan data CSV...', 'working');
    this.setProgress(40);

    try {
      const sheetName = document.getElementById('cfg-sheet-name')?.value.trim() || '';
      const res = await fetch('/api/schedule/sync', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ sheetName }) 
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Berhasil disinkronkan! Ditemukan ${data.officersCount} data petugas.`, 'success');
        this.setStatus(`✅ Google Sheets berhasil disinkronkan (${data.officersCount} Petugas)`, 'ready');
        this.setProgress(100, false);
        await this.loadDutyData();
        await this.loadMatrixData();
      } else {
        this.showToast(`Gagal sinkron: ${data.error}`, 'error');
        this.setStatus(`❌ Gagal sinkronisasi: ${data.error}`, 'error');
        this.setProgress(100, false);
      }
    } catch (e) {
      this.showToast(`Error sinkronisasi: ${e.message}`, 'error');
      this.setStatus(`❌ Error sinkronisasi: ${e.message}`, 'error');
      this.setProgress(100, false);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  },

  async loadMatrixData() {
    try {
      const res = await fetch('/api/schedule/current');
      const data = await res.json();
      this.cachedMatrix = data;
      this.renderMatrixTable(data);
    } catch (e) {
      console.error('Failed to load matrix:', e);
    }
  },

  renderMatrixTable(data) {
    const officers = data.officers || [];
    const daysTr = document.getElementById('matrix-head-days');
    const datesTr = document.getElementById('matrix-head-dates');
    const tbody = document.getElementById('matrix-tbody');

    if (!daysTr || !datesTr || !tbody) return;

    // Headers
    let daysHtml = `<th rowspan="2">Nama Petugas</th><th rowspan="2">Jabatan</th>`;
    let datesHtml = '';

    for (let d = 1; d <= 31; d++) {
      const dStr = String(d).padStart(2, '0');
      datesHtml += `<th>${dStr}</th>`;
    }
    daysHtml += `<th colspan="31" class="text-center">Tanggal</th><th rowspan="2">Total</th>`;

    daysTr.innerHTML = daysHtml;
    datesTr.innerHTML = datesHtml;

    if (officers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="35" class="text-center py-4">Tidak ada data jadwal tersedia.</td></tr>`;
      return;
    }

    tbody.innerHTML = officers.map(o => {
      let shiftCells = '';
      let totalCount = 0;
      for (let d = 1; d <= 31; d++) {
        const s = o.shifts ? o.shifts[d] : null;
        if (s) {
          totalCount++;
          let badgeClass = 'matrix-badge-mod';
          if (s === 'MOD1') badgeClass = 'matrix-badge-mod1';
          if (s === 'MOD2') badgeClass = 'matrix-badge-mod2';
          shiftCells += `<td><span class="${badgeClass}">${s}</span></td>`;
        } else {
          shiftCells += `<td></td>`;
        }
      }

      return `
        <tr data-name="${(o.name || '').toLowerCase()}">
          <td><strong>${o.name}</strong></td>
          <td>${o.role}</td>
          ${shiftCells}
          <td><strong>${totalCount}</strong></td>
        </tr>
      `;
    }).join('');
  },

  filterMatrixTable(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('#matrix-tbody tr').forEach(tr => {
      const name = tr.getAttribute('data-name') || '';
      tr.style.display = name.includes(q) ? '' : 'none';
    });
  },

  openSendModal(shiftKey) {
    this.pendingModalShift = shiftKey;
    const titles = {
      'MOD1': 'Kirim Notifikasi Shift Pagi (MOD 1)',
      'MOD2': 'Kirim Notifikasi Shift Sore (MOD 2)',
      'MOD': 'Kirim Notifikasi Shift Malam (MOD)',
      'ALL': 'Kirim Ringkasan Semua Shift Hari Ini'
    };
    const modalTitle = document.getElementById('modal-send-title');
    if (modalTitle) {
      modalTitle.innerText = titles[shiftKey] || 'Konfirmasi Pengiriman';
    }
    
    const dateStr = this.currentDate.toISOString().split('T')[0];
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shift: shiftKey, date: dateStr })
    }).then(r => r.json()).then(d => {
      const modalText = document.getElementById('modal-preview-text');
      if (modalText) modalText.innerText = d.message;
      document.getElementById('modal-send')?.classList.remove('hidden');
    });
  },

  closeModal() {
    document.getElementById('modal-send')?.classList.add('hidden');
  },

  async executeSendShift(shiftKey) {
    const btn = document.getElementById('btn-modal-confirm-send');
    if (btn) {
      btn.innerHTML = '⏳ Mengirim...';
      btn.disabled = true;
    }

    try {
      const dateStr = this.currentDate.toISOString().split('T')[0];
      const res = await fetch('/api/send/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift: shiftKey, date: dateStr })
      });
      const data = await res.json();
      this.closeModal();

      if (data.success) {
        this.showToast('✅ Pesan berhasil dikirim ke WhatsApp Group!', 'success');
      } else {
        this.showToast(`❌ Gagal kirim: ${data.error || 'Periksa gateway WA'}`, 'error');
      }
      await this.loadLogs();
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.innerHTML = 'Kirim Sekarang 🚀';
        btn.disabled = false;
      }
    }
  },

  async sendCustomBroadcast() {
    const text = document.getElementById('custom-broadcast-text')?.value || '';
    if (!text.trim()) {
      this.showToast('Isi pesan tidak boleh kosong!', 'error');
      return;
    }

    const btn = document.getElementById('btn-submit-broadcast');
    if (btn) {
      btn.innerHTML = '⏳ Mengirim...';
      btn.disabled = true;
    }

    try {
      const res = await fetch('/api/send/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('✅ Pesan pengumuman berhasil dikirim!', 'success');
        document.getElementById('custom-broadcast-text').value = '';
      } else {
        this.showToast(`❌ Gagal: ${data.error || 'Respon error dari gateway'}`, 'error');
      }
      await this.loadLogs();
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.innerHTML = '<span class="btn-icon">📨</span> Kirim Pesan Bebas Sekarang';
        btn.disabled = false;
      }
    }
  },

  async loadLogs() {
    try {
      const res = await fetch('/api/logs?limit=50');
      const data = await res.json();
      const logs = data.logs || [];
      const logCountEl = document.getElementById('logs-count');
      if (logCountEl) logCountEl.innerText = logs.length;
      
      const tbody = document.getElementById('logs-tbody');
      if (!tbody) return;

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Belum ada riwayat pengiriman.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => {
        const time = new Date(l.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const isOk = l.status === 'SUCCESS';
        const badgeClass = isOk ? 'status-badge-success' : 'status-badge-failed';
        const msgSnippet = (l.messageText || l.message || '').substring(0, 45) + '...';

        return `
          <tr>
            <td>${time}</td>
            <td><span class="badge">${l.type || 'AUTO'}</span></td>
            <td><strong>${l.shift || 'N/A'}</strong></td>
            <td><span class="${badgeClass}">${l.status}</span></td>
            <td><code>${l.target || '-'}</code></td>
            <td title="${(l.messageText || '').replace(/"/g, '&quot;')}">${msgSnippet}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  },

  timeToCron(timeStr) {
    if (!timeStr) return '0 9 * * *';
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return `${m} ${h} * * *`;
  },

  async saveConfig() {
    const activeTemplate = document.getElementById('cfg-template-select')?.value || 'MOD1';
    const templateText = document.getElementById('cfg-template-text')?.value || '';

    const templates = {
      ...(this.config && this.config.messageTemplates),
      [activeTemplate]: templateText
    };

    const timeMod1 = document.getElementById('cfg-time-mod1')?.value || '09:00';
    const timeMod2 = document.getElementById('cfg-time-mod2')?.value || '16:00';
    const timeMod = document.getElementById('cfg-time-mod')?.value || '18:00';

    const newConfig = {
      ...this.config,
      spreadsheet: {
        spreadsheetId: document.getElementById('cfg-sheet-url')?.value.trim() || '',
        sheetUrl: document.getElementById('cfg-sheet-url')?.value.trim() || '',
        scriptWebhookUrl: document.getElementById('cfg-script-webhook')?.value.trim() || '',
        activeSheetName: document.getElementById('cfg-sheet-name')?.value.trim() || 'October 2026',
        autoSyncMinutes: 30
      },
      waGateway: {
        apiUrl: document.getElementById('cfg-wa-url')?.value.trim() || '',
        apiKey: document.getElementById('cfg-wa-key')?.value.trim() || '',
        sessionId: document.getElementById('cfg-wa-session')?.value.trim() || '',
        targetNumber: document.getElementById('cfg-wa-target')?.value.trim() || '',
        enabled: !!document.getElementById('cfg-wa-enabled')?.checked
      },
      schedules: {
        MOD1: {
          time: timeMod1,
          cron: this.timeToCron(timeMod1),
          label: 'Pagi (MOD 1)',
          enabled: true
        },
        MOD2: {
          time: timeMod2,
          cron: this.timeToCron(timeMod2),
          label: 'Sore (MOD 2)',
          enabled: true
        },
        MOD: {
          time: timeMod,
          cron: this.timeToCron(timeMod),
          label: 'Malam / Umum (MOD)',
          enabled: true
        }
      },
      messageTemplates: templates
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('✅ Pengaturan berhasil disimpan & Jadwal Cron diperbarui!', 'success');
        await this.loadConfig();
        await this.loadDutyData();
        await this.loadMatrixData();
      } else {
        this.showToast(`❌ Gagal: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  async testGoogleSheetConnection() {
    const btn = document.getElementById('btn-test-sheet');
    const resultBox = document.getElementById('sheet-test-result-box');
    const badgeStatus = document.getElementById('badge-sheet-conn-status');

    const sheetUrl = document.getElementById('cfg-sheet-url')?.value.trim() || '';
    const scriptWebhookUrl = document.getElementById('cfg-script-webhook')?.value.trim() || '';
    const sheetName = document.getElementById('cfg-sheet-name')?.value.trim() || 'October 2026';

    if (btn) {
      btn.innerHTML = '⏳ Sedang Menguji...';
      btn.disabled = true;
    }
    this.setStatus('🔍 Menguji sambungan dan akses ke Google Sheets...', 'working');
    this.setProgress(45);

    if (resultBox) {
      resultBox.classList.remove('hidden', 'success', 'error');
      resultBox.innerHTML = '⏳ Menghubungi Google Drive & memverifikasi izin akses...';
    }

    try {
      const res = await fetch('/api/sheet/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl, scriptWebhookUrl, sheetName })
      });
      const data = await res.json();

      this.setProgress(100, false);

      if (data.connected && data.success) {
        if (badgeStatus) {
          badgeStatus.innerHTML = '🟢 Terhubung';
          badgeStatus.className = 'status-pill status-badge-success';
        }
        if (resultBox) {
          resultBox.className = 'sheet-test-result-box success';
          resultBox.innerHTML = `
            <strong>✅ Sambungan Google Sheet Berhasil!</strong><br>
            • <strong>Metode:</strong> ${data.method || 'Google Drive API'}<br>
            • <strong>Tab Terbaca:</strong> ${data.sheetName || sheetName}<br>
            • <strong>Petugas Ditemukan:</strong> ${data.officersCount || 0} orang<br>
            <span class="text-xs">Data jadwal berhasil disinkronkan ke sistem lokal web secara otomatis.</span>
          `;
        }
        this.setStatus(`✅ Google Sheets Terhubung & Tersinkronisasi (${data.officersCount || 0} Petugas)`, 'ready');
        this.showToast('✅ Google Sheets berhasil terhubung!', 'success');
        await this.loadDutyData();
        await this.loadMatrixData();
      } else {
        if (badgeStatus) {
          badgeStatus.innerHTML = '🔴 Belum Terhubung';
          badgeStatus.className = 'status-pill status-badge-failed';
        }
        if (resultBox) {
          resultBox.className = 'sheet-test-result-box error';
          resultBox.innerHTML = `
            <strong>⚠️ Akses Google Sheet Belum Diberikan</strong><br>
            • <strong>Penyebab:</strong> ${data.error || 'Izin akses privat ditolak Google (404/Restricted)'}.<br>
            • <strong>Solusi:</strong> Tambahkan email di atas ke menu <strong>Bagikan (Share)</strong> pada Google Sheet Anda, atau ubah akses menjadi "Siapa saja yang memiliki link".
          `;
        }
        this.setStatus('⚠️ Google Sheets belum dapat diakses', 'error');
        this.showToast('Akses Google Sheets belum terbuka.', 'error');
      }
    } catch (e) {
      this.setProgress(100, false);
      if (badgeStatus) {
        badgeStatus.innerHTML = '🔴 Error';
        badgeStatus.className = 'status-pill status-badge-failed';
      }
      if (resultBox) {
        resultBox.className = 'sheet-test-result-box error';
        resultBox.innerHTML = `<strong>❌ Terjadi kesalahan:</strong> ${e.message}`;
      }
      this.setStatus(`❌ Error: ${e.message}`, 'error');
      this.showToast(`Error: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.innerHTML = '🔍 Uji & Hubungkan Sekarang';
        btn.disabled = false;
      }
    }
  },

  async loadMasterOfficers() {
    try {
      const res = await fetch('/api/officers');
      const data = await res.json();
      this.masterOfficers = data.officers || [];
      this.renderMasterOfficersTable(this.masterOfficers);
    } catch (e) {
      console.error('Failed to load master officers:', e);
    }
  },

  renderMasterOfficersTable(list) {
    const tbody = document.getElementById('officers-master-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Belum ada data master karyawan. Klik "➕ Tambah Karyawan" untuk memulai.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((o, idx) => {
      const isActive = o.isActive === 1 || o.isActive === true;
      const statusBadge = isActive
        ? '<span class="status-badge-success">Aktif</span>'
        : '<span class="status-badge-failed">Nonaktif</span>';
      
      const toggleBtnText = isActive ? 'Nonaktifkan' : 'Aktifkan';
      const phoneDisplay = o.phone ? `<code>${o.phone}</code>` : '<span class="text-muted">-</span>';

      return `
        <tr data-name="${(o.name || '').toLowerCase()}" data-role="${(o.role || '').toLowerCase()}">
          <td class="text-center">${idx + 1}</td>
          <td><strong>${o.name}</strong></td>
          <td>${o.role}</td>
          <td>${phoneDisplay}</td>
          <td>${statusBadge}</td>
          <td class="text-center" style="white-space:nowrap;">
            <button class="btn btn-tbl-xs btn-outline" onclick="app.openEditOfficerModal(${o.id})" title="Edit Karyawan">✏️</button>
            <button class="btn btn-tbl-xs btn-secondary" onclick="app.toggleOfficerStatus(${o.id}, ${isActive ? 0 : 1})" title="${toggleBtnText}">${isActive ? '⏸️' : '▶️'}</button>
            <button class="btn btn-tbl-xs btn-remove-officer" onclick="app.deleteOfficerMaster(${o.id}, '${(o.name || '').replace(/'/g, "\\'")}')" title="Hapus Permanen">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterMasterOfficers(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('#officers-master-tbody tr').forEach(tr => {
      const name = tr.getAttribute('data-name') || '';
      const role = tr.getAttribute('data-role') || '';
      tr.style.display = (name.includes(q) || role.includes(q)) ? '' : 'none';
    });
  },

  openAddOfficerModal() {
    const titleEl = document.getElementById('modal-officer-title');
    if (titleEl) titleEl.innerText = '➕ Tambah Karyawan Baru';
    document.getElementById('edit-officer-id').value = '';
    document.getElementById('new-officer-name').value = '';
    document.getElementById('new-officer-role').value = '';
    document.getElementById('new-officer-phone').value = '';
    document.getElementById('new-officer-active').checked = true;
    document.getElementById('modal-officer')?.classList.remove('hidden');
    document.getElementById('new-officer-name')?.focus();
  },

  openEditOfficerModal(id) {
    const officer = this.masterOfficers.find(o => o.id === id);
    if (!officer) return;

    const titleEl = document.getElementById('modal-officer-title');
    if (titleEl) titleEl.innerText = '✏️ Edit Data Karyawan';
    document.getElementById('edit-officer-id').value = officer.id;
    document.getElementById('new-officer-name').value = officer.name;
    document.getElementById('new-officer-role').value = officer.role;
    document.getElementById('new-officer-phone').value = officer.phone || '';
    document.getElementById('new-officer-active').checked = (officer.isActive === 1 || officer.isActive === true);
    document.getElementById('modal-officer')?.classList.remove('hidden');
    document.getElementById('new-officer-name')?.focus();
  },

  closeOfficerModal() {
    document.getElementById('modal-officer')?.classList.add('hidden');
  },

  async saveOfficerMaster() {
    const id = document.getElementById('edit-officer-id')?.value;
    const name = document.getElementById('new-officer-name')?.value.trim();
    const role = document.getElementById('new-officer-role')?.value.trim();
    const phone = document.getElementById('new-officer-phone')?.value.trim();
    const isActive = document.getElementById('new-officer-active')?.checked ? 1 : 0;

    if (!name || !role) {
      this.showToast('Nama dan Jabatan wajib diisi!', 'error');
      return;
    }

    const payload = { name, role, phone, isActive };
    const url = id ? `/api/officers/${id}` : '/api/officers';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message || 'Data karyawan berhasil disimpan!', 'success');
        this.closeOfficerModal();
        await this.loadMasterOfficers();
      } else {
        this.showToast(`❌ Gagal: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  async toggleOfficerStatus(id, newStatus) {
    const officer = this.masterOfficers.find(o => o.id === id);
    if (!officer) return;

    try {
      const res = await fetch(`/api/officers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: officer.name,
          role: officer.role,
          phone: officer.phone,
          isActive: newStatus
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Status karyawan "${officer.name}" diperbarui!`, 'success');
        await this.loadMasterOfficers();
      } else {
        this.showToast(`Gagal: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  async deleteOfficerMaster(id, name) {
    if (!confirm(`Apakah Anda yakin ingin menghapus "${name}" dari master data karyawan?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/officers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Karyawan "${name}" berhasil dihapus.`, 'success');
        await this.loadMasterOfficers();
      } else {
        this.showToast(`Gagal: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  async loadEditorData() {
    try {
      const sheetName = `${this.editorMonth} ${this.editorYear}`;
      const res = await fetch(`/api/schedule/current?sheet=${encodeURIComponent(sheetName)}`);
      const data = await res.json();
      
      if (data.officers && data.officers.length > 0) {
        this.editorOfficers = JSON.parse(JSON.stringify(data.officers));
      } else {
        const activeMasters = this.masterOfficers.filter(o => o.isActive === 1 || o.isActive === true);
        this.editorOfficers = activeMasters.map(o => ({
          name: o.name,
          role: o.role,
          shifts: {}
        }));
      }

      this.renderEditorTable();
    } catch (e) {
      console.error('Failed to load editor data:', e);
    }
  },

  renderEditorTable() {
    const daysTr = document.getElementById('editor-head-days');
    const datesTr = document.getElementById('editor-head-dates');
    const tbody = document.getElementById('editor-tbody');

    if (!daysTr || !datesTr || !tbody) return;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIdx = monthNames.indexOf(this.editorMonth) !== -1 ? monthNames.indexOf(this.editorMonth) : 9;
    const daysInMonth = new Date(this.editorYear, monthIdx + 1, 0).getDate();

    let daysHtml = `<th rowspan="2">Aksi</th><th rowspan="2">Nama Petugas</th><th rowspan="2">Jabatan</th>`;
    let datesHtml = '';

    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    for (let d = 1; d <= 31; d++) {
      if (d <= daysInMonth) {
        const dateObj = new Date(this.editorYear, monthIdx, d);
        const dayStr = dayNames[dateObj.getDay()];
        const isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6);
        const style = isWeekend ? 'style="color:#f43f5e;"' : '';
        datesHtml += `<th ${style} title="${dayStr}">${String(d).padStart(2, '0')}<br><small>${dayStr}</small></th>`;
      } else {
        datesHtml += `<th style="opacity:0.3">-</th>`;
      }
    }
    daysHtml += `<th colspan="31" class="text-center">Tanggal (${this.editorMonth} ${this.editorYear})</th><th rowspan="2">Total</th>`;

    daysTr.innerHTML = daysHtml;
    datesTr.innerHTML = datesHtml;

    if (this.editorOfficers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="35" class="text-center py-4">Belum ada petugas di jadwal ini. Klik "➕ Tambah Petugas" atau "⚡ Generate Otomatis".</td></tr>`;
      return;
    }

    tbody.innerHTML = this.editorOfficers.map((o, oIdx) => {
      let shiftCells = '';
      let totalCount = 0;

      for (let d = 1; d <= 31; d++) {
        if (d <= daysInMonth) {
          const s = (o.shifts && o.shifts[d]) || '';
          let badge = '';
          if (s === 'MOD1') {
            totalCount++;
            badge = '<span class="matrix-badge-mod1">MOD1</span>';
          } else if (s === 'MOD2') {
            totalCount++;
            badge = '<span class="matrix-badge-mod2">MOD2</span>';
          } else if (s === 'MOD') {
            totalCount++;
            badge = '<span class="matrix-badge-mod">MOD</span>';
          }

          shiftCells += `
            <td class="clickable-shift" onclick="app.cycleShift(${oIdx}, ${d})" title="Klik untuk ubah shift (Day ${d})">
              ${badge}
            </td>
          `;
        } else {
          shiftCells += `<td style="opacity:0.2">-</td>`;
        }
      }

      return `
        <tr>
          <td class="text-center">
            <button class="btn-remove-officer" onclick="app.removeOfficer(${oIdx})" title="Hapus Petugas">🗑️</button>
          </td>
          <td><strong>${o.name}</strong></td>
          <td>${o.role}</td>
          ${shiftCells}
          <td class="text-center"><strong>${totalCount}</strong></td>
        </tr>
      `;
    }).join('');
  },

  cycleShift(officerIdx, day) {
    if (!this.editorOfficers[officerIdx]) return;
    if (!this.editorOfficers[officerIdx].shifts) {
      this.editorOfficers[officerIdx].shifts = {};
    }

    const current = this.editorOfficers[officerIdx].shifts[day] || '';
    let next = '';
    if (current === '') next = 'MOD1';
    else if (current === 'MOD1') next = 'MOD2';
    else if (current === 'MOD2') next = 'MOD';
    else if (current === 'MOD') next = '';

    if (next) {
      this.editorOfficers[officerIdx].shifts[day] = next;
    } else {
      delete this.editorOfficers[officerIdx].shifts[day];
    }

    this.renderEditorTable();
  },

  removeOfficer(idx) {
    if (!this.editorOfficers[idx]) return;
    const name = this.editorOfficers[idx].name;
    if (confirm(`Apakah Anda yakin ingin menghapus "${name}" dari jadwal ini?`)) {
      this.editorOfficers.splice(idx, 1);
      this.renderEditorTable();
      this.showToast(`Petugas "${name}" dihapus.`, 'success');
    }
  },

  async autoGenerateSchedule() {
    if (this.editorOfficers.length === 0) {
      this.showToast('Tambahkan minimal 1 petugas terlebih dahulu!', 'error');
      return;
    }

    if (!confirm(`Generate rotasi jadwal otomatis untuk ${this.editorOfficers.length} petugas di ${this.editorMonth} ${this.editorYear}?`)) {
      return;
    }

    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: this.editorMonth,
          year: this.editorYear,
          officers: this.editorOfficers
        })
      });
      const data = await res.json();
      if (data.success) {
        this.editorOfficers = data.schedule.officers;
        this.renderEditorTable();
        this.showToast('⚡ Jadwal otomatis berhasil dibuat!', 'success');
      } else {
        this.showToast(`Gagal generate: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  async saveEditorSchedule() {
    const sheetName = `${this.editorMonth} ${this.editorYear}`;
    const btn = document.getElementById('btn-save-editor-schedule');
    if (btn) {
      btn.innerHTML = '⏳ Menyimpan...';
      btn.disabled = true;
    }

    try {
      const res = await fetch('/api/schedule/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetName,
          officers: this.editorOfficers
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('✅ Jadwal berhasil disimpan ke sistem!', 'success');
        await this.loadDutyData();
        await this.loadMatrixData();
      } else {
        this.showToast(`❌ Gagal simpan: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.innerHTML = '💾 Simpan Jadwal ke Sistem';
        btn.disabled = false;
      }
    }
  },

  exportCsv() {
    const sheetName = `${this.editorMonth} ${this.editorYear}`;
    window.open(`/api/schedule/export?sheet=${encodeURIComponent(sheetName)}`, '_blank');
  },

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.className = `toast ${type}`;
    toast.innerText = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
