const https = require('https');
const http = require('http');
const storage = require('./storageService');

function formatOfficerList(officers) {
  if (!officers || officers.length === 0) {
    return '_Tidak ada petugas yang dijadwalkan._';
  }
  return officers.map((o, idx) => {
    return `${idx + 1}. *${o.name}* - ${o.role} [${o.shift}]`;
  }).join('\n');
}

function buildMessage(template, dutyData, shiftKey = 'ALL') {
  let officers = [];
  if (shiftKey === 'ALL') {
    officers = dutyData.all || [];
  } else {
    officers = dutyData[shiftKey] || [];
  }

  const officerText = formatOfficerList(officers);

  let msg = template
    .replace(/{hari}/g, dutyData.hari || '')
    .replace(/{tanggal}/g, String(dutyData.day || '').padStart(2, '0'))
    .replace(/{bulan}/g, dutyData.bulan || '')
    .replace(/{tahun}/g, dutyData.tahun || '')
    .replace(/{daftar_petugas}/g, officerText)
    .replace(/{shift}/g, shiftKey);

  return msg;
}

function sendHttpJson(apiUrl, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiUrl);
    const client = urlObj.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(payload);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      },
      timeout: 30000,
      rejectUnauthorized: false
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          body: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gateway request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

async function sendWhatsAppMessage({ shiftKey = 'ALL', dutyData, customMessage = null, manual = false }) {
  const config = storage.getConfig();
  const wa = config.waGateway || {};

  if (!wa.enabled) {
    const logItem = storage.addLog({
      type: manual ? 'MANUAL' : 'AUTO',
      shift: shiftKey,
      status: 'SKIPPED',
      target: wa.targetNumber || 'N/A',
      message: 'WA Gateway dinonaktifkan di pengaturan.',
      response: null
    });
    return { success: false, reason: 'WA Gateway disabled', log: logItem };
  }

  let finalMessage = customMessage;
  if (!finalMessage) {
    const templates = config.messageTemplates || {};
    const template = templates[shiftKey] || templates['ALL'] || 'Jadwal MOD: {daftar_petugas}';
    finalMessage = buildMessage(template, dutyData, shiftKey);
  }

  const payload = {
    sessionId: wa.sessionId || 'appsbee',
    number: wa.targetNumber || '6285729705810-1505093181@g.us',
    message: finalMessage
  };

  const headers = {};
  if (wa.apiKey) {
    headers['x-api-key'] = wa.apiKey;
  }

  try {
    const res = await sendHttpJson(wa.apiUrl || 'https://wa-ab.appsbee.my.id/api/send-message', payload, headers);
    
    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
    const logItem = storage.addLog({
      type: manual ? 'MANUAL' : 'AUTO',
      shift: shiftKey,
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      target: payload.number,
      messageText: finalMessage,
      statusCode: res.statusCode,
      response: res.body
    });

    return {
      success: isSuccess,
      statusCode: res.statusCode,
      response: res.body,
      messageText: finalMessage,
      log: logItem
    };
  } catch (err) {
    const logItem = storage.addLog({
      type: manual ? 'MANUAL' : 'AUTO',
      shift: shiftKey,
      status: 'ERROR',
      target: payload.number,
      messageText: finalMessage,
      error: err.message
    });

    return {
      success: false,
      error: err.message,
      messageText: finalMessage,
      log: logItem
    };
  }
}

module.exports = {
  formatOfficerList,
  buildMessage,
  sendWhatsAppMessage
};
