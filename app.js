// Archivo: js/app.js
// Código básico para interactuar con Firestore (compat) y manejar la UI

// --- CONFIGURACIÓN ---
// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBuvYBZUYfFcX8NPiHgYVQHlNb7rsEvtLs",
  authDomain: "testt-432a7.firebaseapp.com",
  projectId: "testt-432a7",
  storageBucket: "testt-432a7.firebasestorage.app",
  messagingSenderId: "377883179539",
  appId: "1:377883179539:web:8ecece01b14a8bd65a5de6"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const PARTICIPANTS_COL = 'participants';
// If you want to read PIN from a fixed document, set its id here
const PIN_DOC_ID = 'XCjWroaonz1bzNthSGQT';

// --- SELECTORES ---
// participants list removed in matrix-only UI
const drawBtn = document.getElementById('draw-btn');
const winnerEl = document.getElementById('winner');
const matrixEl = document.getElementById('matrix');
const modal = document.getElementById('ticket-modal');
const modalTicketNum = document.getElementById('modal-ticket-num');
const ticketForm = document.getElementById('ticket-form');
const ticketName = document.getElementById('ticket-name');
const ticketPhone = document.getElementById('ticket-phone');
const ticketPaid = document.getElementById('ticket-paid');
const modalCancel = document.getElementById('modal-cancel');
// debug UI removed for production
// auth removed: quick PIN flow validates against serverPin

let currentSelectedTicket = null;
let participantsCache = [];
let currentUser = null; 
let isAdmin = false;
let serverPin = null; // PIN stored in Firestore (participants collection)
// QUICK PIN (insecure): a small convenience option to allow fast admin actions without signing in.
// WARNING: this is stored client-side and is not secure. Use only for closed/internal demos.
// If you deploy the Cloud Function, set FUNCTIONS_BASE_URL to the function base URL
// e.g. https://us-central1-YOUR_PROJECT.cloudfunctions.net/api
const FUNCTIONS_BASE_URL = '';
const ADMIN_PIN = "1234";

