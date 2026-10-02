const app = {
  currentDate: new Date(),
  selectedShift: 'ALL',
  pendingModalShift: 'ALL',
  cachedDuty: null,
  cachedMatrix: null,
  config: null,
  editorOfficers: [],
  masterOfficers: [],
  editorDrafts: {},
  editorTargetMode: 'current',
  nextMonthTabOpen: false,
  editorMonth: 'October',
  editorYear: 2026,
  matrixMonth: 'October',
  matrixYear: 2026,
  currentUser: null,
  currentTemplateKey: 'MOD1',
  pendingConfirmCallback: null,

  async init() {
    this.startClock();
    this.initDateSelector();
    this.setupEventListeners();
    this.checkAuth();
  },

  checkAuth() {
    let userJson = localStorage.getItem('mod_auth_user');
    if (!userJson) {
      // Auto-initialize default admin session
      const defaultUser = { id: 1, username: 'admin', name: 'Administrator MOD', role: 'admin' };
      localStorage.setItem('mod_auth_user', JSON.stringify(defaultUser));
      userJson = JSON.stringify(defaultUser);
    }
    try {
      this.currentUser = JSON.parse(userJson);
      this.updateUserProfileUI();
      this.hideLoginOverlay();
    } catch (e) {
      this.currentUser = { id: 1, username: 'admin', name: 'Administrator MOD', role: 'admin' };
      this.updateUserProfileUI();
      this.hideLoginOverlay();
    }
    this.loadInitialData();
  },

  showLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
      overlay.style.visibility = 'visible';
      overlay.style.pointerEvents = 'auto';
      const input = document.getElementById('login-username');
      if (input) setTimeout(() => input.focus(), 80);
    }
  },

  hideLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
      overlay.style.visibility = 'hidden';
      overlay.style.pointerEvents = 'none';
    }
  },

  async loadInitialData() {
    this.setStatus('⚡ Memuat dashboard & data jadwal...', 'working');
    this.setProgress(30);

    // Load all data in parallel for instant page render (<50ms)
    await Promise.allSettled([
      this.loadConfig(),
      this.loadDutyData(),
      this.loadMatrixData(),
      this.loadMasterOfficers(),
      this.loadLogs(),
      this.loadUsersList()
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
    
    const setGSheetBadge = document.getElementById('settings-badge-gsheet');
    const setWaBadge = document.getElementById('settings-badge-wa');
    const setCronBadge = document.getElementById('settings-badge-cron');

    if (sheetPill && this.config && this.config.spreadsheet) {
      const sheetTxt = `📊 GSheet: ${this.config.spreadsheet.activeSheetName || 'Aktif'}`;
      sheetPill.innerText = sheetTxt;
      if (setGSheetBadge) setGSheetBadge.innerText = sheetTxt;
    }
    if (waPill && this.config && this.config.waGateway) {
      const target = (this.config.waGateway.targetNumber || '').split('@')[0];
      const waTxt = `🤖 WA: ${this.config.waGateway.enabled ? 'Aktif' : 'Nonaktif'} (${target || 'Grup'})`;
      waPill.innerText = waTxt;
      if (setWaBadge) setWaBadge.innerText = waTxt;
    }
    if (cronPill && this.config && this.config.schedules) {
      const cronTxt = `⏰ Cron: ${this.config.schedules.MOD1?.time || '09:00'}, ${this.config.schedules.MOD2?.time || '16:00'}, ${this.config.schedules.MOD?.time || '18:00'} WIB`;
      cronPill.innerText = cronTxt;
      if (setCronBadge) setCronBadge.innerText = cronTxt;
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
        } else if (tabId === 'tab-settings') {
          this.loadUsersList();
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

    // Matrix: Month & Year change
    const mSelect = document.getElementById('matrix-month');
    const ySelect = document.getElementById('matrix-year');
    if (mSelect) {
      mSelect.addEventListener('change', () => {
        const m = mSelect.value;
        const y = document.getElementById('matrix-year')?.value || 2026;
        this.loadMatrixData(m, y, false);
      });
    }
    if (ySelect) {
      ySelect.addEventListener('change', () => {
        const m = document.getElementById('matrix-month')?.value || 'October';
        const y = ySelect.value;
        this.loadMatrixData(m, y, false);
      });
    }

    // Matrix: Load month button
    const btnMatrixLoad = document.getElementById('btn-matrix-load');
    if (btnMatrixLoad) {
      btnMatrixLoad.addEventListener('click', () => {
        const m = document.getElementById('matrix-month')?.value || 'October';
        const y = document.getElementById('matrix-year')?.value || 2026;
        this.loadMatrixData(m, y, true);
      });
    }

    // Matrix: Refresh button
    const btnRefreshMatrix = document.getElementById('btn-refresh-matrix');
    if (btnRefreshMatrix) {
      btnRefreshMatrix.addEventListener('click', () => {
        const m = document.getElementById('matrix-month')?.value || 'October';
        const y = document.getElementById('matrix-year')?.value || 2026;
        this.loadMatrixData(m, y, true);
      });
    }

    // Matrix: Search input
    const matrixSearch = document.getElementById('matrix-search');
    if (matrixSearch) {
      matrixSearch.addEventListener('input', (e) => {
        this.filterMatrixTable(e.target.value);
      });
    }

    // Modal Confirmation Action: Proceed button
    const btnModalActionConfirm = document.getElementById('btn-modal-action-confirm');
    if (btnModalActionConfirm) {
      btnModalActionConfirm.addEventListener('click', () => {
        if (typeof this.pendingConfirmCallback === 'function') {
          this.pendingConfirmCallback();
        }
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
        this.switchTemplate(e.target.value);
      });
    }

    // Template text change
    const tmplText = document.getElementById('cfg-template-text');
    if (tmplText) {
      tmplText.addEventListener('input', (e) => {
        const selected = document.getElementById('cfg-template-select')?.value || this.currentTemplateKey || 'MOD1';
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

    // Toggle Password Visibility in Login Form
    const btnTogglePwd = document.getElementById('btn-toggle-pwd');
    if (btnTogglePwd) {
      btnTogglePwd.addEventListener('click', () => {
        const pwdInput = document.getElementById('login-password');
        if (pwdInput) {
          pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
        }
      });
    }

    // User Profile Dropdown & Modal Open Click Delegation
    document.addEventListener('click', (e) => {
      const target = e.target;
      const dropdownMenu = document.getElementById('user-dropdown-menu');

      // Click on Profile button -> toggle dropdown
      if (target.closest('#btn-user-profile')) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleUserDropdown();
        return;
      }

      // Click on Change Password item
      if (target.closest('#btn-open-change-pwd')) {
        e.preventDefault();
        e.stopPropagation();
        this.openChangePasswordModal();
        return;
      }

      // Click on User Management item
      if (target.closest('#btn-open-user-mgmt')) {
        e.preventDefault();
        e.stopPropagation();
        this.openUsersManagementModal();
        return;
      }

      // Click on Logout item
      if (target.closest('#btn-logout')) {
        e.preventDefault();
        e.stopPropagation();
        this.logout();
        return;
      }

      // Clicking outside user dropdown closes it
      if (!target.closest('#user-dropdown-container')) {
        this.hideUserDropdown();
      }
    });

    // Close modals when clicking directly on dark backdrop
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          this.closeModal(backdrop.id);
        }
      });
    });

    // Submit Change Password
    const btnSubmitChangePwd = document.getElementById('btn-submit-change-pwd');
    if (btnSubmitChangePwd) {
      btnSubmitChangePwd.addEventListener('click', () => {
        this.submitChangePassword();
      });
    }

    // User Management: Open Create Modal
    const btnOpenCreateUser = document.getElementById('btn-open-create-user');
    if (btnOpenCreateUser) {
      btnOpenCreateUser.addEventListener('click', () => {
        this.openCreateUserModal();
      });
    }

    // User Form: Save User
    const btnSaveUserForm = document.getElementById('btn-save-user-form');
    if (btnSaveUserForm) {
      btnSaveUserForm.addEventListener('click', () => {
        this.saveUserForm();
      });
    }

    // Reset Password: Submit
    const btnSubmitResetPwd = document.getElementById('btn-submit-reset-pwd');
    if (btnSubmitResetPwd) {
      btnSubmitResetPwd.addEventListener('click', () => {
        this.submitResetUserPwd();
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

  formatDateWIB(dateObj = this.currentDate) {
    if (typeof dateObj === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateObj)) return dateObj;
      dateObj = new Date(dateObj);
    }
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(dateObj);
  },

  initDateSelector() {
    const wibDateStr = this.formatDateWIB(this.currentDate);
    const input = document.getElementById('date-selector');
    if (input) {
      input.value = wibDateStr;
    }
  },

  switchTab(tabId) {
    if (tabId === 'tab-settings' && this.currentUser && this.currentUser.role !== 'admin') {
      this.showToast('Hanya Administrator yang dapat mengakses menu Pengaturan.', 'error');
      tabId = 'tab-today';
    }

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

  switchTemplate(newShiftKey) {
    const textEl = document.getElementById('cfg-template-text');
    if (this.currentTemplateKey && textEl) {
      if (!this.config) this.config = {};
      if (!this.config.messageTemplates) this.config.messageTemplates = {};
      this.config.messageTemplates[this.currentTemplateKey] = textEl.value;
    }
    this.currentTemplateKey = newShiftKey;
    this.populateTemplateText(newShiftKey);
    this.updateWhatsAppPreview();
  },

  populateTemplateText(shiftKey) {
    this.currentTemplateKey = shiftKey;
    const selectEl = document.getElementById('cfg-template-select');
    if (selectEl && selectEl.value !== shiftKey) {
      selectEl.value = shiftKey;
    }
    const templates = (this.config && this.config.messageTemplates) || {};
    const textEl = document.getElementById('cfg-template-text');
    if (textEl) {
      textEl.value = templates[shiftKey] || '';
    }
  },

  async loadDutyData() {
    try {
      const dateStr = this.formatDateWIB();
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
      const dateStr = this.formatDateWIB();
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
      
      const schedules = (this.config && this.config.schedules) || {};
      const timeMap = {
        'MOD1': schedules.MOD1?.time || '09:00',
        'MOD2': schedules.MOD2?.time || '16:00',
        'MOD': schedules.MOD?.time || '18:00',
        'ALL': '08:00'
      };
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
    btn.innerHTML = '🔄 Menyinkronkan...';
    btn.disabled = true;
    this.setStatus('🔄 Menghubungi Google Sheets & menyinkronkan data...', 'working');
    this.setProgress(40);

    try {
      const sheetName = document.getElementById('cfg-sheet-name')?.value.trim() || this.config?.spreadsheet?.activeSheetName || 'October 2026';
      const res = await fetch('/api/schedule/sync', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ sheetName }) 
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`✅ Berhasil disinkronkan! Ditemukan ${data.officersCount} data petugas.`, 'success');
        this.setStatus(`✅ Google Sheets berhasil disinkronkan (${data.officersCount} Petugas)`, 'ready');
        this.setProgress(100, false);
        await this.loadDutyData();
        await this.loadMatrixData();
        if (typeof this.loadEditorData === 'function') {
          await this.loadEditorData();
        }
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

  async loadMatrixData(month = null, year = null, force = false) {
    if (month) this.matrixMonth = month;
    if (year) this.matrixYear = parseInt(year, 10);

    const mSelect = document.getElementById('matrix-month');
    const ySelect = document.getElementById('matrix-year');
    if (mSelect && mSelect.value !== this.matrixMonth) mSelect.value = this.matrixMonth;
    if (ySelect && parseInt(ySelect.value, 10) !== this.matrixYear) ySelect.value = this.matrixYear;

    const tbody = document.getElementById('matrix-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="35" class="text-center py-4">⏳ Memuat kalender matrix ${this.matrixMonth} ${this.matrixYear}...</td></tr>`;
    }

    try {
      const sheetName = `${this.matrixMonth} ${this.matrixYear}`;
      const url = `/api/schedule/current?sheet=${encodeURIComponent(sheetName)}${force ? '&force=true' : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      this.cachedMatrix = data;
      this.renderMatrixTable(data);
      if (force && data.officers && data.officers.length > 0) {
        const srcLabel = data.source === 'live_google_sheet' ? 'Google Sheets' : 'Database';
        this.showToast(`✅ Jadwal ${this.matrixMonth} ${this.matrixYear} berhasil dimuat dari ${srcLabel}!`, 'success');
      }
    } catch (e) {
      console.error('Failed to load matrix:', e);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="35" class="text-center py-4 text-danger">Gagal memuat jadwal: ${e.message}</td></tr>`;
      }
    }
  },

  renderMatrixTable(data) {
    const rawOfficers = data.officers || [];
    const officers = this.sortOfficersByLevel(rawOfficers);
    const daysTr = document.getElementById('matrix-head-days');
    const datesTr = document.getElementById('matrix-head-dates');
    const tbody = document.getElementById('matrix-tbody');

    if (!daysTr || !datesTr || !tbody) return;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNamesId = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    let targetMonth = this.matrixMonth || 'October';
    let targetYear = this.matrixYear || 2026;

    if (data.sheetName) {
      const parts = data.sheetName.split(' ');
      if (parts.length >= 2 && monthNames.includes(parts[0])) {
        targetMonth = parts[0];
        targetYear = parseInt(parts[1], 10) || targetYear;
      }
    }

    const monthIdx = monthNames.indexOf(targetMonth) !== -1 ? monthNames.indexOf(targetMonth) : 9;
    const daysInMonth = new Date(targetYear, monthIdx + 1, 0).getDate();
    const indMonthName = monthNamesId[monthIdx] || targetMonth;
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    // Headers
    let headHtml = `<th class="col-officer-no">No</th><th class="col-officer-name">Nama Petugas</th><th class="col-officer-role">Jabatan</th>`;

    for (let d = 1; d <= 31; d++) {
      if (d <= daysInMonth) {
        const dateObj = new Date(targetYear, monthIdx, d);
        const dayStr = dayNames[dateObj.getDay()];
        const isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6);
        const style = isWeekend ? 'style="color:#f43f5e;"' : '';
        headHtml += `<th ${style} title="${dayStr}, ${d} ${indMonthName}">${String(d).padStart(2, '0')}<br><small>${dayStr}</small></th>`;
      } else {
        headHtml += `<th style="opacity:0.3">-</th>`;
      }
    }
    headHtml += `<th class="col-total">Total</th>`;

    if (daysTr) daysTr.innerHTML = headHtml;
    if (datesTr) {
      datesTr.innerHTML = '';
      datesTr.style.display = 'none';
    }

    const tfoot = document.getElementById('matrix-tfoot');

    if (officers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="36" class="text-center py-4">Belum ada data jadwal untuk ${indMonthName} ${targetYear}. Silakan buka tab "Buat & Edit Jadwal" untuk membuatnya.</td></tr>`;
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    const dailyCounts = Array(32).fill(0);
    let grandTotal = 0;

    tbody.innerHTML = officers.map((o, idx) => {
      let shiftCells = '';
      let totalCount = 0;
      for (let d = 1; d <= 31; d++) {
        if (d <= daysInMonth) {
          const s = o.shifts ? o.shifts[d] : null;
          if (s) {
            totalCount++;
            dailyCounts[d]++;
            grandTotal++;
            let badgeClass = 'matrix-badge-mod';
            if (s === 'MOD1') badgeClass = 'matrix-badge-mod1';
            if (s === 'MOD2') badgeClass = 'matrix-badge-mod2';
            shiftCells += `<td><span class="${badgeClass}">${s}</span></td>`;
          } else {
            shiftCells += `<td></td>`;
          }
        } else {
          shiftCells += `<td style="opacity:0.2">-</td>`;
        }
      }

      return `
        <tr data-name="${(o.name || '').toLowerCase()}">
          <td class="col-officer-no text-center">${idx + 1}</td>
          <td class="col-officer-name">
            <strong class="officer-name-title">${o.name}</strong>
          </td>
          <td class="col-officer-role">${o.role || '-'}</td>
          ${shiftCells}
          <td class="text-center"><strong>${totalCount}</strong></td>
        </tr>
      `;
    }).join('');

    if (tfoot) {
      let summaryDailyCells = '';
      for (let d = 1; d <= 31; d++) {
        if (d <= daysInMonth) {
          const c = dailyCounts[d];
          const badgeClass = c > 1 ? 'matrix-count-badge multi-duty' : (c > 0 ? 'matrix-count-badge has-duty' : 'matrix-count-badge');
          summaryDailyCells += `<td><span class="${badgeClass}" title="Total ${c} petugas pada tanggal ${d}">${c}</span></td>`;
        } else {
          summaryDailyCells += `<td style="opacity:0.2">-</td>`;
        }
      }

      tfoot.innerHTML = `
        <tr class="matrix-summary-row">
          <td class="col-officer-no text-center">-</td>
          <td class="col-officer-name"><strong>JUMLAH MOD</strong></td>
          <td class="col-officer-role"><span class="text-muted text-xs">Total Harian</span></td>
          ${summaryDailyCells}
          <td class="text-center"><strong>${grandTotal}</strong></td>
        </tr>
      `;
    }
  },

  filterMatrixTable(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('#matrix-tbody tr').forEach(tr => {
      const name = tr.getAttribute('data-name') || '';
      tr.style.display = name.includes(q) ? '' : 'none';
    });
  },

  openShareLinkModal() {
    const shareUrl = `${window.location.origin}/jadwal`;
    const inputEl = document.getElementById('inp-share-url');
    const previewEl = document.getElementById('txt-share-preview');

    if (inputEl) inputEl.value = shareUrl;

    const waMsg = `🏨 *PORTAL JADWAL MANAGER ON DUTY (MOD)*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nLihat jadwal shift harian dan kalender matrix bulanan lengkap secara online melalui tautan berikut:\n\n🔗 ${shareUrl}\n\n_(Dapat dibuka langsung di HP)_\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n_Sistem Informasi MOD Dafam Hotel_`;

    if (previewEl) previewEl.value = waMsg;

    document.getElementById('modal-share-link')?.classList.remove('hidden');
  },

  copyShareUrl() {
    const shareUrl = `${window.location.origin}/jadwal`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      this.showToast('📋 Link portal HP berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
      const el = document.getElementById('inp-share-url');
      if (el) { el.select(); document.execCommand('copy'); }
      this.showToast('📋 Link portal HP berhasil disalin!', 'success');
    });
  },

  copyShareWhatsAppText() {
    const previewEl = document.getElementById('txt-share-preview');
    const text = previewEl ? previewEl.value : `${window.location.origin}/jadwal`;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('📋 Pesan WhatsApp berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
      if (previewEl) { previewEl.select(); document.execCommand('copy'); }
      this.showToast('📋 Pesan WhatsApp berhasil disalin!', 'success');
    });
  },

  openShareToWhatsAppDirect() {
    const previewEl = document.getElementById('txt-share-preview');
    const text = previewEl ? previewEl.value : `${window.location.origin}/jadwal`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  },

  openChangeScheduleModal() {
    if (!this.sigPadsInitialized) {
      this.initSignaturePads();
      this.sigPadsInitialized = true;
    }

    const appSelect = document.getElementById('cs-applicant');
    const targetSelect = document.getElementById('cs-target');

    const officers = (this.cachedMatrix && this.cachedMatrix.officers && this.cachedMatrix.officers.length > 0)
      ? this.cachedMatrix.officers
      : ((this.masterData && this.masterData.officers) ? this.masterData.officers : (this.scheduleData?.officers || []));

    const sorted = [...officers].sort((a, b) => {
      const order = { 'GM': 1, 'HOD': 2, 'ASSISTANT': 3, 'SUPERVISOR': 4, 'STAFF': 5 };
      return (order[a.level] || 99) - (order[b.level] || 99);
    });

    const optionsHtml = '<option value="">-- Pilih Nama Petugas --</option>' + sorted.map(o => {
      return `<option value="${o.name}">${o.name} (${o.role || o.level || 'Petugas'})</option>`;
    }).join('');

    if (appSelect) appSelect.innerHTML = optionsHtml;
    if (targetSelect) targetSelect.innerHTML = optionsHtml;

    document.getElementById('modal-change-schedule')?.classList.remove('hidden');

    setTimeout(() => {
      ['p1', 'p2', 'hrm', 'gm'].forEach(k => {
        const c = document.getElementById(`sig-canvas-${k}`);
        if (c) this.resizeCanvas(c);
        this.clearSig(k);
      });
      this.updateValidationState();
    }, 100);
  },

  initSignaturePads() {
    this.sigPads = {};
    ['p1', 'p2', 'hrm', 'gm'].forEach(key => {
      const canvas = document.getElementById(`sig-canvas-${key}`);
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      this.resizeCanvas(canvas);

      const pad = {
        key,
        canvas,
        ctx,
        isDrawing: false,
        strokes: 0,
        hasDrawn: false
      };
      this.sigPads[key] = pad;

      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
        return {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      };

      const startDraw = (e) => {
        const app = document.getElementById('cs-applicant')?.value.trim();
        const dateFrom = document.getElementById('cs-date-from')?.value.trim();
        const target = document.getElementById('cs-target')?.value.trim();
        const dateTo = document.getElementById('cs-date-to')?.value.trim();

        if (!app || !dateFrom || !target || !dateTo) {
          e.preventDefault();
          this.showToast('⚠️ Silakan lengkapi data Pihak 1 dan Pihak 2 terlebih dahulu!', 'error');
          return;
        }

        e.preventDefault();
        pad.isDrawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.strokeStyle = '#38bdf8'; // Glowing cyan signature stroke
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        document.getElementById(`hint-sig-${key}`)?.classList.add('hidden');
      };

      const draw = (e) => {
        if (!pad.isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        pad.strokes++;
      };

      const endDraw = (e) => {
        if (!pad.isDrawing) return;
        pad.isDrawing = false;
        ctx.closePath();
        if (pad.strokes > 3) {
          pad.hasDrawn = true;
          this.updateSignatureStatus(key, true);
        }
        this.updateValidationState();
      };

      // Mouse
      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', endDraw);
      canvas.addEventListener('mouseleave', endDraw);

      // Touch
      canvas.addEventListener('touchstart', startDraw, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', endDraw, { passive: false });
    });
  },

  resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width > 0 ? rect.width : 320;
    const h = rect.height > 0 ? rect.height : 105;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx.resetTransform) {
      ctx.resetTransform();
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.scale(dpr, dpr);
  },

  clearSig(key) {
    if (!this.sigPads) return;
    const pad = this.sigPads[key];
    if (!pad) return;
    pad.ctx.clearRect(0, 0, pad.canvas.width, pad.canvas.height);
    pad.strokes = 0;
    pad.hasDrawn = false;
    document.getElementById(`hint-sig-${key}`)?.classList.remove('hidden');
    this.updateSignatureStatus(key, false);
    this.updateValidationState();
  },

  updateSignatureStatus(key, isSigned) {
    const card = document.getElementById(`card-sig-${key}`);
    const statusEl = document.getElementById(`status-sig-${key}`);
    if (isSigned) {
      card?.classList.add('signed');
      if (statusEl) {
        statusEl.className = 'sig-status verified';
        statusEl.innerHTML = '✅ Terverifikasi (Digital Signature)';
      }
    } else {
      card?.classList.remove('signed');
      if (statusEl) {
        statusEl.className = 'sig-status waiting';
        statusEl.innerHTML = '❌ Belum Ditandatangani';
      }
    }
  },

  updateValidationState() {
    let signedCount = 0;
    if (this.sigPads) {
      ['p1', 'p2', 'hrm', 'gm'].forEach(k => {
        if (this.sigPads[k] && this.sigPads[k].hasDrawn) signedCount++;
      });
    }

    const badge = document.getElementById('sig-counter-badge');
    if (badge) {
      badge.innerText = `${signedCount} / 4 Tanda Tangan`;
      if (signedCount === 4) {
        badge.className = 'sig-counter-badge complete';
        badge.innerText = '✅ 4 / 4 Tanda Tangan Lengkap';
      } else {
        badge.className = 'sig-counter-badge';
      }
    }

    const app = document.getElementById('cs-applicant')?.value.trim();
    const dateFrom = document.getElementById('cs-date-from')?.value.trim();
    const target = document.getElementById('cs-target')?.value.trim();
    const dateTo = document.getElementById('cs-date-to')?.value.trim();
    const btnSubmit = document.getElementById('btn-submit-change-schedule');

    const isPihakComplete = Boolean(app) && Boolean(dateFrom) && Boolean(target) && Boolean(dateTo);
    const sigSection = document.getElementById('cs-sig-section');
    const sigBanner = document.getElementById('sig-lock-banner');

    if (sigSection) {
      if (isPihakComplete) {
        sigSection.classList.remove('sig-locked');
        if (sigBanner) {
          sigBanner.className = 'sig-lock-banner unlocked';
          sigBanner.innerHTML = '🔓 Data Pihak 1 & 2 Lengkap. Silakan bubuhkan 4 Tanda Tangan Digital di bawah.';
        }
      } else {
        sigSection.classList.add('sig-locked');
        if (sigBanner) {
          sigBanner.className = 'sig-lock-banner';
          sigBanner.innerHTML = '🔒 Lengkapi data Pihak 1 & Pihak 2 terlebih dahulu untuk membuka lembar tanda tangan';
        }
      }
    }

    const isValid = isPihakComplete && (signedCount === 4);

    if (btnSubmit) {
      if (isValid) {
        btnSubmit.disabled = false;
        btnSubmit.innerText = '🚀 Terapkan & Kirim ke WA Group';
      } else {
        btnSubmit.disabled = true;
        if (!isPihakComplete) {
          btnSubmit.innerText = '⚠️ Lengkapi Data Pihak 1 & Pihak 2';
        } else if (signedCount < 4) {
          btnSubmit.innerText = `🔒 Lengkapi ${4 - signedCount} Tanda Tangan Lagi`;
        } else {
          btnSubmit.innerText = '⚠️ Pilih Tanggal Shift';
        }
      }
    }
  },

  onApplicantChange() {
    const appName = document.getElementById('cs-applicant')?.value.trim();
    const lbl = document.getElementById('lbl-sig-p1-name');
    if (lbl) lbl.innerText = appName || '(Pilih Pemohon)';

    const dateSelect = document.getElementById('cs-date-from');
    if (!dateSelect) return;

    if (!appName) {
      dateSelect.innerHTML = '<option value="">-- Pilih Nama Petugas Dahulu --</option>';
      this.updateValidationState();
      return;
    }

    const availableShifts = this.getUpcomingShiftsForOfficer(appName);
    if (availableShifts.length === 0) {
      dateSelect.innerHTML = '<option value="">-- Pilih Tanggal Shift Asal --</option><option value="" disabled>(Tidak ada jadwal shift terdaftar di bulan ini)</option>';
    } else {
      dateSelect.innerHTML = '<option value="">-- Pilih Tanggal Shift Asal --</option>' + availableShifts.map(s => {
        return `<option value="${s.dateStr}" data-shift="${s.shift}">${s.label}</option>`;
      }).join('');
    }

    this.onDateFromChange();
  },

  onDateFromChange() {
    const dateSelect = document.getElementById('cs-date-from');
    const selectedOpt = dateSelect?.options[dateSelect.selectedIndex];
    const shiftKey = selectedOpt?.getAttribute('data-shift') || 'MOD';
    const shiftSelect = document.getElementById('cs-shift-from');
    if (shiftSelect && shiftKey) shiftSelect.value = shiftKey;
    this.updateValidationState();
  },

  onTargetChange() {
    const targetName = document.getElementById('cs-target')?.value.trim();
    const lbl = document.getElementById('lbl-sig-p2-name');
    if (lbl) lbl.innerText = targetName || '(Pilih Pengganti)';

    const dateSelect = document.getElementById('cs-date-to');
    if (!dateSelect) return;

    if (!targetName) {
      dateSelect.innerHTML = '<option value="">-- Pilih Nama Pengganti Dahulu --</option>';
      this.updateValidationState();
      return;
    }

    const availableShifts = this.getUpcomingShiftsForOfficer(targetName);
    let optionsHtml = '<option value="">-- Pilih Tanggal Shift Pengganti --</option>';
    if (availableShifts.length > 0) {
      optionsHtml += availableShifts.map(s => {
        return `<option value="${s.dateStr}" data-shift="${s.shift}">${s.label}</option>`;
      }).join('');
    } else {
      optionsHtml += '<option value="" disabled>(Tidak ada jadwal shift terdaftar di bulan ini)</option>';
    }

    dateSelect.innerHTML = optionsHtml;
    this.onDateToChange();
  },

  onDateToChange() {
    const dateSelect = document.getElementById('cs-date-to');
    const selectedOpt = dateSelect?.options[dateSelect.selectedIndex];
    const shiftKey = selectedOpt?.getAttribute('data-shift') || 'MOD';
    const shiftSelect = document.getElementById('cs-shift-to');
    if (shiftSelect && shiftKey) shiftSelect.value = shiftKey;
    this.updateValidationState();
  },

  getUpcomingShiftsForOfficer(officerName) {
    const results = [];
    if (!officerName) return results;

    const officers = (this.cachedMatrix && this.cachedMatrix.officers && this.cachedMatrix.officers.length > 0)
      ? this.cachedMatrix.officers
      : (this.masterOfficers || this.officers || []);

    const cleanName = officerName.trim().toLowerCase();
    const officer = officers.find(o => (o.name || '').trim().toLowerCase() === cleanName);
    if (!officer || !officer.shifts) return results;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNamesId = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    let targetMonth = this.matrixMonth || 'October';
    let targetYear = this.matrixYear || 2026;

    if (this.cachedMatrix && this.cachedMatrix.sheetName) {
      const parts = this.cachedMatrix.sheetName.split(' ');
      if (parts.length >= 2 && monthNames.includes(parts[0])) {
        targetMonth = parts[0];
        targetYear = parseInt(parts[1], 10) || targetYear;
      }
    }

    const mIdx = monthNames.indexOf(targetMonth) !== -1 ? monthNames.indexOf(targetMonth) : 9;
    const daysInMonth = new Date(targetYear, mIdx + 1, 0).getDate();

    const today = new Date();
    const isCurrentMonthYear = (today.getFullYear() === targetYear && today.getMonth() === mIdx);
    const minDay = isCurrentMonthYear ? today.getDate() : 1;

    for (let d = 1; d <= daysInMonth; d++) {
      const shift = officer.shifts[d];
      if (shift && (d >= minDay || !isCurrentMonthYear)) {
        const dObj = new Date(targetYear, mIdx, d);
        const dayStr = dayNames[dObj.getDay()];
        const dateStr = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        results.push({
          day: d,
          dateStr,
          shift,
          label: `Tanggal ${d} ${monthNamesId[mIdx]} (${dayStr}) - Shift ${shift}`
        });
      }
    }
    return results;
  },

  getFallbackDatesHtml() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'Desember'];
    const monthNamesId = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    const targetMonth = this.matrixMonth || 'October';
    const targetYear = this.matrixYear || 2026;
    const mIdx = monthNames.indexOf(targetMonth) !== -1 ? monthNames.indexOf(targetMonth) : 9;
    const daysInMonth = new Date(targetYear, mIdx + 1, 0).getDate();

    let html = '';
    for (let d = 1; d <= daysInMonth; d++) {
      const dObj = new Date(targetYear, mIdx, d);
      const dayStr = dayNames[dObj.getDay()];
      const dateStr = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      html += `<option value="${dateStr}">Tanggal ${d} ${monthNamesId[mIdx]} (${dayStr})</option>`;
    }
    return html;
  },

  formatIndonesianDateStr(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${dayNames[dObj.getDay()]}, ${dObj.getDate()} ${monthNames[dObj.getMonth()]} ${dObj.getFullYear()}`;
  },

  buildChangeScheduleMessage() {
    const applicant = document.getElementById('cs-applicant')?.value.trim() || '(Nama Pemohon)';
    const dateFromEl = document.getElementById('cs-date-from');
    const dateFromOpt = dateFromEl ? dateFromEl.options[dateFromEl.selectedIndex] : null;
    const dateFrom = dateFromEl?.value || '';
    const shiftFrom = dateFromOpt?.getAttribute('data-shift') || document.getElementById('cs-shift-from')?.value || 'MOD';

    const target = document.getElementById('cs-target')?.value.trim() || '(Nama Pengganti)';
    const dateToEl = document.getElementById('cs-date-to');
    const dateToOpt = dateToEl ? dateToEl.options[dateToEl.selectedIndex] : null;
    const dateTo = dateToEl?.value || '';
    const shiftTo = dateToOpt?.getAttribute('data-shift') || document.getElementById('cs-shift-to')?.value || 'MOD';

    const reason = document.getElementById('cs-reason')?.value.trim() || 'Tukar jadwal MOD';

    const shiftLabels = {
      'MOD1': 'MOD 1 (Pagi 09:00 - 17:00 WIB)',
      'MOD2': 'MOD 2 (Sore 16:00 - 00:00 WIB)',
      'MOD': 'MOD (Sore 18:00 - 02:00 WIB)'
    };

    let msg = `🏨 *FORM PERUBAHAN JADWAL MOD (CHANGE SCHEDULE)*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📌 *DETAIL PERUBAHAN JADWAL:*\n`;
    msg += `👤 *1. Petugas Pemohon (Pihak 1):* ${applicant}\n`;
    msg += `📅 *Jadwal Asal:* ${this.formatIndonesianDateStr(dateFrom)}\n`;
    msg += `⏰ *Shift Asal:* ${shiftLabels[shiftFrom] || shiftFrom}\n\n`;

    msg += `🔄 *2. Petugas Pengganti (Pihak 2):* ${target}\n`;
    msg += `📅 *Jadwal Pengganti:* ${this.formatIndonesianDateStr(dateTo)}\n`;
    msg += `⏰ *Shift Pengganti:* ${shiftLabels[shiftTo] || shiftTo}\n\n`;

    msg += `📝 *Alasan Perubahan:* ${reason}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 *STATUS PERSETUJUAN DIGITAL (PAPERLESS):*\n`;
    msg += `✅ *Pihak 1 (Pemohon):* Terverifikasi Digital E-Signature\n`;
    msg += `✅ *Pihak 2 (Pengganti):* Terverifikasi Digital E-Signature\n`;
    msg += `✅ *HR Manager (HRM):* Terverifikasi Digital E-Signature\n`;
    msg += `✅ *General Manager (GM):* Approved & Disahkan Digital\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ _Sistem Otomatis: Perubahan jadwal ini telah diverifikasi 4 Pihak dan tersinkronisasi di Web & Google Drive._\n\n`;
    msg += `🔗 *Portal Jadwal:* ${window.location.origin}/jadwal`;

    return msg;
  },

  copyChangeScheduleText() {
    const msg = this.buildChangeScheduleMessage();
    navigator.clipboard.writeText(msg).then(() => {
      this.showToast('📋 Format pengajuan perubahan jadwal disalin!', 'success');
    }).catch(() => {
      this.showToast('📋 Format pengajuan berhasil disalin!', 'success');
    });
  },

  async submitPaperlessChangeSchedule() {
    const applicant = document.getElementById('cs-applicant')?.value.trim();
    const dateFromEl = document.getElementById('cs-date-from');
    const dateFromOpt = dateFromEl ? dateFromEl.options[dateFromEl.selectedIndex] : null;
    const dateFrom = dateFromEl?.value;
    const shiftFrom = dateFromOpt?.getAttribute('data-shift') || document.getElementById('cs-shift-from')?.value || 'MOD';

    const target = document.getElementById('cs-target')?.value.trim();
    const dateToEl = document.getElementById('cs-date-to');
    const dateToOpt = dateToEl ? dateToEl.options[dateToEl.selectedIndex] : null;
    const dateTo = dateToEl?.value;
    const shiftTo = dateToOpt?.getAttribute('data-shift') || document.getElementById('cs-shift-to')?.value || 'MOD';

    const reason = document.getElementById('cs-reason')?.value.trim() || 'Tukar jadwal MOD';

    const signatures = {};
    for (const key of ['p1', 'p2', 'hrm', 'gm']) {
      const pad = this.sigPads ? this.sigPads[key] : null;
      if (!pad || !pad.hasDrawn) {
        this.showToast(`Tanda tangan ${key.toUpperCase()} belum lengkap!`, 'error');
        return;
      }
      signatures[key] = pad.canvas.toDataURL('image/png');
    }

    if (!applicant || !target || !dateFrom) {
      this.showToast('Silakan pilih nama pemohon, pengganti, dan tanggal shift!', 'error');
      return;
    }

    const btnSubmit = document.getElementById('btn-submit-change-schedule');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerText = '⏳ Menyimpan & Mengirim ke WA Group...';
    }

    try {
      const waMessage = this.buildChangeScheduleMessage();
      const payload = {
        sheetName: `${this.matrixMonth} ${this.matrixYear}`,
        applicant,
        applicantDate: dateFrom,
        applicantShift: shiftFrom,
        target,
        targetDate: dateTo || dateFrom,
        targetShift: shiftTo,
        reason,
        signatures,
        waMessage
      };

      const res = await fetch('/api/schedule/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        this.showToast('🎉 Perubahan jadwal berhasil disetujui 4 Pihak & otomatis terkirim ke WhatsApp Group!', 'success');
        this.closeModal('modal-change-schedule');
        await this.loadMatrixData(true);
        await this.loadCurrentSchedule();
      } else {
        this.showToast(data.error || 'Gagal menerapkan perubahan jadwal.', 'error');
        if (btnSubmit) btnSubmit.disabled = false;
      }
    } catch (e) {
      console.error('Submit change request error:', e);
      this.showToast(`Error: ${e.message}`, 'error');
      if (btnSubmit) btnSubmit.disabled = false;
    }
  },

  openSendModal(shiftKey) {
    this.pendingModalShift = shiftKey;
    const titles = {
      'MOD1': 'Kirim Notifikasi Shift Pagi (MOD 1 - Masuk 09:00)',
      'MOD2': 'Kirim Notifikasi Shift Sore (MOD 2 - Masuk 16:00)',
      'MOD': 'Kirim Notifikasi Shift Sore (MOD - Masuk 18:00 / Weekday)',
      'ALL': 'Kirim Ringkasan Semua Shift Hari Ini'
    };
    const modalTitle = document.getElementById('modal-send-title');
    if (modalTitle) {
      modalTitle.innerText = titles[shiftKey] || 'Konfirmasi Pengiriman';
    }
    
    const modalTarget = document.getElementById('modal-send-target');
    if (modalTarget) {
      modalTarget.innerText = this.config?.waGateway?.targetNumber || 'Belum diatur';
    }

    const dateStr = this.formatDateWIB();
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shift: shiftKey, date: dateStr })
    }).then(r => r.json()).then(d => {
      const modalText = document.getElementById('modal-preview-text');
      if (modalText) modalText.innerText = d.message;
      this.openModal('modal-send');
    });
  },

  async executeSendShift(shiftKey) {
    const btn = document.getElementById('btn-modal-confirm-send');
    if (btn) {
      btn.innerHTML = '⏳ Mengirim...';
      btn.disabled = true;
    }

    try {
      const dateStr = this.formatDateWIB();
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
    const activeTemplate = document.getElementById('cfg-template-select')?.value || this.currentTemplateKey || 'MOD1';
    const templateText = document.getElementById('cfg-template-text')?.value || '';

    if (!this.config) this.config = {};
    if (!this.config.messageTemplates) this.config.messageTemplates = {};
    this.config.messageTemplates[activeTemplate] = templateText;

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
          label: 'Pagi (MOD 1 - 09:00)',
          enabled: true
        },
        MOD2: {
          time: timeMod2,
          cron: this.timeToCron(timeMod2),
          label: 'Sore (MOD 2 - 16:00)',
          enabled: true
        },
        MOD: {
          time: timeMod,
          cron: this.timeToCron(timeMod),
          label: 'Sore (MOD - 18:00)',
          enabled: true
        }
      },
      messageTemplates: { ...this.config.messageTemplates }
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      if (data.success) {
        this.config = data.config || newConfig;
        this.showToast('✅ Pengaturan berhasil disimpan ke Database & Scheduler diperbarui!', 'success');
        this.updateStatusPills();
        await this.loadConfig();
        await this.loadDutyData();
        await this.loadMatrixData();
        this.updateWhatsAppPreview();
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

  normalizeLevel(level) {
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
  },

  getLevelWeight(level) {
    const norm = this.normalizeLevel(level);
    if (norm === 'Manager') return 1;
    if (norm === 'Asst Manager') return 2;
    if (norm === 'Supervisor') return 3;
    return 4;
  },

  sortOfficersByLevel(officers) {
    if (!Array.isArray(officers)) return [];
    return [...officers].sort((a, b) => {
      const wa = this.getLevelWeight(a.level);
      const wb = this.getLevelWeight(b.level);
      if (wa !== wb) return wa - wb;
      return (a.name || '').localeCompare(b.name || '');
    });
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

    const sortedList = this.sortOfficersByLevel(list || []);

    if (!sortedList || sortedList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">Belum ada data master karyawan. Klik "➕ Tambah Karyawan" untuk memulai.</td></tr>`;
      return;
    }

    tbody.innerHTML = sortedList.map((o, idx) => {
      const isActive = o.isActive === 1 || o.isActive === true;
      const statusBadge = isActive
        ? '<span class="status-badge-success">Aktif</span>'
        : '<span class="status-badge-failed">Nonaktif</span>';
      
      const toggleBtnText = isActive ? 'Nonaktifkan' : 'Aktifkan';
      const phoneDisplay = o.phone ? `<code>${o.phone}</code>` : '<span class="text-muted">-</span>';

      const normLevel = this.normalizeLevel(o.level);
      let levelBadge = '<span class="badge badge-supervisor">Supervisor</span>';
      if (normLevel === 'Manager') levelBadge = '<span class="badge badge-manager">Manager</span>';
      else if (normLevel === 'Asst Manager') levelBadge = '<span class="badge badge-asst-manager">Asst Manager</span>';

      return `
        <tr data-name="${(o.name || '').toLowerCase()}" data-role="${(o.role || '').toLowerCase()}" data-level="${(normLevel || '').toLowerCase()}">
          <td class="text-center">${idx + 1}</td>
          <td style="text-align:left;"><strong>${o.name}</strong></td>
          <td style="text-align:left;">${o.role}</td>
          <td style="text-align:left;">${levelBadge}</td>
          <td style="text-align:left;">${phoneDisplay}</td>
          <td class="text-center">${statusBadge}</td>
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
      const level = tr.getAttribute('data-level') || '';
      tr.style.display = (name.includes(q) || role.includes(q) || level.includes(q)) ? '' : 'none';
    });
  },

  openAddOfficerModal() {
    const titleEl = document.getElementById('modal-officer-title');
    if (titleEl) titleEl.innerText = '➕ Tambah Karyawan Baru';
    document.getElementById('edit-officer-id').value = '';
    document.getElementById('new-officer-name').value = '';
    document.getElementById('new-officer-role').value = '';
    const levelEl = document.getElementById('new-officer-level');
    if (levelEl) levelEl.value = 'Supervisor';
    document.getElementById('new-officer-phone').value = '';
    document.getElementById('new-officer-active').checked = true;
    document.getElementById('modal-officer')?.classList.remove('hidden');
    document.getElementById('new-officer-name')?.focus();
  },

  openEditOfficerModal(id) {
    const numId = Number(id);
    const officer = this.masterOfficers.find(o => o.id === numId || o.id === id);
    if (!officer) return;

    const titleEl = document.getElementById('modal-officer-title');
    if (titleEl) titleEl.innerText = '✏️ Edit Data Karyawan';
    document.getElementById('edit-officer-id').value = officer.id;
    document.getElementById('new-officer-name').value = officer.name;
    document.getElementById('new-officer-role').value = officer.role;
    const levelEl = document.getElementById('new-officer-level');
    if (levelEl) {
      levelEl.value = this.normalizeLevel(officer.level);
    }
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
    const level = document.getElementById('new-officer-level')?.value || 'Supervisor';
    const phone = document.getElementById('new-officer-phone')?.value.trim();
    const isActive = document.getElementById('new-officer-active')?.checked ? 1 : 0;

    if (!name || !role) {
      this.showToast('Nama dan Jabatan wajib diisi!', 'error');
      return;
    }

    const payload = { name, role, level, phone, isActive };
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
        if (document.getElementById('tab-editor')?.classList.contains('active')) {
          await this.loadEditorData();
        }
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
          level: officer.level || 'Supervisor',
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

  getNextMonthPeriod() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthNamesId = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    let currentMIdx = 9; // October default
    let currentYr = 2026;

    if (this.config && this.config.spreadsheet && this.config.spreadsheet.activeSheetName) {
      const parts = this.config.spreadsheet.activeSheetName.split(' ');
      if (parts.length >= 2) {
        const foundIdx = monthNames.indexOf(parts[0]);
        if (foundIdx !== -1) currentMIdx = foundIdx;
        currentYr = parseInt(parts[1], 10) || currentYr;
      }
    } else if (this.currentDate) {
      currentMIdx = this.currentDate.getMonth();
      currentYr = this.currentDate.getFullYear();
    }

    let nextMIdx = currentMIdx + 1;
    let nextYr = currentYr;
    if (nextMIdx > 11) {
      nextMIdx = 0;
      nextYr += 1;
    }

    return {
      month: monthNames[nextMIdx],
      monthId: monthNamesId[nextMIdx],
      year: nextYr,
      monthIdx: nextMIdx,
      sheetName: `${monthNames[nextMIdx]} ${nextYr}`,
      currentMonth: monthNames[currentMIdx],
      currentMonthId: monthNamesId[currentMIdx],
      currentYear: currentYr,
      currentMonthIdx: currentMIdx,
      currentSheetName: `${monthNames[currentMIdx]} ${currentYr}`
    };
  },

  switchEditorPeriod(mode = 'next', saveCurrentDraft = true) {
    // 1. Save in-memory draft of currently active period before switching (if allowed)
    if (saveCurrentDraft && this.editorOfficers && this.editorOfficers.length > 0) {
      const currentSheetKey = `${this.editorMonth} ${this.editorYear}`;
      this.editorDrafts[currentSheetKey] = JSON.parse(JSON.stringify(this.editorOfficers));
    }

    this.editorTargetMode = mode;
    const nextInfo = this.getNextMonthPeriod();
    const btnCur = document.getElementById('btn-editor-cur-month');
    const btnNext = document.getElementById('btn-editor-next-month');

    if (mode === 'current') {
      if (btnCur) { btnCur.className = 'btn btn-sm btn-primary active'; }
      if (btnNext) { btnNext.className = 'btn btn-sm btn-outline'; }
      this.editorMonth = nextInfo.currentMonth;
      this.editorYear = nextInfo.currentYear;
    } else {
      if (btnCur) { btnCur.className = 'btn btn-sm btn-outline'; }
      if (btnNext) { btnNext.className = 'btn btn-sm btn-primary active'; }
      this.editorMonth = nextInfo.month;
      this.editorYear = nextInfo.year;
    }
    this.loadEditorData();
  },

  closeNextMonthTab(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const nextInfo = this.getNextMonthPeriod();
    const nextSheetKey = `${nextInfo.month} ${nextInfo.year}`;

    // 1. Delete in-memory draft of next month
    delete this.editorDrafts[nextSheetKey];
    this.nextMonthTabOpen = false;

    // 2. Hide next month button group completely
    const groupNext = document.getElementById('group-editor-next-month');
    if (groupNext) groupNext.classList.add('hidden');

    // 3. Automatically switch back to current month without re-saving draft
    this.switchEditorPeriod('current', false);
    this.showToast(`Draft jadwal ${nextInfo.monthId} ${nextInfo.year} dihapus & kembali ke jadwal ${nextInfo.currentMonthId} ${nextInfo.currentYear}.`, 'info');
  },

  openNextMonthTab() {
    this.nextMonthTabOpen = true;
    const groupNext = document.getElementById('group-editor-next-month');
    if (groupNext) groupNext.classList.remove('hidden');
    this.switchEditorPeriod('next');
  },

  async loadEditorData() {
    try {
      const nextInfo = this.getNextMonthPeriod();

      const lblCur = document.getElementById('label-cur-month');
      const lblNext = document.getElementById('label-next-month');
      if (lblCur) lblCur.innerText = `${nextInfo.currentMonthId} ${nextInfo.currentYear}`;
      if (lblNext) lblNext.innerText = `${nextInfo.monthId} ${nextInfo.year}`;

      const groupNext = document.getElementById('group-editor-next-month');
      const nextSheetKey = `${nextInfo.month} ${nextInfo.year}`;
      const hasNextDraft = !!(this.editorDrafts && this.editorDrafts[nextSheetKey] && this.editorDrafts[nextSheetKey].length > 0);

      if (this.nextMonthTabOpen || (hasNextDraft && this.editorTargetMode === 'next')) {
        if (groupNext) groupNext.classList.remove('hidden');
      } else {
        if (groupNext) groupNext.classList.add('hidden');
      }

      if (!this.editorTargetMode) this.editorTargetMode = 'current';

      if (this.editorTargetMode === 'current') {
        this.editorMonth = nextInfo.currentMonth;
        this.editorYear = nextInfo.currentYear;
      } else {
        this.editorMonth = nextInfo.month;
        this.editorYear = nextInfo.year;
      }

      const sheetName = `${this.editorMonth} ${this.editorYear}`;

      // Check if we have an in-memory draft preserved
      if (this.editorDrafts && this.editorDrafts[sheetName] && this.editorDrafts[sheetName].length > 0) {
        this.editorOfficers = this.sortOfficersByLevel(JSON.parse(JSON.stringify(this.editorDrafts[sheetName])));
        this.renderEditorTable();
        return;
      }

      const res = await fetch(`/api/schedule/current?sheet=${encodeURIComponent(sheetName)}`);
      const data = await res.json();

      const masterLevelMap = {};
      (this.masterOfficers || []).forEach(m => {
        masterLevelMap[(m.name || '').toLowerCase().trim()] = m.level || 'Supervisor';
      });

      if (data.officers && data.officers.length > 0) {
        const enriched = data.officers.map(o => ({
          ...o,
          level: masterLevelMap[(o.name || '').toLowerCase().trim()] || o.level || 'Supervisor'
        }));
        this.editorOfficers = this.sortOfficersByLevel(JSON.parse(JSON.stringify(enriched)));
      } else {
        const activeMasters = this.masterOfficers.filter(o => o.isActive === 1 || o.isActive === true);
        const mapped = activeMasters.map(o => ({
          name: o.name,
          role: o.role,
          level: o.level || 'Supervisor',
          shifts: {}
        }));
        this.editorOfficers = this.sortOfficersByLevel(mapped);
      }

      this.renderEditorTable();
    } catch (e) {
      console.error('Failed to load editor data:', e);
    }
  },

  renderEditorTable() {
    this.editorOfficers = this.sortOfficersByLevel(this.editorOfficers);
    const daysTr = document.getElementById('editor-head-days');
    const datesTr = document.getElementById('editor-head-dates');
    const tbody = document.getElementById('editor-tbody');

    if (!daysTr || !datesTr || !tbody) return;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNamesId = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const monthIdx = monthNames.indexOf(this.editorMonth) !== -1 ? monthNames.indexOf(this.editorMonth) : 10;
    const daysInMonth = new Date(this.editorYear, monthIdx + 1, 0).getDate();
    const indMonthName = monthNamesId[monthIdx] || this.editorMonth;

    const isCur = (this.editorTargetMode === 'current');
    const periodBadge = document.getElementById('editor-period-badge');
    if (periodBadge) {
      if (isCur) {
        periodBadge.innerText = `📅 Mode Edit: ${indMonthName} ${this.editorYear} (Bulan Berjalan)`;
        periodBadge.className = 'status-pill status-badge-warning';
      } else {
        periodBadge.innerText = `📅 Target Jadwal Baru: ${indMonthName} ${this.editorYear} (Bulan Berikutnya)`;
        periodBadge.className = 'status-pill status-badge-success';
      }
    }

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
    daysHtml += `<th colspan="31" class="text-center">Tanggal (${indMonthName} ${this.editorYear})</th><th rowspan="2">Total</th>`;

    daysTr.innerHTML = daysHtml;
    datesTr.innerHTML = datesHtml;

    const tfoot = document.getElementById('editor-tfoot');

    if (this.editorOfficers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="35" class="text-center py-4">Belum ada petugas di jadwal ini. Klik "➕ Tambah Petugas" atau "⚡ Generate Otomatis".</td></tr>`;
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    const dailyCounts = Array(32).fill(0);
    let grandTotal = 0;

    tbody.innerHTML = this.editorOfficers.map((o, oIdx) => {
      let shiftCells = '';
      let totalCount = 0;

      for (let d = 1; d <= 31; d++) {
        if (d <= daysInMonth) {
          const s = (o.shifts && o.shifts[d]) || '';
          let badge = '';
          if (s === 'MOD1') {
            totalCount++;
            dailyCounts[d]++;
            grandTotal++;
            badge = '<span class="matrix-badge-mod1">MOD1</span>';
          } else if (s === 'MOD2') {
            totalCount++;
            dailyCounts[d]++;
            grandTotal++;
            badge = '<span class="matrix-badge-mod2">MOD2</span>';
          } else if (s === 'MOD') {
            totalCount++;
            dailyCounts[d]++;
            grandTotal++;
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

    if (tfoot) {
      let summaryDailyCells = '';
      for (let d = 1; d <= 31; d++) {
        if (d <= daysInMonth) {
          const c = dailyCounts[d];
          const badgeClass = c > 1 ? 'matrix-count-badge multi-duty' : (c > 0 ? 'matrix-count-badge has-duty' : 'matrix-count-badge');
          summaryDailyCells += `<td><span class="${badgeClass}" title="Total ${c} petugas pada tanggal ${d}">${c}</span></td>`;
        } else {
          summaryDailyCells += `<td style="opacity:0.2">-</td>`;
        }
      }

      tfoot.innerHTML = `
        <tr class="matrix-summary-row">
          <td></td>
          <td><strong>JUMLAH MOD</strong></td>
          <td><span class="text-muted text-xs">Total Harian</span></td>
          ${summaryDailyCells}
          <td class="text-center"><strong>${grandTotal}</strong></td>
        </tr>
      `;
    }
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

    const currentSheetKey = `${this.editorMonth} ${this.editorYear}`;
    this.editorDrafts[currentSheetKey] = JSON.parse(JSON.stringify(this.editorOfficers));

    this.renderEditorTable();
  },

  removeOfficer(idx) {
    if (!this.editorOfficers[idx]) return;
    const name = this.editorOfficers[idx].name;
    if (confirm(`Apakah Anda yakin ingin menghapus "${name}" dari jadwal ini?`)) {
      this.editorOfficers.splice(idx, 1);
      const currentSheetKey = `${this.editorMonth} ${this.editorYear}`;
      this.editorDrafts[currentSheetKey] = JSON.parse(JSON.stringify(this.editorOfficers));
      this.renderEditorTable();
      this.showToast(`Petugas "${name}" dihapus.`, 'success');
    }
  },

  showConfirmModal({ title, icon = '⚡', heading, message, detailsHtml = '', confirmText = 'Ya, Lanjutkan', confirmClass = 'btn-primary', onConfirm }) {
    const modal = document.getElementById('modal-confirm-action');
    if (!modal) {
      if (confirm(`${heading}\n\n${message}`)) {
        if (typeof onConfirm === 'function') onConfirm();
      }
      return;
    }

    const titleEl = document.getElementById('modal-confirm-title');
    const iconEl = document.getElementById('modal-confirm-icon');
    const headingEl = document.getElementById('modal-confirm-heading');
    const msgEl = document.getElementById('modal-confirm-message');
    const detailsEl = document.getElementById('modal-confirm-details');
    const btnConfirm = document.getElementById('btn-modal-action-confirm');

    if (titleEl) titleEl.innerText = title || 'Konfirmasi Tindakan';
    if (iconEl) iconEl.innerText = icon || '⚡';
    if (headingEl) headingEl.innerText = heading || 'Konfirmasi';
    if (msgEl) msgEl.innerText = message || '';
    if (detailsEl) {
      if (detailsHtml) {
        detailsEl.innerHTML = detailsHtml;
        detailsEl.classList.remove('hidden');
      } else {
        detailsEl.innerHTML = '';
        detailsEl.classList.add('hidden');
      }
    }

    if (btnConfirm) {
      btnConfirm.innerText = confirmText || 'Ya, Lanjutkan';
      btnConfirm.className = `btn ${confirmClass || 'btn-primary'}`;
    }

    this.pendingConfirmCallback = onConfirm;
    modal.classList.remove('hidden');
  },

  async autoGenerateSchedule() {
    const nextInfo = this.getNextMonthPeriod();
    const nextSheetKey = `${nextInfo.month} ${nextInfo.year}`;

    // Get active officers to schedule
    let officersToSchedule = [];
    if (this.masterOfficers && this.masterOfficers.length > 0) {
      officersToSchedule = this.masterOfficers.filter(o => o.isActive === 1 || o.isActive === true);
    } else if (this.editorOfficers && this.editorOfficers.length > 0) {
      officersToSchedule = this.editorOfficers;
    }

    if (officersToSchedule.length === 0) {
      this.showToast('Tambahkan minimal 1 petugas aktif terlebih dahulu di Data Karyawan!', 'error');
      return;
    }

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIdx = nextInfo.monthIdx;
    const daysInMonth = new Date(nextInfo.year, monthIdx + 1, 0).getDate();

    const detailsHtml = `
      <div><strong>📅 Periode Target Baru:</strong> <span class="badge badge-manager">${nextInfo.monthId} ${nextInfo.year}</span> (Bulan Berikutnya - ${daysInMonth} Hari)</div>
      <div><strong>🛡️ Keamanan Data:</strong> Jadwal bulan berjalan saat ini (<strong>${nextInfo.currentMonthId} ${nextInfo.currentYear}</strong>) tetap aktif, aman & tidak berubah.</div>
      <div><strong>👥 Petugas Aktif:</strong> ${officersToSchedule.length} Karyawan Terdaftar</div>
      <div class="mt-1"><strong>⚡ Aturan Pola Rotasi:</strong></div>
      <ul>
        <li><strong>Sabtu & Minggu (Weekend):</strong> 2 Petugas per hari (MOD1 Pagi 09:00 & MOD2 Sore 16:00)</li>
        <li><strong>Senin - Jumat (Weekday):</strong> 1 Petugas per hari (MOD Sore 18:00)</li>
        <li><strong>Urutan Rotasi:</strong> Mengikuti hierarki Level & Jarak Shift Bulan Sebelumnya (${nextInfo.currentMonthId} ${nextInfo.currentYear}) secara adil</li>
      </ul>
    `;

    this.showConfirmModal({
      title: '⚡ Generate Rotasi Jadwal Bulan Berikutnya',
      icon: '⚡',
      heading: `Generate Jadwal Bulan Berikutnya (${nextInfo.monthId} ${nextInfo.year})?`,
      message: `Sistem akan membuatkan draf rotasi jadwal untuk bulan berikutnya (${nextInfo.monthId} ${nextInfo.year}) dengan memperhitungkan jarak tugas bulan sebelumnya agar adil.`,
      detailsHtml,
      confirmText: `Generate Jadwal ${nextInfo.monthId} ⚡`,
      confirmClass: 'btn-primary',
      onConfirm: async () => {
        this.closeModal('modal-confirm-action');
        this.setStatus(`⏳ Meng-generate rotasi otomatis ${nextInfo.monthId} ${nextInfo.year}...`, 'working');
        try {
          const res = await fetch('/api/schedule/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              month: nextInfo.month,
              year: nextInfo.year,
              officers: officersToSchedule
            })
          });
          const data = await res.json();
          if (data.success) {
            const masterLevelMap = {};
            (this.masterOfficers || []).forEach(m => {
              masterLevelMap[(m.name || '').toLowerCase().trim()] = m.level || 'Supervisor';
            });
            const enriched = (data.schedule.officers || []).map(o => ({
              ...o,
              level: masterLevelMap[(o.name || '').toLowerCase().trim()] || o.level || 'Supervisor'
            }));
            
            const sortedOfficers = this.sortOfficersByLevel(enriched);
            this.editorDrafts[nextSheetKey] = JSON.parse(JSON.stringify(sortedOfficers));
            this.nextMonthTabOpen = true;
            this.editorTargetMode = 'next';
            this.editorMonth = nextInfo.month;
            this.editorYear = nextInfo.year;
            this.editorOfficers = sortedOfficers;

            // Activate next month tab in switcher UI
            const btnCur = document.getElementById('btn-editor-cur-month');
            const btnNext = document.getElementById('btn-editor-next-month');
            const groupNext = document.getElementById('group-editor-next-month');
            if (btnCur) btnCur.className = 'btn btn-sm btn-outline';
            if (btnNext) btnNext.className = 'btn btn-sm btn-primary active';
            if (groupNext) groupNext.classList.remove('hidden');

            this.renderEditorTable();
            this.showToast(`⚡ Draf jadwal ${nextInfo.monthId} ${nextInfo.year} berhasil dibuat! Silakan periksa atau klik Simpan.`, 'success');
            this.setStatus(`🟢 Draf jadwal ${nextInfo.monthId} ${nextInfo.year} siap (Klik Simpan untuk menyimpan permanen).`, 'ready');
          } else {
            this.showToast(`Gagal generate: ${data.error}`, 'error');
            this.setStatus(`❌ Gagal generate: ${data.error}`, 'error');
          }
        } catch (e) {
          this.showToast(`Error: ${e.message}`, 'error');
        }
      }
    });
  },

  async saveEditorSchedule() {
    const nextInfo = this.getNextMonthPeriod();
    const isCur = (this.editorTargetMode === 'current');
    const sheetName = `${this.editorMonth} ${this.editorYear}`;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNamesId = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const monthIdx = monthNames.indexOf(this.editorMonth) !== -1 ? monthNames.indexOf(this.editorMonth) : (isCur ? nextInfo.currentMonthIdx : nextInfo.monthIdx);
    const indMonthName = monthNamesId[monthIdx] || this.editorMonth;

    let shiftCount = 0;
    this.editorOfficers.forEach(o => {
      if (o.shifts) {
        shiftCount += Object.keys(o.shifts).length;
      }
    });

    const detailsHtml = `
      <div><strong>📅 Periode Jadwal:</strong> <span class="badge ${isCur ? 'badge-supervisor' : 'badge-manager'}">${indMonthName} ${this.editorYear}</span> (${isCur ? 'Bulan Berjalan' : 'Bulan Berikutnya'})</div>
      <div><strong>👥 Total Petugas:</strong> ${this.editorOfficers.length} Petugas (${shiftCount} Shift Terjadwal)</div>
      <div><strong>💾 Tujuan Penyimpanan:</strong> Database Lokal & Siap Ditampilkan di Kalender Matrix</div>
    `;

    this.showConfirmModal({
      title: isCur ? '💾 Simpan Jadwal Bulan Berjalan' : '💾 Simpan Jadwal Bulan Berikutnya',
      icon: '💾',
      heading: `Simpan Jadwal ${indMonthName} ${this.editorYear} ke Sistem?`,
      message: `Perubahan jadwal untuk ${indMonthName} ${this.editorYear} akan disimpan secara permanen ke database dan langsung dapat dilihat di Kalender Matrix & Dashboard.`,
      detailsHtml,
      confirmText: `Simpan Jadwal ${indMonthName} 💾`,
      confirmClass: 'btn-primary',
      onConfirm: async () => {
        this.closeModal('modal-confirm-action');
        const btn = document.getElementById('btn-save-editor-schedule');
        if (btn) {
          btn.innerHTML = '⏳ Menyimpan Jadwal...';
          btn.disabled = true;
        }
        this.setStatus(`💾 Menyimpan jadwal ${sheetName}...`, 'working');

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
            delete this.editorDrafts[sheetName];
            this.showToast(data.message || `✅ Jadwal ${indMonthName} ${this.editorYear} berhasil disimpan!`, 'success');
            this.setStatus(`🟢 Jadwal ${indMonthName} ${this.editorYear} tersimpan aktif.`, 'ready');
            await this.loadDutyData();
            await this.loadMatrixData(this.editorMonth, this.editorYear);
          } else {
            this.showToast(`❌ Gagal simpan: ${data.error}`, 'error');
            this.setStatus(`❌ Gagal simpan: ${data.error}`, 'error');
          }
        } catch (e) {
          this.showToast(`Error: ${e.message}`, 'error');
        } finally {
          if (btn) {
            btn.innerHTML = '💾 Simpan Jadwal ke Sistem';
            btn.disabled = false;
          }
        }
      }
    });
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
  },

  updateUserProfileUI() {
    if (!this.currentUser) return;
    const name = this.currentUser.name || this.currentUser.username || 'User';
    const username = this.currentUser.username || 'user';
    const isAdmin = this.currentUser.role === 'admin';
    const role = isAdmin ? 'Admin' : 'Operator';
    const initial = name.charAt(0).toUpperCase();

    const avatarEl = document.getElementById('top-user-avatar');
    if (avatarEl) avatarEl.innerText = initial || '👤';

    const nameEl = document.getElementById('top-user-name');
    if (nameEl) nameEl.innerText = name;

    const roleEl = document.getElementById('top-user-role');
    if (roleEl) {
      roleEl.innerText = role;
      roleEl.className = `user-role-badge ${isAdmin ? 'admin' : 'operator'}`;
    }

    const menuFullnameEl = document.getElementById('menu-user-fullname');
    if (menuFullnameEl) menuFullnameEl.innerText = name;

    const menuUsernameEl = document.getElementById('menu-user-username');
    if (menuUsernameEl) menuUsernameEl.innerText = `@${username}`;

    const userMgmtBtn = document.getElementById('btn-open-user-mgmt');
    if (userMgmtBtn) {
      userMgmtBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    // Hide or show Settings tab based on role
    const navSettingsBtn = document.getElementById('nav-item-settings');
    if (navSettingsBtn) {
      navSettingsBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    // If non-admin is currently on settings tab, redirect to tab-today
    if (!isAdmin && document.getElementById('tab-settings')?.classList.contains('active')) {
      this.switchTab('tab-today');
    }
  },

  async submitLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const alertBox = document.getElementById('login-alert-box');
    const btnSubmit = document.getElementById('btn-login-submit');

    const username = usernameInput?.value.trim();
    const password = passwordInput?.value.trim();

    if (!username || !password) {
      if (alertBox) {
        alertBox.innerText = 'Username dan password wajib diisi!';
        alertBox.classList.remove('hidden');
      }
      return;
    }

    if (btnSubmit) {
      btnSubmit.innerHTML = '⏳ Memeriksa Akun...';
      btnSubmit.disabled = true;
    }
    if (alertBox) alertBox.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success && data.user) {
        this.currentUser = data.user;
        localStorage.setItem('mod_auth_user', JSON.stringify(data.user));
        this.updateUserProfileUI();
        this.hideLoginOverlay();
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        this.showToast(`Selamat datang, ${data.user.name || data.user.username}! 🎉`, 'success');
        this.loadInitialData();
      } else {
        if (alertBox) {
          alertBox.innerText = `❌ ${data.error || 'Username atau password salah'}`;
          alertBox.classList.remove('hidden');
        }
      }
    } catch (e) {
      if (alertBox) {
        alertBox.innerText = `❌ Terjadi kesalahan: ${e.message}`;
        alertBox.classList.remove('hidden');
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.innerHTML = '🚀 Masuk ke Sistem';
        btnSubmit.disabled = false;
      }
    }
  },

  openModal(modalId) {
    if (!modalId) return;
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.style.visibility = 'visible';
      modal.style.pointerEvents = 'auto';
    }
  },

  closeModal(modalId) {
    const id = modalId || 'modal-send';
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.style.visibility = 'hidden';
      modal.style.pointerEvents = 'none';
    }
  },

  toggleUserDropdown(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) {
      const isHidden = menu.classList.contains('hidden') || menu.style.display === 'none';
      if (isHidden) {
        menu.classList.remove('hidden');
        menu.style.display = 'block';
        menu.style.visibility = 'visible';
        menu.style.pointerEvents = 'auto';
      } else {
        menu.classList.add('hidden');
        menu.style.display = 'none';
        menu.style.visibility = 'hidden';
        menu.style.pointerEvents = 'none';
      }
    }
  },

  hideUserDropdown() {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) {
      menu.classList.add('hidden');
      menu.style.display = 'none';
      menu.style.visibility = 'hidden';
      menu.style.pointerEvents = 'none';
    }
  },

  logout(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    localStorage.removeItem('mod_auth_user');
    this.currentUser = null;
    this.hideUserDropdown();
    
    // Close any open modals
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      m.classList.add('hidden');
      m.style.display = 'none';
      m.style.visibility = 'hidden';
      m.style.pointerEvents = 'none';
    });

    this.showLoginOverlay();
    const alertBox = document.getElementById('login-alert-box');
    if (alertBox) alertBox.classList.add('hidden');
    const uInp = document.getElementById('login-username');
    const pInp = document.getElementById('login-password');
    if (uInp) {
      uInp.value = '';
      setTimeout(() => uInp.focus(), 100);
    }
    if (pInp) pInp.value = '';
    this.showToast('🚪 Anda telah keluar dari sistem (Logged out).', 'success');
  },

  openChangePasswordModal(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    this.hideUserDropdown();
    const alertBox = document.getElementById('alert-change-pwd');
    if (alertBox) alertBox.classList.add('hidden');
    const pwdCurrent = document.getElementById('pwd-current');
    if (pwdCurrent) pwdCurrent.value = '';
    const pwdNew = document.getElementById('pwd-new');
    if (pwdNew) pwdNew.value = '';
    const pwdConfirm = document.getElementById('pwd-confirm');
    if (pwdConfirm) pwdConfirm.value = '';

    this.openModal('modal-change-password');
    setTimeout(() => { pwdCurrent?.focus(); }, 120);
  },

  async submitChangePassword() {
    const alertBox = document.getElementById('alert-change-pwd');
    const pwdCurrent = document.getElementById('pwd-current')?.value;
    const pwdNew = document.getElementById('pwd-new')?.value;
    const pwdConfirm = document.getElementById('pwd-confirm')?.value;
    const btn = document.getElementById('btn-submit-change-pwd');

    if (!pwdCurrent || !pwdNew) {
      if (alertBox) {
        alertBox.innerText = 'Semua kolom password wajib diisi!';
        alertBox.classList.remove('hidden');
      }
      return;
    }

    if (pwdNew !== pwdConfirm) {
      if (alertBox) {
        alertBox.innerText = 'Password baru dan konfirmasi password tidak cocok!';
        alertBox.classList.remove('hidden');
      }
      return;
    }

    if (pwdNew.length < 4) {
      if (alertBox) {
        alertBox.innerText = 'Password baru minimal 4 karakter!';
        alertBox.classList.remove('hidden');
      }
      return;
    }

    if (btn) {
      btn.innerHTML = '⏳ Menyimpan...';
      btn.disabled = true;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.currentUser?.username,
          currentPassword: pwdCurrent,
          newPassword: pwdNew
        })
      });
      const data = await res.json();

      if (data.success) {
        this.closeModal('modal-change-password');
        this.showToast('✅ Password berhasil diperbarui!', 'success');
      } else {
        if (alertBox) {
          alertBox.innerText = `❌ ${data.error || 'Gagal mengubah password'}`;
          alertBox.classList.remove('hidden');
        }
      }
    } catch (e) {
      if (alertBox) {
        alertBox.innerText = `❌ Terjadi kesalahan: ${e.message}`;
        alertBox.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.innerHTML = 'Simpan Password Baru';
        btn.disabled = false;
      }
    }
  },

  async openUsersManagementModal(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    this.hideUserDropdown();
    this.openModal('modal-users-management');
    await this.loadUsersList();
  },

  async loadUsersList() {
    const modalTbody = document.getElementById('users-table-tbody');
    const settingsTbody = document.getElementById('settings-users-tbody');
    if (modalTbody) modalTbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">Memuat data pengguna...</td></tr>';
    if (settingsTbody) settingsTbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">Memuat data pengguna...</td></tr>';

    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      const users = data.users || [];

      if (users.length === 0) {
        const emptyHtml = '<tr><td colspan="6" class="text-center py-4">Belum ada data pengguna.</td></tr>';
        if (modalTbody) modalTbody.innerHTML = emptyHtml;
        if (settingsTbody) settingsTbody.innerHTML = emptyHtml;
        return;
      }

      const rowsHtml = users.map((u, idx) => {
        const isCurrent = this.currentUser && (this.currentUser.id === u.id || this.currentUser.username === u.username);
        const roleBadge = u.role === 'admin' 
          ? '<span class="status-badge-success">Administrator</span>' 
          : '<span class="status-badge-info">Operator</span>';
        const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('id-ID') : '-';

        return `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td><strong>${u.username}</strong> ${isCurrent ? '<span class="badge">Anda</span>' : ''}</td>
            <td>${u.name || '-'}</td>
            <td>${roleBadge}</td>
            <td>${dateStr}</td>
            <td class="text-center" style="white-space:nowrap;">
              <button class="btn btn-tbl-xs btn-outline" onclick="app.openEditUserModal(${u.id}, '${(u.username||'').replace(/'/g, "\\'")}', '${(u.name||'').replace(/'/g, "\\'")}', '${u.role}')" title="Edit Data Pengguna">✏️</button>
              <button class="btn btn-tbl-xs btn-secondary" onclick="app.openResetUserPwdModal(${u.id}, '${(u.username||'').replace(/'/g, "\\'")}')" title="Reset Password">🔑</button>
              ${!isCurrent ? `<button class="btn btn-tbl-xs btn-remove-officer" onclick="app.deleteUser(${u.id}, '${(u.username||'').replace(/'/g, "\\'")}')" title="Hapus Pengguna">🗑️</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');

      if (modalTbody) modalTbody.innerHTML = rowsHtml;
      if (settingsTbody) settingsTbody.innerHTML = rowsHtml;
    } catch (e) {
      const errHtml = `<tr><td colspan="6" class="text-center py-4 text-danger">Gagal memuat pengguna: ${e.message}</td></tr>`;
      if (modalTbody) modalTbody.innerHTML = errHtml;
      if (settingsTbody) settingsTbody.innerHTML = errHtml;
    }
  },

  openCreateUserModal() {
    const titleEl = document.getElementById('modal-user-form-title');
    if (titleEl) titleEl.innerText = '➕ Tambah Pengguna Baru';
    
    document.getElementById('form-user-id').value = '';
    const userInp = document.getElementById('form-user-username');
    if (userInp) {
      userInp.value = '';
      userInp.disabled = false;
    }
    document.getElementById('form-user-name').value = '';
    document.getElementById('form-user-pwd').value = '';
    
    const pwdGroup = document.getElementById('group-form-user-pwd');
    if (pwdGroup) pwdGroup.style.display = 'block';

    document.getElementById('form-user-role').value = 'operator';
    this.openModal('modal-user-form');
    userInp?.focus();
  },

  openEditUserModal(id, username, name, role) {
    const titleEl = document.getElementById('modal-user-form-title');
    if (titleEl) titleEl.innerText = '✏️ Edit Data Pengguna';

    document.getElementById('form-user-id').value = id;
    const userInp = document.getElementById('form-user-username');
    if (userInp) {
      userInp.value = username;
      userInp.disabled = true;
    }
    document.getElementById('form-user-name').value = name;
    
    // Hide password field for edit (use Reset Password modal instead)
    const pwdGroup = document.getElementById('group-form-user-pwd');
    if (pwdGroup) pwdGroup.style.display = 'none';

    document.getElementById('form-user-role').value = role || 'operator';
    this.openModal('modal-user-form');
    document.getElementById('form-user-name')?.focus();
  },

  async saveUserForm() {
    const id = document.getElementById('form-user-id')?.value;
    const username = document.getElementById('form-user-username')?.value.trim();
    const name = document.getElementById('form-user-name')?.value.trim();
    const password = document.getElementById('form-user-pwd')?.value.trim();
    const role = document.getElementById('form-user-role')?.value || 'operator';
    const btn = document.getElementById('btn-save-user-form');

    if (!id && (!username || !password)) {
      this.showToast('Username dan password wajib diisi!', 'error');
      return;
    }

    if (!name) {
      this.showToast('Nama lengkap wajib diisi!', 'error');
      return;
    }

    if (btn) {
      btn.innerHTML = '⏳ Menyimpan...';
      btn.disabled = true;
    }

    try {
      let res, data;
      if (id) {
        res = await fetch(`/api/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, role })
        });
      } else {
        res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, name, password, role })
        });
      }
      data = await res.json();

      if (data.success) {
        this.closeModal('modal-user-form');
        this.showToast(id ? 'Data pengguna berhasil diperbarui!' : 'Pengguna baru berhasil ditambahkan!', 'success');
        await this.loadUsersList();
      } else {
        this.showToast(`❌ Gagal: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.innerHTML = 'Simpan Pengguna';
        btn.disabled = false;
      }
    }
  },

  openResetUserPwdModal(id, username) {
    document.getElementById('reset-target-user-id').value = id;
    const targetNameEl = document.getElementById('reset-target-username');
    if (targetNameEl) targetNameEl.innerText = username;
    const pwdInp = document.getElementById('reset-new-password');
    if (pwdInp) pwdInp.value = '';

    this.openModal('modal-reset-user-pwd');
    pwdInp?.focus();
  },

  async submitResetUserPwd() {
    const id = document.getElementById('reset-target-user-id')?.value;
    const newPassword = document.getElementById('reset-new-password')?.value.trim();
    const btn = document.getElementById('btn-submit-reset-pwd');

    if (!newPassword || newPassword.length < 4) {
      this.showToast('Password baru minimal 4 karakter!', 'error');
      return;
    }

    if (btn) {
      btn.innerHTML = '⏳ Mereset...';
      btn.disabled = true;
    }

    try {
      const res = await fetch(`/api/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();

      if (data.success) {
        this.closeModal('modal-reset-user-pwd');
        this.showToast('✅ Password pengguna berhasil direset!', 'success');
      } else {
        this.showToast(`❌ Gagal: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.innerHTML = 'Reset Password';
        btn.disabled = false;
      }
    }
  },

  async deleteUser(id, username) {
    if (!confirm(`Apakah Anda yakin ingin menghapus pengguna "${username}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Pengguna "${username}" berhasil dihapus.`, 'success');
        await this.loadUsersList();
      } else {
        this.showToast(`❌ Gagal: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  }
};

// Expose app to window global scope for inline HTML onclick compatibility
window.app = app;

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
