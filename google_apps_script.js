/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: AUTO CREATE & UPDATE MOD SCHEDULE TABS (SAFE SYNC)
 * =========================================================================
 * Script ini dirancang aman:
 * 1. HANYA menulis ketika action === 'save_schedule' dengan data petugas valid.
 * 2. TIDAK PERNAH menghapus rumus kolom Total (Count) di kolom AH.
 * 3. Permintaan baca / ping TIDAK AKAN PERNAH menghapus atau merubah sheet.
 * =========================================================================
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No payload received'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'save_schedule';
    var sheetName = data.sheetName || 'October 2026';

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    // 1. Tangani PING / CEK KONEKSI
    if (action === 'ping') {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Webhook connected successfully!'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Tangani GET / BACA DATA (Hanya membaca, tanpa merubah)
    if (action === 'get_schedule') {
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Sheet ' + sheetName + ' not found'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var values = sheet.getDataRange().getValues();
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        data: values
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Tangani SIMPAN JADWAL
    if (action === 'save_schedule') {
      var officers = data.officers;
      if (!officers || !Array.isArray(officers) || officers.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'warning',
          message: 'Data petugas kosong, update dibatalkan demi keamanan sheet.'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // Jika sheet belum ada, buat sheet baru
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      var parts = sheetName.split(' ');
      var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var monthIdx = monthNames.indexOf(parts[0]) !== -1 ? monthNames.indexOf(parts[0]) : 9;
      var year = parseInt(parts[1], 10) || 2026;
      var daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

      // Susun matriks baris A4:AG(3+N) [Nama, Role, Day 01 s.d. Day 31]
      var gridValues = [];
      var bgColors = [];

      for (var i = 0; i < officers.length; i++) {
        var off = officers[i];
        var rowVal = [off.name || '', off.role || ''];
        var rowBg = ['#ffffff', '#ffffff'];

        for (var d = 1; d <= 31; d++) {
          var shift = (off.shifts && off.shifts[d]) ? String(off.shifts[d]).trim().toUpperCase() : '';
          rowVal.push(shift);

          if (shift === 'MOD1') {
            rowBg.push('#e0e7ff'); // Soft Indigo
          } else if (shift === 'MOD2') {
            rowBg.push('#fef3c7'); // Soft Amber
          } else if (shift === 'MOD') {
            rowBg.push('#d1fae5'); // Soft Emerald
          } else {
            rowBg.push('#ffffff');
          }
        }
        gridValues.push(rowVal);
        bgColors.push(rowBg);
      }

      // Tulis rentang data (A4:AG...) secara batch (sangat cepat & aman)
      var targetRange = sheet.getRange(4, 1, gridValues.length, 33);
      targetRange.setValues(gridValues);
      targetRange.setBackgrounds(bgColors);

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Jadwal ' + sheetName + ' berhasil disimpan (' + officers.length + ' Petugas)!',
        officersCount: officers.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ignored',
      message: 'Unknown action'
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