// --- FUNCIONES ---
async function fetchParticipants() {
  try {
    const snap = await db.collection(PARTICIPANTS_COL).orderBy('createdAt', 'asc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // If ordering by createdAt fails (missing field or index), fall back to a plain fetch
    console.warn('fetchParticipants: orderBy(createdAt) failed, falling back to un-ordered get():', err);
    const snap = await db.collection(PARTICIPANTS_COL).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

// participants list is not shown in the matrix-only UI; keep fetchParticipants for data

async function loadAndRender() {
  const parts = await fetchParticipants();
  participantsCache = parts;
  // Load PIN from a fixed document for predictability
  try {
    const pinDoc = await db.collection(PARTICIPANTS_COL).doc(PIN_DOC_ID).get();
    if (pinDoc.exists) {
      const data = pinDoc.data();
      if (data && Object.prototype.hasOwnProperty.call(data, 'pin')) {
        serverPin = String(data.pin);
        console.log('loadAndRender: PIN loaded from fixed doc', PIN_DOC_ID);
      }
    } else {
      console.log('loadAndRender: PIN doc does not exist:', PIN_DOC_ID);
    }
  } catch (e) {
    console.error('loadAndRender: error loading PIN doc', e);
  }
  // Debugging output to help find why serverPin might be missing
  try {
    console.log('Firebase projectId:', firebase.app().options.projectId);
  } catch (e) {
    console.log('Firebase not initialized yet');
  }
  console.log('loadAndRender: participants fetched:', parts);
  console.log('loadAndRender: detected serverPin =', serverPin);
  // no debug output in production
  renderMatrix10x10(parts);
}

// Initialize realtime listener so UI updates without reload
function initRealtime() {
  // Listen for participant list updates
  const unsubParticipants = db.collection(PARTICIPANTS_COL).orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      participantsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('onSnapshot: participants updated, count=', participantsCache.length);
      renderMatrix10x10(participantsCache);
    }, err => {
      console.error('Realtime listener error', err);
    });

  // Also listen to the fixed PIN document so changes propagate immediately
  const unsubPinDoc = db.collection(PARTICIPANTS_COL).doc(PIN_DOC_ID)
    .onSnapshot(dsnap => {
      if (!dsnap.exists) {
          console.log('PIN doc snapshot: does not exist');
          serverPin = null;
          return;
        }
      const data = dsnap.data();
      if (data && Object.prototype.hasOwnProperty.call(data, 'pin')) {
        serverPin = String(data.pin);
        console.log('PIN doc snapshot: updated pin (redacted)');
      }
    }, err => console.error('PIN doc listener error', err));

  // return a combined unsubscribe function
  return () => { unsubParticipants(); unsubPinDoc(); };
}

// --- ADMIN UI (PIN-gated) ---
const adminOpen = document.getElementById('admin-open');
const adminPanel = document.getElementById('admin-panel');
const adminList = document.getElementById('admin-list');
const adminPinModal = document.getElementById('admin-pin-modal');
const adminPinForm = document.getElementById('admin-pin-form');
const adminPinEntry = document.getElementById('admin-pin-entry');
const adminPinCancel = document.getElementById('admin-pin-cancel');
const participantEditModal = document.getElementById('participant-edit-modal');
const participantEditForm = document.getElementById('participant-edit-form');
const participantEditCancel = document.getElementById('participant-edit-cancel');
const editName = document.getElementById('edit-name');
const editPhone = document.getElementById('edit-phone');
const editTicket = document.getElementById('edit-ticket');
const editPaid = document.getElementById('edit-paid');

let adminUnlocked = false;
let editingParticipantId = null;

if (adminOpen) {
  adminOpen.addEventListener('click', () => {
    if (adminPinModal) adminPinModal.setAttribute('aria-hidden', 'false');
  });
}

if (adminPinCancel) adminPinCancel.addEventListener('click', () => { if (adminPinModal) adminPinModal.setAttribute('aria-hidden', 'true'); });

if (adminPinForm) {
  adminPinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = adminPinEntry.value.trim();
    if (!pin) return alert('Introduce PIN');
    if (!serverPin) return alert('PIN no configurado en servidor');
    if (pin !== serverPin) return alert('PIN incorrecto');
    adminUnlocked = true;
    if (adminPinModal) adminPinModal.setAttribute('aria-hidden', 'true');
    if (adminPanel) adminPanel.style.display = 'block';
    await renderAdminList();
  });
}

async function renderAdminList() {
  if (!adminList) return;
  const parts = participantsCache.length ? participantsCache : await fetchParticipants();
  adminList.innerHTML = '';
  if (!parts.length) { adminList.textContent = 'No hay participantes.'; return; }
  parts.forEach(p => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `<strong>${p.name || '—'}</strong> (${p.phone || '—'}) — Ticket: ${p.ticketNumber || '—'}`;
    const btnEdit = document.createElement('button'); btnEdit.textContent = 'Editar';
    const btnDel = document.createElement('button'); btnDel.textContent = 'Eliminar';
    btnEdit.addEventListener('click', () => openEditParticipant(p));
    btnDel.addEventListener('click', () => deleteParticipant(p));
    row.appendChild(btnEdit); row.appendChild(btnDel);
    adminList.appendChild(row);
  });
}

function openEditParticipant(p) {
  editingParticipantId = p.id;
  if (participantEditModal) participantEditModal.setAttribute('aria-hidden', 'false');
  if (editName) editName.value = p.name || '';
  if (editPhone) editPhone.value = p.phone || '';
  if (editTicket) editTicket.value = p.ticketNumber || '';
  if (editPaid) editPaid.checked = !!p.paid;
}

