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
  } else if (data.action === 'updateStatus') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.getRange(i + 1, 6).setValue(data.status);       // kolom F = status
        sheet.getRange(i + 1, 7).setValue(data.tanggalDone || ''); // kolom G = tanggalDone
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
