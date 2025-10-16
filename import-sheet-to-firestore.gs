// Apps Script para importar datos de Google Sheets a Firestore evitando duplicados
// Configura tu proyecto y hoja antes de ejecutar

const PROJECT_ID = 'testt-432a7'; // Cambia por tu projectId
const COLLECTION = 'participants';

function importSheetToFirestore() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  // Asume encabezados en la primera fila
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const ticketNumber = parseInt(row[0], 10);
    const name = String(row[1] || '').trim();
    // Detecta SI/NO/x/X en columna PAGO
    const pagoRaw = (row[2] || '').toString().toUpperCase();
    const paid = pagoRaw === 'SI' || pagoRaw === 'X';
    if (!ticketNumber || !name) continue;
    // Verifica si el ticket ya existe en Firestore
    if (ticketExists(ticketNumber)) {
      Logger.log('Ticket #' + ticketNumber + ' ya existe, saltando');
      continue;
    }
    // Construye el objeto
    const doc = {
      ticketNumber,
      name,
      paid,
      createdAt: new Date().toISOString()
    };
    // Escribe en Firestore
    writeToFirestore(doc);
    Logger.log('Importado: ' + JSON.stringify(doc));
  }
}

function ticketExists(ticketNumber) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?pageSize=1&filter=fields.ticketNumber.integerValue=${ticketNumber}`;
  const options = {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  const resp = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(resp.getContentText());
  return json.documents && json.documents.length > 0;
}

function writeToFirestore(doc) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}`;
  // Firestore REST API requiere formato especial
  const body = {
    fields: {
      ticketNumber: { integerValue: doc.ticketNumber },
      name: { stringValue: doc.name },
      paid: { booleanValue: doc.paid },
      createdAt: { timestampValue: doc.createdAt }
    }
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
  const resp = UrlFetchApp.fetch(url, options);
  return resp.getResponseCode() === 200 || resp.getResponseCode() === 201;
}

// Para ejecutar: abre la hoja, pega este script en el editor de Apps Script, configura PROJECT_ID y ejecuta importSheetToFirestore()
// Requiere que el usuario tenga permisos de escritura en Firestore y que la API esté habilitada.