if (participantEditCancel) participantEditCancel.addEventListener('click', () => { if (participantEditModal) participantEditModal.setAttribute('aria-hidden', 'true'); });

if (participantEditForm) {
  participantEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!adminUnlocked) return alert('No autorizado');
    if (!editingParticipantId) return;
    const updated = { name: editName.value.trim(), phone: editPhone.value.trim(), paid: !!editPaid.checked };
    const ticketNum = parseInt(editTicket.value, 10);
    if (!isNaN(ticketNum)) updated.ticketNumber = ticketNum;
    try {
      await db.collection(PARTICIPANTS_COL).doc(editingParticipantId).update(updated);
      if (participantEditModal) participantEditModal.setAttribute('aria-hidden', 'true');
      await loadAndRender();
      if (adminUnlocked) await renderAdminList();
    } catch (err) { console.error(err); alert('Error al actualizar participante'); }
  });
}

async function deleteParticipant(p) {
  if (!adminUnlocked) return alert('No autorizado');
  if (!confirm('Eliminar participante?')) return;
  try {
    await db.collection(PARTICIPANTS_COL).doc(p.id).delete();
    await loadAndRender();
    if (adminUnlocked) await renderAdminList();
  } catch (err) { console.error(err); alert('Error al eliminar'); }
}

// --- AUTH ---
// initAuth removed: we don't require login for quick PIN flow

// (form removed in matrix-only UI)

// Sortear ganador (cliente) — nota: para producción recomendamos sorteo en servidor
drawBtn.addEventListener('click', async () => {
  drawBtn.disabled = true;
  winnerEl.textContent = 'Calculando...';
  try {
    const parts = participantsCache.length ? participantsCache : await fetchParticipants();
    if (!parts.length) {
      winnerEl.textContent = 'No hay participantes.';
      drawBtn.disabled = false;
      return;
    }
    const idx = Math.floor(Math.random() * parts.length);
    const winner = parts[idx];
  winnerEl.textContent = `${winner.name} — ${winner.email}`;
  // Resaltar en matriz si está visible
  highlightWinnerInMatrix(winner);
  } catch (err) {
    console.error(err);
    winnerEl.textContent = 'Error al realizar el sorteo.';
  } finally {
    drawBtn.disabled = false;
  }
});

// Renderizar matriz
// Render fixed 10x10 grid (tickets 1..100). If a participant has ticketNumber field use it as taken.
function renderMatrix10x10(parts) {
  if (!matrixEl) return;
  matrixEl.innerHTML = '';
  // Map participants by ticketNumber if present
  const byTicket = new Map();
  parts.forEach(p => {
    if (p.ticketNumber && Number.isInteger(p.ticketNumber)) byTicket.set(Number(p.ticketNumber), p);
  });

  for (let i = 1; i <= 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'matrix-cell';
    cell.dataset.ticket = i;
    const num = document.createElement('div');
    num.className = 'ticket-num';
    num.textContent = `#${i}`;
    cell.appendChild(num);

    const occupant = byTicket.get(i);
    if (occupant) {
      cell.classList.add('taken');
      // store owner id for possible highlights
      if (occupant.id) cell.dataset.id = occupant.id;
      const small = document.createElement('div');
      small.className = 'small';
      small.textContent = occupant.name || occupant.email || 'Reservado';
  const tip = document.createElement('div');
  tip.className = 'matrix-tooltip';
  const paidLabel = occupant.paid ? 'Pagó' : 'No pagó';
  tip.textContent = `${occupant.name || ''} — ${occupant.phone || occupant.email || ''} (${paidLabel})`.trim();
      cell.appendChild(small);
      cell.appendChild(tip);
    } else {
      cell.classList.add('available');
      const small = document.createElement('div');
      small.className = 'small';
      small.textContent = 'Disponible';
      cell.appendChild(small);
  const tip = document.createElement('div');
  tip.className = 'matrix-tooltip';
  tip.textContent = 'Click para reservar';
      cell.appendChild(tip);
      // click to open modal to reserve
      cell.addEventListener('click', () => openTicketModal(i));
    }

    matrixEl.appendChild(cell);
  }
}

