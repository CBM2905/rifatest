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

// Elementos para búsqueda y filtro
let adminSearchInput, adminFilterAll, adminFilterPaid, adminFilterUnpaid;
if (adminPanel) {
  const searchDiv = document.createElement('div');
  searchDiv.style.marginBottom = '8px';
  adminSearchInput = document.createElement('input');
  adminSearchInput.type = 'text';
  adminSearchInput.placeholder = 'Buscar por nombre...';
  adminSearchInput.style.marginRight = '8px';
  searchDiv.appendChild(adminSearchInput);
  adminFilterAll = document.createElement('button');
  adminFilterAll.textContent = 'Todos';
  adminFilterPaid = document.createElement('button');
  adminFilterPaid.textContent = 'Pagaron';
  adminFilterUnpaid = document.createElement('button');
  adminFilterUnpaid.textContent = 'No pagaron';
  [adminFilterAll, adminFilterPaid, adminFilterUnpaid].forEach(btn => {
    btn.style.marginRight = '4px';
    searchDiv.appendChild(btn);
  });
  adminPanel.insertBefore(searchDiv, adminPanel.firstChild);
}
let adminCurrentFilter = 'all';

let adminUnlocked = false;
let editingParticipantId = null;

if (adminOpen) {
  adminOpen.addEventListener('click', () => {
    if (adminPinModal) adminPinModal.setAttribute('aria-hidden', 'false');
    // Reset search/filter when opening admin panel
    if (adminSearchInput) adminSearchInput.value = '';
    adminCurrentFilter = 'all';
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
  let parts = participantsCache.length ? participantsCache : await fetchParticipants();
  // Apply search filter
  const search = adminSearchInput ? adminSearchInput.value.trim().toLowerCase() : '';
  if (search) {
    parts = parts.filter(p => (p.name || '').toLowerCase().includes(search));
  }
  // Apply paid/unpaid filter
  if (adminCurrentFilter === 'paid') parts = parts.filter(p => !!p.paid);
  else if (adminCurrentFilter === 'unpaid') parts = parts.filter(p => !p.paid);

  adminList.innerHTML = '';
  if (!parts.length) { adminList.textContent = 'No hay participantes.'; return; }

  parts.forEach(p => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const pagoText = p.paid ? 'Pagó' : 'No pagó';
    const pagoClass = p.paid ? 'admin-paid' : 'admin-unpaid';
    row.innerHTML = `<strong>${p.name || '—'}</strong> (${p.phone || '—'}) — Ticket: ${p.ticketNumber || '—'} <span class="${pagoClass}" style="margin-left:8px">${pagoText}</span>`;
    const btnEdit = document.createElement('button'); btnEdit.textContent = 'Editar';
    const btnDel = document.createElement('button'); btnDel.textContent = 'Eliminar';
    // Add download button for paid participants
    const btnDownload = document.createElement('button'); btnDownload.textContent = 'Descargar';
    if (!p.paid) btnDownload.disabled = true; // only enabled for paid
    btnEdit.addEventListener('click', () => openEditParticipant(p));
    btnDel.addEventListener('click', () => deleteParticipant(p));
    btnDownload.addEventListener('click', () => {
      try {
        generateReceipt(p);
      } catch (err) { console.error('PDF error', err); alert('Error generando PDF'); }
    });
    row.appendChild(btnEdit); row.appendChild(btnDel);
    row.appendChild(btnDownload);
    adminList.appendChild(row);
  });
}

// Generate a simple receipt PDF using jsPDF (UMD bundle exposes window.jspdf)
async function generateReceipt(p) {
  // Ensure jsPDF is available
  const jspdfLib = window.jspdf || window.jsPDF || null;
  if (!jspdfLib) {
    alert('La librería jsPDF no está cargada');
    return;
  }
  // UMD bundle may expose as { jsPDF: function }
  const jsPDF = jspdfLib.jsPDF || jspdfLib;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  // Header
  doc.setFillColor(37, 99, 235); // blue
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Recibo de pago', 14, 18);
  // Small subtitle
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Comprobante generado automáticamente', 14, 24);

  // Receipt meta (right side)
  const now = new Date();
  const receiptId = p.id ? `${p.id.substring(0,6)}-${now.getTime().toString().slice(-5)}` : `T${p.ticketNumber || 'NA'}-${now.getTime().toString().slice(-5)}`;
  doc.setTextColor(44, 62, 80);
  doc.setFontSize(9);
  doc.text(`Recibo: ${receiptId}`, pageW - 14, 18, { align: 'right' });
  doc.text(`Fecha: ${now.toLocaleString()}`, pageW - 14, 24, { align: 'right' });

  // Boxed details
  doc.setDrawColor(222, 226, 230);
  doc.setFillColor(249, 250, 251);
  const boxY = 36;
  doc.roundedRect(12, boxY, pageW - 24, 50, 4, 4, 'FD');
  doc.setTextColor(33, 37, 41);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Nombre', 16, boxY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(p.name || '—', 16, boxY + 18);

  doc.setFont('helvetica', 'bold');
  doc.text('Ticket', pageW / 2, boxY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(String(p.ticketNumber || '—'), pageW / 2, boxY + 18);

  doc.setFont('helvetica', 'bold');
  doc.text('Teléfono', 16, boxY + 34);
  doc.setFont('helvetica', 'normal');
  doc.text(p.phone || p.email || '—', 16, boxY + 42);

  doc.setFont('helvetica', 'bold');
  doc.text('Estado', pageW / 2, boxY + 34);
  doc.setFont('helvetica', 'normal');
  doc.text(p.paid ? 'Pagó' : 'No pagó', pageW / 2, boxY + 42);

  // Amount section (if payment amount present)
  if (p.amount || p.price) {
    doc.setFont('helvetica', 'bold');
    doc.text('Importe', pageW - 60, boxY + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(String(p.amount || p.price), pageW - 60, boxY + 18);
  }

  // Footer note
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Gracias por tu pago. Conserva este comprobante como comprobante de admisión.', 14, boxY + 72);
  doc.text('La rifa será el 20 de octubre — estén atentos.', 14, boxY + 82);
  // Small canvas-generated logo (circular) and QR code
  try {
    // create a tiny logo via canvas
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = 120; logoCanvas.height = 40;
    const lctx = logoCanvas.getContext('2d');
    // background transparent
    lctx.fillStyle = 'rgba(0,0,0,0)'; lctx.fillRect(0,0,120,40);
    // blue circle
    lctx.beginPath(); lctx.arc(20,20,14,0,Math.PI*2); lctx.closePath();
    lctx.fillStyle = '#2563eb'; lctx.fill();
    // white initials
    lctx.fillStyle = '#fff'; lctx.font = 'bold 14px sans-serif'; lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
    lctx.fillText('RF', 20, 20);
    // site name
    lctx.fillStyle = '#1f2937'; lctx.font = '12px sans-serif'; lctx.textAlign = 'left';
    lctx.fillText('Rifa - Evento', 44, 22);
    const logoDataUrl = logoCanvas.toDataURL('image/png');

    // QR: use Google Chart API to get a quick QR image with ticket metadata
    const qrText = encodeURIComponent(JSON.stringify({ ticket: p.ticketNumber || null, id: p.id || null }));
    const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=150x150&chl=${qrText}&chld=L|1`;

    // load QR image
    const qrImg = await new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = (e) => rej(e);
      im.src = qrUrl;
    });

    // draw images into PDF: logo at top-left, QR at bottom-right of the boxed area
    // Add logo
    const logoWmm = 30; const logoHmm = 10; // approximate mm sizes
    doc.addImage(logoDataUrl, 'PNG', 14, 6, logoWmm, logoHmm);

    // Convert QR image to data URL via canvas (to ensure CORS-safety)
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = qrImg.width; qrCanvas.height = qrImg.height;
    const qctx = qrCanvas.getContext('2d');
    qctx.drawImage(qrImg, 0, 0);
    const qrDataUrl = qrCanvas.toDataURL('image/png');
    const qrWmm = 28; const qrHmm = 28;
    doc.addImage(qrDataUrl, 'PNG', pageW - 14 - qrWmm, boxY + 6, qrWmm, qrHmm);

    // Trigger save after images are embedded
    const filename = `recibo_${receiptId}.pdf`;
    doc.save(filename);
    showToast('Descarga iniciada: ' + filename);

  } catch (err) {
    console.warn('Error embedding images in PDF, falling back to text-only PDF', err);
    try {
      const filename = `recibo_${receiptId}.pdf`;
      doc.save(filename);
      showToast('Descarga iniciada: ' + filename);
    } catch (err2) {
      console.error('Error saving PDF', err2);
      alert('Error generando el PDF');
    }
  }

  // Try to set a flag in Firestore that a receipt was generated
  if (p.id && typeof db !== 'undefined') {
    try {
      db.collection(PARTICIPANTS_COL).doc(p.id).set({ receiptGenerated: true }, { merge: true });
    } catch (err) {
      // ignore write errors silently but log
      console.warn('Could not set receiptGenerated flag', err);
    }
  }
}

// Simple toast helper
function showToast(msg, ms = 2200) {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.style.position = 'fixed';
    t.style.right = '18px';
    t.style.bottom = '18px';
    t.style.background = 'rgba(17,24,39,0.95)';
    t.style.color = '#fff';
    t.style.padding = '10px 14px';
    t.style.borderRadius = '8px';
    t.style.boxShadow = '0 6px 18px rgba(2,6,23,0.2)';
    t.style.zIndex = 9999;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => { t.style.opacity = '0'; }, ms);
}

// Wire up search and filter controls (if present)
if (adminSearchInput) adminSearchInput.addEventListener('input', () => renderAdminList());
if (adminFilterAll) adminFilterAll.addEventListener('click', () => { adminCurrentFilter = 'all'; renderAdminList(); });
if (adminFilterPaid) adminFilterPaid.addEventListener('click', () => { adminCurrentFilter = 'paid'; renderAdminList(); });
if (adminFilterUnpaid) adminFilterUnpaid.addEventListener('click', () => { adminCurrentFilter = 'unpaid'; renderAdminList(); });

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

// Ruleta functionality
const showRuletaBtn = document.getElementById('show-ruleta-btn');
const ruletaContainer = document.getElementById('ruleta-container');
const wheel = document.getElementById('wheel');
const spinBtn = document.getElementById('spinBtn');
const result = document.getElementById('result');
const resultNumber = document.getElementById('resultNumber');
const resultSource = document.getElementById('resultSource');

if (showRuletaBtn) {
  showRuletaBtn.addEventListener('click', () => {
    if (!adminUnlocked) {
      alert('Necesitas acceso de administrador para usar la ruleta.');
      return;
    }
    ruletaContainer.style.display = ruletaContainer.style.display === 'none' ? 'block' : 'none';
    if (ruletaContainer.style.display === 'block' && !wheel.children.length) {
      createWheelNumbers();
    }
  });
}

// Colores para los números de la ruleta (0-100)
const colors = {
  '0': '#10b981', // Verde para el 0
  'even': '#2d3748', // Negro para pares
  'odd': '#e53e3e' // Rojo para impares
};

// Crear los números de la ruleta (0-100)
function createWheelNumbers() {
  wheel.innerHTML = '';
  
  // Crear números para la ruleta
  for (let i = 0; i <= 100; i++) {
    const numberElement = document.createElement('div');
    numberElement.className = 'wheel-number';
    
    // Calcular el ángulo para cada número
    const angle = (i * (360 / 101));
    numberElement.style.transform = `rotate(${angle}deg)`;
    
    // Establecer colores alternados
    let color;
    if (i === 0) {
      color = colors['0'];
    } else if (i % 2 === 0) {
      color = colors['even'];
    } else {
      color = colors['odd'];
    }
    
    // Añadir elemento interior del número
    const innerNumber = document.createElement('div');
    innerNumber.className = 'wheel-number-inner';
    innerNumber.style.background = color;
    
    // Crear el contenido del número
    const numberText = document.createElement('span');
    numberText.textContent = i;
    numberText.style.transform = `rotate(-${angle}deg)`; // Mantener números derechos
    innerNumber.appendChild(numberText);
    
    numberElement.appendChild(innerNumber);
    wheel.appendChild(numberElement);
  }
  
  // Añadir efecto de brillo
  const glow = document.createElement('div');
  glow.className = 'wheel-glow';
  wheel.appendChild(glow);
}


// Obtener un número aleatorio de la API cuántica (0-100)
async function getQuantumRandomNumber() {
  try {
    const response = await fetch('https://qrng.anu.edu.au/API/jsonI.php?length=1&type=uint8', {
      method: 'GET',
      mode: 'cors'
    });
    
    if (!response.ok) {
      throw new Error('Error en la respuesta de la API');
    }
    
    const data = await response.json();
    
    if (data && data.data && data.data.length > 0) {
      let randomValue = data.data[0];
      return randomValue % 101;
    } else {
      throw new Error('Datos inválidos de la API');
    }
  } catch (error) {
    console.error('Error al obtener número cuántico:', error);
    return null;
  }
}

if (spinBtn) {
  spinBtn.addEventListener('click', async () => {
    if (!adminUnlocked) {
      alert('Necesitas acceso de administrador para usar la ruleta.');
      return;
    }

    // Deshabilitar el botón durante el giro
    spinBtn.disabled = true;
    spinBtn.querySelector('.btn-content').innerHTML = `
      <span class="dice-icon">⏳</span>
      <span class="btn-text">Obteniendo número cuántico...</span>
    `;
    
    // Ocultar resultado anterior y añadir clase de spinning
    result.style.display = 'none';
    wheel.classList.add('spinning');
    
    try {
      // Obtener número aleatorio (0-100)
      let number = await getQuantumRandomNumber();
      let source = 'ANU Quantum Random Numbers';
      
      // Si falla la API cuántica, usar CSPRNG local
      if (number === null) {
        source = 'CSPRNG local';
        const array = new Uint8Array(1);
        window.crypto.getRandomValues(array);
        number = array[0] % 101;
      }
      
      // Calcular ángulo de parada
      const fullRotations = 8 + Math.floor(Math.random() * 4); // Más rotaciones
      const numberAngle = number * (360 / 101);
      const stopAngle = fullRotations * 360 + (360 - numberAngle);
      
      // Aplicar la animación con easing
      wheel.style.transition = 'transform 8s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
      wheel.style.transform = `rotate(${stopAngle}deg)`;
      
      // Mostrar resultado después de la animación
      setTimeout(() => {
        wheel.classList.remove('spinning');
        resultNumber.textContent = number;
        resultSource.textContent = `Fuente: ${source}`;
        result.style.display = 'block';
        result.classList.add('show-result');
        
        // Resaltar el número ganador en la matriz
        highlightWinnerInMatrix(number);
        
        // Restablecer el botón
        spinBtn.disabled = false;
        spinBtn.querySelector('.btn-content').innerHTML = `
          <span class="dice-icon">🎲</span>
          <span class="btn-text">Girar Ruleta</span>
        `;
        
        // Efecto de confeti al mostrar el resultado
        showConfetti();
      }, 8000);
      
    } catch (error) {
      console.error('Error al girar la ruleta:', error);
      wheel.classList.remove('spinning');
      spinBtn.disabled = false;
      spinBtn.querySelector('.btn-content').innerHTML = `
        <span class="dice-icon">🎲</span>
        <span class="btn-text">Girar Ruleta</span>
      `;
    }
  });
}

// Función para mostrar efecto de confeti
function showConfetti() {
  const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96c93d'];
  const confettiCount = 200;
  
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.animationDelay = Math.random() * 3 + 's';
    confetti.style.opacity = Math.random() + 0.5;
    document.body.appendChild(confetti);
    
    // Remover después de la animación
    setTimeout(() => confetti.remove(), 6000);
  }
}

// (form removed in matrix-only UI)

// Sortear ganador (cliente) — nota: para producción recomendamos sorteo en servidor
if (drawBtn) {
  drawBtn.addEventListener('click', async () => {
    drawBtn.disabled = true;
    if (winnerEl) winnerEl.textContent = 'Calculando...';
    try {
      const parts = participantsCache.length ? participantsCache : await fetchParticipants();
      if (!parts.length) {
        if (winnerEl) winnerEl.textContent = 'No hay participantes.';
        drawBtn.disabled = false;
        return;
      }
      const idx = Math.floor(Math.random() * parts.length);
      const winner = parts[idx];
      if (winnerEl) winnerEl.textContent = `${winner.name} — ${winner.email}`;
      // Resaltar en matriz si está visible
      highlightWinnerInMatrix(winner);
    } catch (err) {
      console.error(err);
      if (winnerEl) winnerEl.textContent = 'Error al realizar el sorteo.';
    } finally {
      drawBtn.disabled = false;
    }
  });
} else {
  console.warn('drawBtn not found in DOM; draw feature disabled');
}

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
      if (occupant.paid) cell.classList.add('paid');
      // store owner id for possible highlights
      if (occupant.id) cell.dataset.id = occupant.id;
      // make cell focusable for keyboard users
      cell.tabIndex = 0;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `Ticket #${i} ocupado por ${occupant.name || 'reservado'}`);
      const small = document.createElement('div');
      small.className = 'small';
      small.textContent = occupant.name || occupant.email || 'Reservado';
  const tip = document.createElement('div');
  tip.className = 'matrix-tooltip';
  const paidLabel = occupant.paid ? 'Pagó' : 'No pagó';
  tip.textContent = `${occupant.name || ''} — ${occupant.phone || occupant.email || ''} (${paidLabel})`.trim();
      cell.appendChild(small);
      cell.appendChild(tip);
      // Add download/view button overlay for occupied tickets (paid or not)
      const dbtn = document.createElement('button');
      dbtn.className = 'download-btn';
      dbtn.textContent = occupant.paid ? 'Descargar' : 'Ver recibo';
      if (!occupant.paid) dbtn.title = 'Este participante aún no ha pagado';
      // accessibility: label and keyboard focus
      dbtn.setAttribute('aria-label', `Descargar/Ver recibo ticket ${occupant.ticketNumber || ''}`);
      dbtn.tabIndex = 0;
      dbtn.addEventListener('click', (ev) => { ev.stopPropagation(); generateReceipt(occupant); });
      dbtn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); dbtn.click(); } });
      cell.appendChild(dbtn);

      // Long press support for touch devices to reveal button
      let pressTimer = null;
      cell.addEventListener('touchstart', () => { pressTimer = setTimeout(() => cell.classList.add('show-download'), 600); });
      cell.addEventListener('touchend', () => { clearTimeout(pressTimer); setTimeout(() => cell.classList.remove('show-download'), 2000); });

      // Keyboard: show download overlay on focus, allow Enter to download
      cell.addEventListener('focus', () => { cell.classList.add('show-download'); });
      cell.addEventListener('blur', () => { cell.classList.remove('show-download'); });
      cell.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          generateReceipt(occupant);
        }
      });
    } else {
      cell.classList.add('available');
      // available cells should be focusable too
      cell.tabIndex = 0;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `Ticket #${i} disponible`);
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
      cell.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openTicketModal(i); } });
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
  matrixEl.querySelectorAll('.matrix-cell').forEach(c => {
    c.classList.remove('matrix-winner');
    c.style.animation = '';
  });
  
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
    cell.style.animation = 'winnerPulse 2s ease-in-out infinite';
    
    // Añadir corona al ganador
    const crown = document.createElement('div');
    crown.className = 'winner-crown';
    crown.textContent = '👑';
    cell.appendChild(crown);
    
    // Scroll into view slightly with offset
    const yOffset = -100; // pixels from top
    const y = cell.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({top: y, behavior: 'smooth'});
    
    // Remover coronas anteriores
    document.querySelectorAll('.winner-crown').forEach(c => {
      if (c.parentElement !== cell) {
        c.remove();
      }
    });
  }
}

// Inicializar vista
// Start realtime updates; also do a one-time load in case listener is slow
initRealtime();
loadAndRender();
// Auth removed: quick PIN validated against server-stored PIN in participants
