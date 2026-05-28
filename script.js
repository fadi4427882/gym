/* =========================================================
   GymPro — script.js
   Gym Subscription Manager Logic (Secured)
   ========================================================= */

'use strict';

// ─── FRONTEND SECURITY (Anti-Inspect) ─────────────────────
// Note: This prevents casual inspection but does not replace backend security.
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if (e.key === 'F12' || 
     (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || 
     (e.ctrlKey && e.key === 'U')) {
    e.preventDefault();
  }
});

// ─── CONSTANTS ───────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const gymID = urlParams.get('gym') || 'default_gym';
const STORAGE_KEY   = `gymPro_members_${gymID}`;
const EXPIRY_DAYS   = 30;
const MS_PER_DAY    = 1000 * 60 * 60 * 24;

// ─── STATE ───────────────────────────────────────────────
let members        = [];
let filteredList   = [];
let currentFilter  = 'all';
let searchQuery    = '';
let pendingDeleteId = null;
let timeOffset     = 0; // Offset between local time and server time

// ─── DOM REFS ─────────────────────────────────────────────
// ─── DOM REFS ─────────────────────────────────────────────
const form         = document.getElementById('memberForm');
const nameInput    = document.getElementById('memberName');
const phoneInput   = document.getElementById('memberPhone');
const dateInput    = document.getElementById('paymentDate');
const durationSelect = document.getElementById('subDuration');
const membersBody  = document.getElementById('membersBody');
const emptyState   = document.getElementById('emptyState');
const searchInput  = document.getElementById('searchInput');
const filterBtns   = document.querySelectorAll('.filter-btn');
const activeCount  = document.getElementById('activeCount');
const expiredCount = document.getElementById('expiredCount');
const totalCount   = document.getElementById('totalCount');
const modalOverlay = document.getElementById('modalOverlay');
const confirmBtn   = document.getElementById('confirmDelete');
const cancelBtn    = document.getElementById('cancelDelete');
const exportBtn    = document.getElementById('exportExcel');
const backupBtn    = document.getElementById('backupBtn');
const restoreFile  = document.getElementById('restoreFile');
const toast        = document.getElementById('toast');



// ─── INIT ─────────────────────────────────────────────────
(function init() {
  startApp();
})();