function openTicketModal(ticketNum) {
  // open for anyone; PIN validation will check server-stored PIN
  currentSelectedTicket = ticketNum;
  modalTicketNum.textContent = `#${ticketNum}`;
  ticketName.value = '';
  ticketPhone.value = '';
  ticketPaid.checked = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  modal.setAttribute('aria-hidden', 'true');
  currentSelectedTicket = null;
}

// Handle cancel
if (modalCancel) modalCancel.addEventListener('click', closeModal);

// Submit reservation
if (ticketForm) {
  ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Allow if user is admin OR they supply the quick ADMIN_PIN in the modal
    const pinInput = document.getElementById('admin-pin');
    const pinVal = pinInput ? pinInput.value.trim() : '';
  // Require server-stored PIN (from participants doc). Do not fallback to client PIN for security.
  if (!serverPin) return alert('No hay PIN configurado en Firestore. Crea un documento en `participants` con campo `pin`.');
  const expectedPin = serverPin;
  const hasQuickPin = pinVal && pinVal === expectedPin;
  if (!isAdmin && !hasQuickPin) return alert('Solo administradores pueden reservar tickets. Introduce PIN admin o inicia sesión.');
    if (!currentSelectedTicket) return;
    const name = ticketName.value.trim();
    const phone = ticketPhone.value.trim();
    const paid = !!ticketPaid.checked;
    if (!name || !phone) return alert('Nombre y teléfono son requeridos');

    try {
      // Check if ticket already taken
      const q = await db.collection(PARTICIPANTS_COL).where('ticketNumber', '==', currentSelectedTicket).get();
      if (!q.empty) {
        alert('Ese ticket ya fue reservado por otra persona');
        closeModal();
        await loadAndRender();
        return;
      }

      // If FUNCTIONS_BASE_URL is configured, call server-side reserve API which checks PIN server-side
      if (FUNCTIONS_BASE_URL && pinVal === ADMIN_PIN) {
        // call function
        const res = await fetch(`${FUNCTIONS_BASE_URL}/reserve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketNumber: currentSelectedTicket, name, phone, paid, pin: pinVal })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'reserve failed');
      } else {
        // Fallback (insecure): write directly to Firestore
        await db.collection(PARTICIPANTS_COL).add({
          name,
          phone,
          ticketNumber: currentSelectedTicket,
          paid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      closeModal();
    } catch (err) {
      console.error(err);
      alert('Error al reservar. Revisa la consola.');
    }
  });
}

function highlightWinnerInMatrix(winner) {
  if (!matrixEl) return;
  // Remove previous highlights
  matrixEl.querySelectorAll('.matrix-cell').forEach(c => c.classList.remove('matrix-winner'));
  let cell = null;
  // winner may be object, id string, or ticket number
  if (typeof winner === 'object' && winner !== null) {
    if (winner.ticketNumber) {
      cell = matrixEl.querySelector(`.matrix-cell[data-ticket="${winner.ticketNumber}"]`);
    }
    if (!cell && winner.id) {
      cell = matrixEl.querySelector(`.matrix-cell[data-id="${winner.id}"]`);
    }
  } else if (typeof winner === 'number') {
    cell = matrixEl.querySelector(`.matrix-cell[data-ticket="${winner}"]`);
  } else if (typeof winner === 'string') {
    cell = matrixEl.querySelector(`.matrix-cell[data-id="${winner}"]`);
  }

  if (cell) {
    cell.classList.add('matrix-winner');
    // Scroll into view slightly
    cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Inicializar vista
// Start realtime updates; also do a one-time load in case listener is slow
initRealtime();
loadAndRender();
// Auth removed: quick PIN validated against server-stored PIN in participants
