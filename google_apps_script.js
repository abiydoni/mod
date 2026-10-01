/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: AUTO CREATE & UPDATE MOD SCHEDULE TABS
 * =========================================================================
 * Pasang script ini di Google Sheets Anda:
 * 1. Buka spreadsheet Google Sheets Anda
 * 2. Klik menu: Ekstensi (Extensions) > Apps Script
 * 3. Hapus kode lama, lalu paste seluruh kode di bawah ini
 * 4. Klik tombol "Simpan" (ikon disket)
 * 5. Klik tombol "Terapkan (Deploy)" > "Penerapan Baru (New Deployment)"
 * 6. Pilih jenis: "Aplikasi Web (Web App)"
 *    - Deskripsi: Webhook MOD Auto Sync
 *    - Jalankan sebagai (Execute as): "Saya (Me)"
 *    - Siapa yang memiliki akses (Who has access): "Siapa saja (Anyone)"
 * 7. Klik "Terapkan (Deploy)", beri izin akses jika diminta (Authorize)
 * 8. Salin URL Aplikasi Web yang diberikan, lalu paste ke Web App MOD (Pengaturan > Google Apps Script Webhook URL)
 * =========================================================================
 */

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);

    var sheetName = data.sheetName || 'October 2026';
    var officers = data.officers || [];

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    // 1. Jika sheet belum ada, buat sheet baru
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear(); // Bersihkan isi sheet lama untuk update terbaru
    }

    // 2. Tentukan nama hari & tanggal untuk bulan tersebut
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var parts = sheetName.split(' ');
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var monthIdx = monthNames.indexOf(parts[0]) !== -1 ? monthNames.indexOf(parts[0]) : 9;
    var year = parseInt(parts[1], 10) || 2026;
    var daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

    // 3. Susun Baris Header (Baris 1: Judul, Baris 2: Nama Hari, Baris 3: Tanggal)
    var headerRow1 = ['Schedule MOD ' + sheetName];
    var headerRow2 = ['Day', 'Position'];
    var headerRow3 = ['Name', 'Position'];

    for (var d = 1; d <= 31; d++) {
      if (d <= daysInMonth) {
        var dt = new Date(year, monthIdx, d);
        headerRow2.push(dayNames[dt.getDay()]);
        headerRow3.push(String(d < 10 ? '0' + d : d));
      } else {
        headerRow2.push('');
        headerRow3.push(String(d < 10 ? '0' + d : d));
      }
    }
    headerRow2.push('Count');
    headerRow3.push('Count');

    // Tulis Header Judul
    sheet.getRange(1, 1).setValue('Schedule MOD ' + sheetName).setFontWeight('bold').setFontSize(12);
    
    // Tulis Header Kolom
    sheet.getRange(2, 1, 1, headerRow2.length).setValues([headerRow2]).setFontWeight('bold').setBackground('#e2e8f0');
    sheet.getRange(3, 1, 1, headerRow3.length).setValues([headerRow3]).setFontWeight('bold').setBackground('#cbd5e1');

    // 4. Susun Baris Data Petugas
    var rows = [];
    for (var i = 0; i < officers.length; i++) {
      var off = officers[i];
      var row = [off.name, off.role];
      var count = 0;

      for (var d = 1; d <= 31; d++) {
        var shift = (off.shifts && off.shifts[d]) ? off.shifts[d] : '';
        if (shift) count++;
        row.push(shift);
      }
      row.push(count);
      rows.push(row);
    }

    if (rows.length > 0) {
      sheet.getRange(4, 1, rows.length, rows[0].length).setValues(rows);

      // Beri warna latar untuk MOD1 (ungu), MOD2 (kuning), MOD (hijau muda)
      for (var r = 0; r < rows.length; r++) {
        for (var c = 2; c < 33; c++) {
          var val = rows[r][c];
          var cell = sheet.getRange(r + 4, c + 1);
          if (val === 'MOD1') {
            cell.setBackground('#e0e7ff').setFontColor('#3730a3').setFontWeight('bold');
          } else if (val === 'MOD2') {
            cell.setBackground('#fef3c7').setFontColor('#92400e').setFontWeight('bold');
          } else if (val === 'MOD') {
            cell.setBackground('#d1fae5').setFontColor('#065f46').setFontWeight('bold');
          }
        }
      }
    }

    // Auto-fit kolom agar rapi
    sheet.autoResizeColumns(1, 35);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Tab ' + sheetName + ' berhasil dibuat / diperbarui di Google Sheets!',
      officersCount: officers.length
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var sheetNames = [];
  for (var i = 0; i < sheets.length; i++) {
    sheetNames.push(sheets[i].getName());
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    availableSheets: sheetNames
  })).setMimeType(ContentService.MimeType.JSON);
}
