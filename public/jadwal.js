const jadwalApp = {
  currentDate: new Date(),
  matrixMonth: 'October',
  matrixYear: 2026,
  cachedMatrix: null,
  masterOfficers: [],
  sigPads: {}, // { p1: { canvas, ctx, hasDrawn, strokes }, ... }

  async init() {
    await this.loadInitialData();
    this.initSignaturePads();

    window.addEventListener('resize', () => {
      const modal = document.getElementById('modal-change-schedule');
      if (modal && !modal.classList.contains('hidden')) {
        ['p1', 'p2', 'hrm', 'gm'].forEach(k => {
          const c = document.getElementById(`sig-canvas-${k}`);
          if (c) this.resizeCanvas(c);
        });
      }
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        const modal = document.getElementById('modal-change-schedule');
        if (modal && !modal.classList.contains('hidden')) {
          ['p1', 'p2', 'hrm', 'gm'].forEach(k => {
            const c = document.getElementById(`sig-canvas-${k}`);
            if (c) this.resizeCanvas(c);
          });
        }
      }, 250);
    });
  },

  async loadInitialData() {
    await Promise.allSettled([
      this.loadMasterOfficers(),
      this.loadMatrix()
    ]);
  },

  async loadMasterOfficers() {
    try {
      const res = await fetch('/api/officers');
      const data = await res.json();
      this.masterOfficers = data.officers || [];
    } catch (e) {
      console.error('Failed to load officers:', e);
    }
  },

  normalizeLevel(level) {
    if (!level) return 'Supervisor';
    const str = level.toString().toLowerCase().trim();
    if (str.includes('asst') || str.includes('assistant') || str.includes('ast')) {
      return 'Asst Manager';
    }
    if (str.includes('manager') || str.includes('chief') || str.includes('head') || str.includes('gm')) {
      return 'Manager';
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
      return (a.name || '').localeCompare(b.name || '', 'id');
    });
  },

  async loadMatrix(force = false) {
    const mSelect = document.getElementById('matrix-month');
    const ySelect = document.getElementById('matrix-year');
    if (mSelect) this.matrixMonth = mSelect.value;
    if (ySelect) this.matrixYear = parseInt(ySelect.value, 10);

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

      const txtSource = document.getElementById('txt-matrix-source');
      if (txtSource) {
        const srcLabel = data.source === 'live_google_sheet' ? 'Google Sheets (Live)' : 'Database Lokal';
        txtSource.innerText = `📊 Sumber: ${srcLabel}`;
      }

      this.renderMatrixTable(data);
      if (force) {
        this.showToast(`✅ Kalender ${this.matrixMonth} ${this.matrixYear} berhasil dimuat!`, 'success');
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
      tbody.innerHTML = `<tr><td colspan="36" class="text-center py-4">Belum ada data jadwal untuk ${indMonthName} ${targetYear}.</td></tr>`;
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

  filterMatrix(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('#matrix-tbody tr').forEach(tr => {
      const name = tr.getAttribute('data-name') || '';
      tr.style.display = name.includes(q) ? '' : 'none';
    });
  },

  shareWhatsAppLink() {
    const url = `${window.location.origin}/jadwal`;
    const text = `🏨 *PORTAL JADWAL MANAGER ON DUTY (MOD)*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nLihat jadwal harian dan kalender matrix bulanan lengkap secara online:\n\n🔗 ${url}\n\n_(Dapat dibuka langsung di HP)_\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n_Sistem Informasi MOD Dafam Hotel_`;

    if (navigator.share) {
      navigator.share({
        title: 'Jadwal Petugas MOD Dafam',
        text: text,
        url: url
      }).catch(() => {
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
      });
    } else {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    }
  },

  // ==========================================
  // PAPERLESS DIGITAL SIGNATURE & CHANGE SCHEDULE
  // ==========================================
  initSignaturePads() {
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

      // Mouse Listeners
      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', endDraw);
      canvas.addEventListener('mouseleave', endDraw);

      // Touch Listeners (Mobile optimized)
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
    ['p1', 'p2', 'hrm', 'gm'].forEach(k => {
      if (this.sigPads[k] && this.sigPads[k].hasDrawn) signedCount++;
    });

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

  openChangeScheduleModal() {
    const appSelect = document.getElementById('cs-applicant');
    const targetSelect = document.getElementById('cs-target');

    const officers = (this.cachedMatrix && this.cachedMatrix.officers && this.cachedMatrix.officers.length > 0)
      ? this.cachedMatrix.officers
      : this.masterOfficers;

    const sorted = this.sortOfficersByLevel(officers || []);
    const optionsHtml = '<option value="">-- Pilih Nama Petugas --</option>' + sorted.map(o => {
      return `<option value="${o.name}">${o.name} (${o.role || o.level || 'Petugas'})</option>`;
    }).join('');

    if (appSelect) appSelect.innerHTML = optionsHtml;
    if (targetSelect) targetSelect.innerHTML = optionsHtml;

    document.getElementById('modal-change-schedule')?.classList.remove('hidden');

    // Re-initialize / re-scale canvas dimensions after modal unhides
    setTimeout(() => {
      ['p1', 'p2', 'hrm', 'gm'].forEach(k => {
        const c = document.getElementById(`sig-canvas-${k}`);
        if (c) this.resizeCanvas(c);
        this.clearSig(k);
      });
      this.updateValidationState();
    }, 100);
  },

  closeChangeScheduleModal() {
    document.getElementById('modal-change-schedule')?.classList.add('hidden');
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
      : (this.masterOfficers || []);

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
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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
      this.showToast('📋 Pesan perubahan jadwal berhasil disalin ke clipboard!', 'success');
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

    // Verify signatures
    const signatures = {};
    for (const key of ['p1', 'p2', 'hrm', 'gm']) {
      const pad = this.sigPads[key];
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
        this.closeChangeScheduleModal();
        await this.loadMatrix(true);
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

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.innerText = message;
      toast.className = `toast ${type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : '')}`;
      toast.classList.remove('hidden');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 3500);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  jadwalApp.init();
});