async function startApp() {
  const displayGymName = gymID.replace('_', ' ').toUpperCase();
  document.title = displayGymName + " - GymPro";
  
  const displayEl = document.getElementById('gymNameDisplay');
  if (displayEl) displayEl.innerText = displayGymName;

  initGymName();
  await syncTime();
  setDefaultDate();
  loadFromStorage();
  renderAll();

  form.addEventListener('submit', handleAddMember);
  searchInput.addEventListener('input', handleSearch);
  filterBtns.forEach(btn => btn.addEventListener('click', handleFilter));
  confirmBtn.addEventListener('click', confirmDeleteMember);
  cancelBtn.addEventListener('click',  closeModal);
  exportBtn.addEventListener('click',  exportToExcel);
  backupBtn.addEventListener('click',   backupData);
  restoreFile.addEventListener('change', restoreData);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

  // Mobile Nav Logic
  const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
  bottomNavItems.forEach(item => {
    item.addEventListener('click', () => {
      bottomNavItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const view = item.dataset.view;
      if (view === 'dashboard') window.scrollTo({ top: 0, behavior: 'smooth' });
      if (view === 'add') document.querySelector('.add-card').scrollIntoView({ behavior: 'smooth' });
      if (view === 'members') document.querySelector('.table-card').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ... (initLogin, hashStr, syncTime, getCurrentTime, setDefaultDate remain similar but I'll update logic)

// ─── GYM NAME LOGIC ────────────────────────────────────────

// عند بداية تشغيل البرنامج
function initGymName() {
    const gymNameKey = `gym_name_${gymID}`;
    let gymName = localStorage.getItem(gymNameKey);
    if (!gymName) {
        gymName = prompt("أدخل اسم القاعة الرياضية الخاص بك:", "قاعة رياضية");
        localStorage.setItem(gymNameKey, gymName || "قاعة رياضية");
    }
    // عرض الاسم في الواجهة
    const titleEl = document.getElementById('gymTitle');
    if (titleEl) {
        titleEl.innerText = gymName || "قاعة رياضية";
    }
}

// ─── LOGIC ───────────────────────────────────────────────

/** Calculate expiry date based on duration (months) */
function calculateExpiry(paymentTs, months) {
  const date = new Date(paymentTs);
  date.setMonth(date.getMonth() + parseInt(months));
  return date.getTime();
}

/** Is the subscription still active? */
function isActive(expiryTs) {
  return getCurrentTime() < expiryTs;
}

/** Remaining days */
function daysRemaining(expiryTs) {
  const diff = expiryTs - getCurrentTime();
  return Math.ceil(diff / MS_PER_DAY);
}

/** Format a timestamp to a readable Arabic-friendly date with Latin numerals */
function formatDate(ts) {
  // Using 'ar-EG-u-nu-latn' ensures Arabic labels with Western (Latin) digits
  return new Date(ts).toLocaleDateString('ar-EG-u-nu-latn', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

function uid() {
  return getCurrentTime().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── STORAGE ──────────────────────────────────────────────

function loadFromStorage() {
  try {
    members = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    // Migration: ensure old members have duration/expiry
    members.forEach(m => {
      if (!m.duration) m.duration = 1;
      if (!m.expiryTimestamp) m.expiryTimestamp = calculateExpiry(m.paymentTimestamp, m.duration);
    });
  } catch {
    members = [];
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

// ─── ACTIONS ──────────────────────────────────────────────

function handleAddMember(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const name             = nameInput.value.trim();
  const phone            = phoneInput.value.trim();
  const duration         = parseInt(durationSelect.value);
  const paymentTimestamp = new Date(dateInput.value).getTime();
  const expiryTimestamp  = calculateExpiry(paymentTimestamp, duration);

  const member = {
    id:              uid(),
    name,
    phone,
    paymentTimestamp,
    expiryTimestamp,
    duration,
    createdAt:       getCurrentTime()
  };

  members.unshift(member);
  saveToStorage();
  renderAll();
  form.reset();
  setDefaultDate();

  showToast(`✅ Membre "${name}" ajouté`, 'success');
}

function validateForm() {
  let valid = true;
  [nameInput, phoneInput, dateInput].forEach(inp => {
    const group = inp.closest('.form-group');
    if (!inp.value.trim()) {
      group.classList.add('has-error');
      valid = false;
    } else {
      group.classList.remove('has-error');
    }
  });
  return valid;
}

// ─── RENDER ───────────────────────────────────────────────

function renderAll() {
  applyFilters();
  updateStats();
  renderTable();
}

function updateStats() {
  const active  = members.filter(m =>  isActive(m.expiryTimestamp)).length;
  const expired = members.filter(m => !isActive(m.expiryTimestamp)).length;

  activeCount.textContent  = active;
  expiredCount.textContent = expired;
  totalCount.textContent   = members.length;
}

function renderTable() {
  membersBody.innerHTML = '';

  if (filteredList.length === 0) {
    emptyState.classList.add('show');
    return;
  }
  emptyState.classList.remove('show');

  filteredList.forEach((member, index) => {
    const remaining = daysRemaining(member.expiryTimestamp);
    
    // Status Logic
    let statusClass = 'active';
    if (remaining <= 0) {
      statusClass = 'expired';
    } else if (remaining <= 3) {
      statusClass = 'warning';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="#">
        <div class="row-num">${index + 1}</div>
      </td>
      <td data-label="Membre">
        <div class="member-info">
          <span class="member-name ${statusClass}">${escapeHtml(member.name)}</span>
          <span class="sub-type">${member.duration} Mois</span>
        </div>
      </td>
      <td data-label="Contact">
        <span class="phone-num" dir="ltr">${member.phone ? escapeHtml(member.phone) : '—'}</span>
      </td>
      <td data-label="Expiration">${formatDate(member.expiryTimestamp)}</td>
      <td data-label="Statut">
        <span class="days-pill ${statusClass}">
          ${remaining > 0 
            ? `⏳ ${remaining} Jours restants` 
            : `⚠️ Expiré il y a ${Math.abs(remaining)}j`}
        </span>
      </td>
      <td data-label="Actions">
        <div class="actions-cell">
          <button class="btn-icon-only btn-whatsapp" title="Envoyer Rappel WhatsApp" data-id="${member.id}">💬</button>
          <button class="btn-icon-only btn-renew" title="Renouveler" data-id="${member.id}">🔄</button>
          <button class="btn-icon-only btn-delete" title="Supprimer" data-id="${member.id}">🗑️</button>
        </div>
      </td>
    `;

    membersBody.appendChild(tr);
  });

  membersBody.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.id)));
  membersBody.querySelectorAll('.btn-renew').forEach(btn => btn.addEventListener('click', () => handleRenew(btn.dataset.id)));
  membersBody.querySelectorAll('.btn-whatsapp').forEach(btn => btn.addEventListener('click', () => sendWhatsApp(btn.dataset.id)));
}

/** WhatsApp Notification Logic */
function sendWhatsApp(id) {
  const member = members.find(m => m.id === id);
  if (!member || !member.phone) {
    showToast("⚠️ رقم الهاتف غير متوفر", "error");
    return;
  }

  const remaining = daysRemaining(member.expiryTimestamp);
  const gymName = localStorage.getItem(`gym_name_${gymID}`) || "القاعة الرياضية";
  let message = "";
  
  if (remaining <= 0) {
    message = `مرحباً ${member.name}! 💪\nنود تذكيرك أن اشتراكك في ${gymName} قد انتهى منذ ${Math.abs(remaining)} أيام. نتمنى أنك تستمتع بتدريباتك معنا، وبانتظار رؤيتك لتجديد نشاطك ومواصلة رحلتك نحو أفضل نسخة من نفسك!\nالقاعة ترحب بك دائماً.`;
  } else {
    message = `مرحباً ${member.name}! 💪\nنود تذكيرك أن اشتراكك في ${gymName} سينتهي خلال ${remaining} أيام. نتمنى أنك تستمتع بتدريباتك معنا، وبانتظار رؤيتك لتجديد نشاطك ومواصلة رحلتك نحو أفضل نسخة من نفسك!\nالقاعة ترحب بك دائماً.`;
  }

  // Clean phone number (remove spaces, etc. and ensure it has a country code if needed, but for now we'll use it as is)
  const cleanPhone = member.phone.replace(/\D/g, '');
  const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
}

function handleRenew(id) {
  const member = members.find(m => m.id === id);
  if (!member) return;

  const now = getCurrentTime();
  member.paymentTimestamp = now;
  member.expiryTimestamp  = calculateExpiry(now, member.duration);
  
  saveToStorage();
  renderAll();
  showToast(`🔄 Abonnement de "${member.name}" renouvelé`, 'success');
}

/** EXPORT TO EXCEL */
function exportToExcel() {
  const data = members.map(m => ({
    "Nom": m.name,
    "Téléphone": m.phone,
    "Début": new Date(m.paymentTimestamp).toLocaleDateString(),
    "Fin": new Date(m.expiryTimestamp).toLocaleDateString(),
    "Durée (Mois)": m.duration,
    "Statut": isActive(m.expiryTimestamp) ? "Actif" : "Expiré"
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Membres");
  XLSX.writeFile(workbook, `GymPro_Membres_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast("📊 Fichier Excel généré", "success");
}

// ─── BACKUP & RESTORE ─────────────────────────────────────

/** BACKUP — Download all data as a .json file */
function backupData() {
  if (members.length === 0) {
    showToast("⚠️ لا توجد بيانات لتصديرها", "error");
    return;
  }

  const backup = {
    version: "gymPro_v1",
    exportedAt: new Date().toISOString(),
    totalMembers: members.length,
    data: members
  };

  const json     = JSON.stringify(backup, null, 2);
  const blob     = new Blob([json], { type: "application/json" });
  const url      = URL.createObjectURL(blob);
  const filename = `GymPro_Backup_${new Date().toISOString().slice(0, 10)}.json`;

  const a  = document.createElement("a");
  a.href   = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  showToast(`💾 تم تحميل النسخة الاحتياطية (${members.length} مشترك)`, "success");
}

/** RESTORE — Import data from a .json backup file */
function restoreData(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Reset input so the same file can be re-selected if needed
  e.target.value = "";

  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const parsed = JSON.parse(event.target.result);

      // Validate structure
      if (!parsed.data || !Array.isArray(parsed.data)) {
        showToast("❌ ملف غير صالح — تأكد من اختيار ملف GymPro", "error");
        return;
      }

      const imported = parsed.data;

      // Check each member has required fields
      const valid = imported.every(m => m.id && m.name && m.paymentTimestamp);
      if (!valid) {
        showToast("❌ البيانات تالفة أو بصيغة غير صحيحة", "error");
        return;
      }

      // Merge: add only members whose ID doesn't already exist
      let addedCount = 0;
      imported.forEach(m => {
        if (!members.find(existing => existing.id === m.id)) {
          // Ensure migration fields exist
          if (!m.duration) m.duration = 1;
          if (!m.expiryTimestamp) m.expiryTimestamp = calculateExpiry(m.paymentTimestamp, m.duration);
          members.unshift(m);
          addedCount++;
        }
      });

      saveToStorage();
      renderAll();

      if (addedCount > 0) {
        showToast(`✅ تمت الاستعادة — ${addedCount} مشترك جديد أُضيف`, "success");
      } else {
        showToast("ℹ️ جميع المشتركين موجودون مسبقاً — لا جديد", "");
      }

    } catch (err) {
      showToast("❌ حدث خطأ أثناء قراءة الملف", "error");
    }
  };
  reader.readAsText(file);
}


function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  filteredList = members.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(query) || (m.phone && m.phone.includes(query));
    const matchFilter =
      currentFilter === 'all'     ? true :
      currentFilter === 'active'  ? isActive(m.expiryTimestamp) :
                                    !isActive(m.expiryTimestamp);
    return matchSearch && matchFilter;
  });
}

function handleSearch() { applyFilters(); renderTable(); }
function handleFilter(e) {
  currentFilter = e.currentTarget.dataset.filter;
  filterBtns.forEach(b => b.classList.toggle('active', b === e.currentTarget));
  applyFilters();
  renderTable();
}

function openModal(id) { pendingDeleteId = id; modalOverlay.classList.add('show'); }
function closeModal() { modalOverlay.classList.remove('show'); pendingDeleteId = null; }
function confirmDeleteMember() {
  if (!pendingDeleteId) return;
  members = members.filter(m => m.id !== pendingDeleteId);
  saveToStorage();
  closeModal();
  renderAll();
  showToast("🗑️ Membre supprimé", "error");
}

let toastTimer;
function showToast(message, type = '') {
  clearTimeout(toastTimer);
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}



async function syncTime() {
  try {
    const start = Date.now();
    const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
    const data = await res.json();
    const serverTime = new Date(data.utc_datetime).getTime();
    timeOffset = serverTime - Date.now() + ((Date.now() - start) / 2);
  } catch (err) { console.warn('Sync failed'); }
}

function getCurrentTime() { return Date.now() + timeOffset; }
function setDefaultDate() {
  const today = new Date(getCurrentTime());
  dateInput.value = today.toISOString().split('T')[0];
}
