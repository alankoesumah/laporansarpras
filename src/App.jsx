function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  const data = JSON.parse(e.postData.contents);

  if (data.action === 'create') {
    sheet.appendRow([
      data.id,
      data.tanggal,
      data.pengisi,
      data.tipe,
      data.deskripsi,
      data.status,
      data.tanggalDone || ''
    ]);

    // Kolom H = link foto (kalau ada), dibuat sebagai HYPERLINK supaya bisa diklik
    if (data.fotoUrl) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow, 8).setFormula('=HYPERLINK("' + data.fotoUrl + '", "Lihat Foto")');
    }

    // Kirim notifikasi Telegram setiap ada laporan baru
    sendTelegramNotification(data);

  } else if (data.action === 'updateStatus') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.getRange(i + 1, 6).setValue(data.status);       // kolom F = status
        sheet.getRange(i + 1, 7).setValue(data.tanggalDone || ''); // kolom G = tanggalDone
        if (data.keterangan !== undefined) {
          sheet.getRange(i + 1, 9).setValue(data.keterangan || ''); // kolom I = keterangan tahapan
        }
        break;
      }
    }
  }

  return ContentService.createTextOutput('OK');
}

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Kirim notifikasi ke Telegram ----
function sendTelegramNotification(data) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');

  if (!token || !chatId) return; // belum dikonfigurasi, lewati saja

  const jenis = data.tipe === 'kerusakan' ? 'Laporan Kerusakan' : 'Pengajuan';
  let text =
    '🔔 <b>' + jenis + ' Baru</b>\n' +
    '📅 ' + data.tanggal + '\n' +
    '👤 ' + data.pengisi + '\n' +
    '📝 ' + data.deskripsi;

  try {
    if (data.fotoUrl) {
      // Kirim sebagai foto dengan caption kalau ada lampiran foto
      UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendPhoto', {
        method: 'post',
        payload: {
          chat_id: chatId,
          photo: data.fotoUrl,
          caption: text,
          parse_mode: 'HTML'
        }
      });
    } else {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post',
        payload: {
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML'
        }
      });
    }
  } catch (err) {
    console.error('Gagal kirim notifikasi Telegram: ' + err);
  }
}
