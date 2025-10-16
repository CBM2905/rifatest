// Script para importar participantes desde participants.xlsx a Firestore
// Requiere: npm install xlsx firebase-admin

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const COLLECTION = 'participants';
const PARTICIPANTS = [
  { numero: 1, nombre: 'KELER 4S' },
  { numero: 2, nombre: 'ANDRES GUERRA' },
  { numero: 3, nombre: 'MATHEW BOHORQUEZ' },
  { numero: 4, nombre: 'FABIAN VEGA' },
  { numero: 5, nombre: 'SOFIA SALDARRIAGA' },
  { numero: 6, nombre: 'MADRE' },
  { numero: 7, nombre: 'CAMILO ARENAS' },
  { numero: 8, nombre: 'Paola Malagón' },
  { numero: 9, nombre: 'Gabriela' },
  { numero: 10, nombre: 'ELIANA 4S' },
  { numero: 11, nombre: 'SOFIA SALDARRIAGA' },
  { numero: 12, nombre: 'Diana 4s' },
  { numero: 13, nombre: 'WILBER BOHORQUEZ' },
  { numero: 14, nombre: 'PAULA ABRIL' },
  { numero: 15, nombre: 'LIDA 4S' },
  { numero: 16, nombre: 'MARIA CAMILA BOHORQUEZ' },
  { numero: 17, nombre: 'LIZ PRIMA' },
  { numero: 18, nombre: 'PAULA MORATO' },
  { numero: 19, nombre: 'LAURA GUYAMBUCO' },
  { numero: 20, nombre: 'ALEJANDRA4S' },
  { numero: 21, nombre: 'ANDERSON 4S' },
  { numero: 22, nombre: 'MIGUEL CARO' },
  { numero: 23, nombre: 'Gabriela' },
  { numero: 24, nombre: 'Paola Malagón' },
  { numero: 25, nombre: 'JENNIFER DISCORD' },
  { numero: 26, nombre: 'Catalina Moreno' },
  { numero: 27, nombre: 'OSCAR GERMAN URBINA 4S' },
  { numero: 28, nombre: 'MADRE' },
  { numero: 29, nombre: 'TATIANA 4S' },
  { numero: 30, nombre: 'JULIETH 4S' },
  { numero: 31, nombre: 'Adriana Vega' },
  { numero: 32, nombre: 'Useche' },
  { numero: 33, nombre: 'NICOL U' },
  { numero: 34, nombre: 'LINA VEGA' },
  { numero: 35, nombre: 'Luisa Marina Garzon' },
  { numero: 36, nombre: 'ALEJANDRO' },
  { numero: 37, nombre: 'SEBASTIAN MIRANDA' },
  { numero: 38, nombre: 'ANA 4S' },
  { numero: 39, nombre: 'NANCY MEDINA' },
  { numero: 40, nombre: 'Yiselth Vanegas' },
  { numero: 41, nombre: 'PAULA ABRIL' },
  { numero: 42, nombre: 'Elsy Garzón' },
  { numero: 43, nombre: 'LINA VEGA' },
  { numero: 44, nombre: 'FABIAN VEGA' },
  { numero: 45, nombre: 'CATALINA JOYCE' },
  { numero: 46, nombre: '' },
  { numero: 47, nombre: 'Adriana Vega' },
  { numero: 48, nombre: 'MARLLY PINEDA' },
  { numero: 49, nombre: 'LIZ PRIMA' },
  { numero: 50, nombre: 'ALEJANDRA 4S' },
  { numero: 51, nombre: '' },
  { numero: 52, nombre: '' },
  { numero: 53, nombre: 'VALENTINA YAGAMA' },
  { numero: 54, nombre: '' },
  { numero: 55, nombre: 'Elisabeth' },
  { numero: 56, nombre: 'Elsy Garzon' },
  { numero: 57, nombre: 'ASHLY U' },
  { numero: 58, nombre: 'ELIZABETH 4S' },
  { numero: 59, nombre: '' },
  { numero: 60, nombre: '' },
  { numero: 61, nombre: 'LAURA GUAYAMBUCO' },
  { numero: 62, nombre: 'PAULA MANIZALES' },
  { numero: 63, nombre: 'ALEJANDRO' },
  { numero: 64, nombre: 'Inua' },
  { numero: 65, nombre: '' },
  { numero: 66, nombre: 'NAYA QUIROGA' },
  { numero: 67, nombre: 'SEBASTIAN MIRANDA' },
  { numero: 68, nombre: 'ALEJANDRA 4S' },
  { numero: 69, nombre: ' Paula Vargas' },
  { numero: 70, nombre: 'Elsy Garzón' },
  { numero: 71, nombre: '' },
  { numero: 72, nombre: 'WILBER BOHORQUEZ' },
  { numero: 73, nombre: 'SONIA 4S' },
  { numero: 74, nombre: 'Useche' },
  { numero: 75, nombre: 'David Santiago Bohórquez' },
  { numero: 76, nombre: '' },
  { numero: 77, nombre: 'DEYSI PIÑA' },
  { numero: 78, nombre: 'NICOL U' },
  { numero: 79, nombre: 'Elisabeth' },
  { numero: 80, nombre: 'WILBER BOHORQUEZ' },
  { numero: 81, nombre: '' },
  { numero: 82, nombre: 'TATIANA 4S' },
  { numero: 83, nombre: '' },
  { numero: 84, nombre: 'LIZ PRIMA' },
  { numero: 85, nombre: '' },
  { numero: 86, nombre: 'ELIZABETH 4S' },
  { numero: 87, nombre: 'Elsy Garzón' },
  { numero: 88, nombre: '' },
  { numero: 89, nombre: 'Catalina García' },
  { numero: 90, nombre: '' },
  { numero: 91, nombre: 'Luisa Marina Garzon' },
  { numero: 92, nombre: 'CLAUDIA  CASALLLAS' },
  { numero: 93, nombre: 'FERNEY BOHORQUEZ' },
  { numero: 94, nombre: 'FERNEY BOHORQUEZ' },
  { numero: 95, nombre: 'FERNEY BOHORQUEZ' },
  { numero: 96, nombre: 'FERNEY BOHORQUEZ' },
  { numero: 97, nombre: 'FABIAN VEGA' },
  { numero: 98, nombre: 'ALEJANDRA 4S' },
  { numero: 99, nombre: 'KELER 4S' }
];

async function main() {
  let imported = 0, skipped = 0;
  for (const p of PARTICIPANTS) {
    const ticketNumber = parseInt(p.numero, 10);
    const name = String(p.nombre || '').trim();
    if (!ticketNumber || !name) { skipped++; continue; }
    // Verifica si el ticket ya existe
    const exists = await db.collection(COLLECTION).where('ticketNumber', '==', ticketNumber).get();
    if (!exists.empty) {
      console.log(`Ticket #${ticketNumber} ya existe, saltando`);
      skipped++;
      continue;
    }
    const doc = {
      ticketNumber,
      name,
      paid: true,
      phone: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection(COLLECTION).add(doc);
    imported++;
    console.log('Importado:', doc);
  }
  console.log(`Importación finalizada. Importados: ${imported}, saltados: ${skipped}`);
}

main().catch(err => { console.error('Error:', err); });
