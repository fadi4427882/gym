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
const STORAGE_KEY   = 'gymPro_members_v1';
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
const form         = document.getElementById('memberForm');
const nameInput    = document.getElementById('memberName');
const phoneInput   = document.getElementById('memberPhone');
const dateInput    = document.getElementById('paymentDate');
const nameError    = document.getElementById('nameError');
const dateError    = document.getElementById('dateError');
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
const toast        = document.getElementById('toast');

// Login DOM
const loginOverlay = document.getElementById('loginOverlay');
const loginPassword= document.getElementById('loginPassword');
const loginBtn     = document.getElementById('loginBtn');
const loginError   = document.getElementById('loginError');

// ─── INIT ─────────────────────────────────────────────────
(function init() {
  initLogin();
})();

async function startApp() {
  await syncTime();
  setDefaultDate();
  loadFromStorage();
  renderAll();

  form.addEventListener('submit', handleAddMember);
  searchInput.addEventListener('input', handleSearch);
  filterBtns.forEach(btn => btn.addEventListener('click', handleFilter));
  confirmBtn.addEventListener('click', confirmDeleteMember);
  cancelBtn.addEventListener('click',  closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
}

// ─── LOGIN SYSTEM ─────────────────────────────────────────

async function hashStr(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initLogin() {
  // Default password hash for "devfadi"
  const defaultHash = '2351b8cb47494a8378a6ba5530ad53c4ee308ebb346fe35c785ec6f93392c107';
  if (!localStorage.getItem('gymPro_pass_v2')) {
    localStorage.setItem('gymPro_pass_v2', defaultHash);
  }
  
  const storedHash = localStorage.getItem('gymPro_pass_v2');
  const isAuth = sessionStorage.getItem('gymPro_auth') === 'true';
  
  if (isAuth) {
    loginOverlay.style.display = 'none';
    startApp();
  } else {
    loginBtn.addEventListener('click', async () => {
      const p = loginPassword.value;
      const h = await hashStr(p);
      if (h === storedHash) {
        sessionStorage.setItem('gymPro_auth', 'true');
        loginOverlay.style.display = 'none';
        startApp();
      } else {
        loginError.style.display = 'block';
      }
    });
  }
}

// ─── TIME SYNC (WORLD TIME API) ───────────────────────────

async function syncTime() {
  try {
    const start = Date.now();
    const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
    const data = await res.json();
    const serverTime = new Date(data.utc_datetime).getTime();
    timeOffset = serverTime - Date.now() + ((Date.now() - start) / 2);
  } catch (err) {
    console.warn('Time sync failed, falling back to local time');
  }
}

function getCurrentTime() {
  return Date.now() + timeOffset;
}

// ─── HELPERS & OBFUSCATED LOGIC ───────────────────────────

/** Set today as the default date value */
function setDefaultDate() {
  const today = new Date(getCurrentTime());
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;
}

// Data Obfuscation: Unreadable logic for 30 days check
const _0x1a2b=(_0x1,_0x2)=>((_0x1()-_0x2)/0x5265c00);
const _0x3f4c=(_0x1,_0x2)=>_0x1a2b(_0x1,_0x2)<0x1e;

/** Is the subscription still active? */
function isActive(paymentTimestamp) {
  // Obfuscated execution checks if elapsed days < 30 (0x1e)
  return _0x3f4c(getCurrentTime, paymentTimestamp);
}

/** Calculate days elapsed */
function daysElapsed(paymentTimestamp) {
  return Math.floor(_0x1a2b(getCurrentTime, paymentTimestamp));
}

/** Remaining days (negative = expired) */
function daysRemaining(paymentTimestamp) {
  return EXPIRY_DAYS - daysElapsed(paymentTimestamp);
}

/** Format a timestamp to a readable Arabic-friendly date */
function formatDate(ts) {
  return new Date(ts).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

/** Generate a simple unique ID */
function uid() {
  return getCurrentTime().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── STORAGE ──────────────────────────────────────────────

function loadFromStorage() {
  try {
    members = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    members = [];
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

// ─── FORM VALIDATION & ADD ────────────────────────────────

function handleAddMember(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const name             = nameInput.value.trim();
  const phone            = phoneInput.value.trim();
  const paymentTimestamp = new Date(dateInput.value).getTime();

  const member = {
    id:              uid(),
    name,
    phone,
    paymentTimestamp,
    createdAt:       getCurrentTime()
  };

  members.unshift(member);
  saveToStorage();
  renderAll();
  form.reset();
  setDefaultDate();

  showToast(`✅ تمت إضافة "${name}" بنجاح`, 'success');
}

function validateForm() {
  let valid = true;
  const nameGroup = nameInput.closest('.form-group');
  const phoneGroup = phoneInput.closest('.form-group');
  const dateGroup = dateInput.closest('.form-group');

  nameGroup.classList.remove('has-error');
  phoneGroup.classList.remove('has-error');
  dateGroup.classList.remove('has-error');

  if (!nameInput.value.trim()) {
    nameGroup.classList.add('has-error');
    valid = false;
  }
  if (!phoneInput.value.trim()) {
    phoneGroup.classList.add('has-error');
    valid = false;
  }
  if (!dateInput.value) {
    dateGroup.classList.add('has-error');
    valid = false;
  }
  return valid;
}

nameInput.addEventListener('input', () => nameInput.closest('.form-group').classList.remove('has-error'));
phoneInput.addEventListener('input', () => phoneInput.closest('.form-group').classList.remove('has-error'));
dateInput.addEventListener('input', () => dateInput.closest('.form-group').classList.remove('has-error'));

// ─── SEARCH & FILTER ──────────────────────────────────────

function handleSearch() {
  searchQuery = searchInput.value.trim().toLowerCase();
  applyFilters();
  renderTable();
}

function handleFilter(e) {
  currentFilter = e.currentTarget.dataset.filter;
  filterBtns.forEach(b => b.classList.toggle('active', b === e.currentTarget));
  applyFilters();
  renderTable();
}

function applyFilters() {
  filteredList = members.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(searchQuery) || (m.phone && m.phone.includes(searchQuery));
    const matchFilter =
      currentFilter === 'all'     ? true :
      currentFilter === 'active'  ? isActive(m.paymentTimestamp) :
                                    !isActive(m.paymentTimestamp);
    return matchSearch && matchFilter;
  });
}

// ─── RENDER ───────────────────────────────────────────────

function renderAll() {
  applyFilters();
  updateStats();
  renderTable();
}

function updateStats() {
  const active  = members.filter(m =>  isActive(m.paymentTimestamp)).length;
  const expired = members.filter(m => !isActive(m.paymentTimestamp)).length;

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
    const active    = isActive(member.paymentTimestamp);
    const remaining = daysRemaining(member.paymentTimestamp);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="#">
        <div class="row-num">${index + 1}</div>
      </td>
      <td data-label="اسم المشترك">
        <span class="member-name ${active ? 'active' : 'expired'}">
          ${escapeHtml(member.name)}
        </span>
      </td>
      <td data-label="رقم الهاتف">
        <span class="phone-num" dir="ltr">${member.phone ? escapeHtml(member.phone) : '<span style="color:var(--text-muted)">—</span>'}</span>
      </td>
      <td data-label="تاريخ الدفع">${formatDate(member.paymentTimestamp)}</td>
      <td data-label="الأيام المتبقية">
        <span class="days-pill ${active ? 'active' : 'expired'}">
          ${active
            ? `⏳ ${remaining} يوم متبقي`
            : `⚠️ انتهى منذ ${Math.abs(remaining)} يوم`
          }
        </span>
      </td>
      <td data-label="الحالة">
        <span class="status-badge ${active ? 'active' : 'expired'}">
          ${active ? 'نشط' : 'منتهي'}
        </span>
      </td>
      <td data-label="إجراءات">
        <div class="actions-cell">
          <button
            class="btn-icon-only btn-renew"
            title="تجديد الاشتراك"
            data-id="${member.id}"
            aria-label="تجديد ${escapeHtml(member.name)}"
          >🔄</button>
          <button
            class="btn-icon-only btn-delete"
            title="حذف المشترك"
            data-id="${member.id}"
            aria-label="حذف ${escapeHtml(member.name)}"
          >🗑️</button>
        </div>
      </td>
    `;

    tr.style.opacity = '0';
    tr.style.transform = 'translateY(12px)';
    membersBody.appendChild(tr);
    requestAnimationFrame(() => {
      tr.style.transition = `opacity 0.3s ease ${index * 40}ms, transform 0.3s ease ${index * 40}ms`;
      tr.style.opacity    = '1';
      tr.style.transform  = 'translateY(0)';
    });
  });

  // Attach delete events
  membersBody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.id));
  });

  // Attach renew events
  membersBody.querySelectorAll('.btn-renew').forEach(btn => {
    btn.addEventListener('click', () => handleRenew(btn.dataset.id));
  });
}

/** Handle Subscription Renewal */
function handleRenew(id) {
  const member = members.find(m => m.id === id);
  if (!member) return;

  // Update to current date (synced time)
  member.paymentTimestamp = getCurrentTime();
  
  saveToStorage();
  renderAll();
  
  showToast(`🔄 تم تجديد اشتراك "${member.name}" بنجاح`, 'success');
}

// ─── DELETE ───────────────────────────────────────────────

function openModal(id) {
  pendingDeleteId = id;
  modalOverlay.classList.add('show');
}

function closeModal() {
  modalOverlay.classList.remove('show');
  pendingDeleteId = null;
}

function confirmDeleteMember() {
  if (!pendingDeleteId) return;
  const member = members.find(m => m.id === pendingDeleteId);
  members = members.filter(m => m.id !== pendingDeleteId);
  saveToStorage();
  closeModal();
  renderAll();
  if (member) showToast(`🗑️ تم حذف "${member.name}"`, 'error');
}

// ─── TOAST ────────────────────────────────────────────────

let toastTimer;
function showToast(message, type = '') {
  clearTimeout(toastTimer);
  toast.textContent  = message;
  toast.className    = `toast ${type} show`;
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── SECURITY HELPER ──────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
