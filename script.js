/* ============================================================
   LoadAlert Repair LIFF — FIXED VERSION
   แก้:
   - upload รูปผ่าน POST
   - complete ส่ง imageUrls แบบ array
   - Repairing timer นับจาก startRepairTime
   - normalize status ฝั่ง frontend
   - ไม่ให้ปุ่มค้างหลัง loading
   ============================================================ */

// ---------- Config ----------
const LIFF_ID = '2010082961-D0sA72v5';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwfMqjDFX04L_Yg8lc42rC2-ib6j6OTPUvEFeE0fHhB2wGpy7CbL9Pf2mgeWwTYSavXCg/exec';
const STATUS = {
    WAITING: 'Waiting',
    CHECKING: 'Checking',
    REPAIRING: 'Repairing',
    COMPLETED: 'Completed'
};

const STATUS_LABEL = {
    Waiting: 'รอรับงาน',
    Checking: 'ตรวจสอบ',
    Repairing: 'กำลังซ่อม',
    Completed: 'ซ่อมเสร็จ'
};

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// ---------- State ----------
let allJobs = [];
let currentJob = null;
let userProfile = null;
let currentFilter = 'all';
let timerInterval = null;
let autoRefreshInterval = null;
let selectedImages = [];

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
            liff.login();
            return;
        }

        userProfile = await liff.getProfile();
        renderAvatar(userProfile);
    } catch (e) {
        console.warn('LIFF init failed, using dev mode:', e.message);
        userProfile = {
            displayName: 'Dev User',
            pictureUrl: null,
            userId: 'DEV001'
        };
        renderAvatar(userProfile);
    }

    await fetchJobs();
    startAutoRefresh();
    showApp();
});

// ---------- App ----------
function showApp() {
    document.getElementById('loading-screen').style.opacity = '0';

    setTimeout(() => {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('app').classList.remove('hidden');
    }, 400);
}

function renderAvatar(profile) {
    const el = document.getElementById('user-avatar');

    if (profile.pictureUrl) {
        el.innerHTML = `<img src="${profile.pictureUrl}" alt="${escHtml(profile.displayName)}">`;
    } else {
        el.textContent = (profile.displayName || 'U').charAt(0).toUpperCase();
    }
}

function startAutoRefresh() {
    clearInterval(autoRefreshInterval);

    autoRefreshInterval = setInterval(() => {
        const listView = document.getElementById('view-list');
        if (listView && listView.classList.contains('active')) {
            fetchJobs(true);
        }
    }, 30000);
}

// ---------- API ----------
async function fetchJobs(silent = false) {
    if (!silent) setRefreshing(true);

    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getJobs&t=${Date.now()}`, {
            redirect: 'follow'
        });

        const data = await readJsonResponse_(res);

        if (!data.success) {
            throw new Error(data.error || data.message || 'โหลดข้อมูลไม่สำเร็จ');
        }

        const jobs = data.jobs || data.data || [];

        allJobs = jobs
            .map(normalizeJob)
            .filter(job => job.repairStatus !== STATUS.COMPLETED);

        renderJobList();

        if (currentJob) {
            const updated = allJobs.find(job => job.rowIndex === currentJob.rowIndex);
            if (updated) {
                currentJob = updated;
                renderDetail(currentJob);
            }
        }
    } catch (e) {
        console.error(e);
        if (!silent) showToast('⚠️ โหลดข้อมูลไม่ได้ — ' + e.message, 'error');
    } finally {
        setRefreshing(false);
    }
}

async function refreshJobs() {
    await fetchJobs();
    showToast('🔄 รีเฟรชแล้ว');
}

async function postAction(payload) {
    // ใช้ GET payload สำหรับ action เล็ก ๆ ลดปัญหา CORS preflight ของ Apps Script
    const encoded = encodeURIComponent(JSON.stringify(payload));

    const res = await fetch(`${APPS_SCRIPT_URL}?payload=${encoded}&t=${Date.now()}`, {
        redirect: 'follow'
    });

    return readJsonResponse_(res);
}

async function postLargeAction(payload) {
    // ส่งผ่าน POST โดยตรง ไม่ระบุ Content-Type เพื่อเลี่ยง CORS Preflight (OPTIONS)
    const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    return readJsonResponse_(res);
}

async function readJsonResponse_(res) {
    const text = await res.text();

    try {
        return JSON.parse(text);
    } catch (e) {
        const message = text
            ? text.slice(0, 300)
            : `HTTP ${res.status || 'error'} ${res.statusText || ''}`.trim();
        throw new Error(message || 'Invalid server response');
    }
}

function setRefreshing(on) {
    const btn = document.getElementById('btn-refresh');
    if (!btn) return;
    btn.classList.toggle('spinning', on);
}

// ---------- Normalize ----------
function normalizeJob(job) {
    return {
        ...job,
        repairStatus: normalizeStatus(job.repairStatus),
        rowIndex: Number(job.rowIndex),
        numberRepair: job.numberRepair || job.Number_Repair || '',
        machine: job.machine || job.Machine || '',
        spNo: job.spNo || job.SP_No || '',
        currentWeight: job.currentWeight || job.Current_Weight || '',
        timestamp: job.timestamp || job.Timestamp || '',
        acceptTime: job.acceptTime || '',
        startRepairTime: job.startRepairTime || '',
        closeTime: job.closeTime || '',
        technician: job.technician || job.Technician || '',
        systemLog: job.systemLog || job.System_Log || '',
        note: job.note || '',
        imageUrl: job.imageUrl || ''
    };
}

function normalizeStatus(status) {
    const s = String(status || '').trim().toLowerCase();

    if (['waiting', 'wait', 'pending', 'รอรับงาน'].includes(s)) return STATUS.WAITING;
    if (['checking', 'check', 'ตรวจสอบ', 'กำลังตรวจสอบ'].includes(s)) return STATUS.CHECKING;
    if (['repairing', 'repairring', 'repair', 'ซ่อม', 'กำลังซ่อม'].includes(s)) return STATUS.REPAIRING;
    if (['completed', 'complete', 'done', 'closed', 'close', 'ปิดงาน', 'เสร็จแล้ว'].includes(s)) return STATUS.COMPLETED;

    return STATUS.WAITING;
}

// ---------- Parse System Log ----------
function parseLog(logStr) {
    const result = {};
    if (!logStr) return result;

    String(logStr).split('|').forEach(part => {
        const pair = part.split('=');
        const key = pair[0] ? pair[0].trim() : '';
        const value = pair.slice(1).join('=').trim();
        if (key && value !== undefined) result[key] = value;
    });

    return result;
}

// ---------- Filter ----------
function setFilter(filter) {
    currentFilter = filter;

    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });

    renderJobList();
}

// ---------- Render List ----------
function renderJobList() {
    const waiting = allJobs.filter(job => job.repairStatus === STATUS.WAITING).length;
    const checking = allJobs.filter(job => job.repairStatus === STATUS.CHECKING).length;
    const repairing = allJobs.filter(job => job.repairStatus === STATUS.REPAIRING).length;

    document.getElementById('count-waiting').textContent = waiting;
    document.getElementById('count-checking').textContent = checking;
    document.getElementById('count-repairing').textContent = repairing;

    const filtered = currentFilter === 'all'
        ? [...allJobs]
        : allJobs.filter(job => job.repairStatus === currentFilter);

    const list = document.getElementById('job-list');

    if (!filtered.length) {
        list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p>ไม่มีงานค้างรอ</p>
        <span>ทุกงานในหมวดนี้เสร็จสิ้นแล้ว</span>
      </div>`;
        return;
    }

    const order = {
        Repairing: 0,
        Checking: 1,
        Waiting: 2
    };

    filtered.sort((a, b) => {
        return (order[a.repairStatus] ?? 9) - (order[b.repairStatus] ?? 9);
    });

    list.innerHTML = filtered.map((job, index) => buildJobCard(job, index)).join('');
}

function buildJobCard(job, delay = 0) {
    const log = parseLog(job.systemLog);
    const product = log.Product || '—';
    const errType = log.Error_Type || log.Final_Error_Type || '—';
    const bagNo = log.Bag_No || log.Latest_Bag_No || '—';
    const consec = log.Consecutive_Count || log.Latest_Consecutive || '—';
    const priority = (errType === 'Over' || errType === 'Under') ? 'high' : 'medium';
    const priorityLabel = priority === 'high' ? 'ด่วน' : 'เฝ้าระวัง';
    const statusLabel = STATUS_LABEL[job.repairStatus] || job.repairStatus;

    return `
    <div class="job-card" data-status="${escHtml(job.repairStatus)}"
         style="animation-delay:${delay * 60}ms"
         onclick="openJobDetail(${Number(job.rowIndex)})">
      <div class="card-top">
        <div class="card-id">
          <h3>${escHtml(job.numberRepair)}</h3>
          <span class="priority-badge ${priority}">${priorityLabel}</span>
        </div>
        <span class="status-badge ${escHtml(job.repairStatus)}">${escHtml(statusLabel)}</span>
      </div>

      <div class="card-machine">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand);">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        ${escHtml(product)} | WO-${escHtml(job.machine)}-${escHtml(job.spNo)}
      </div>

      <div class="card-error">
        <div class="card-error-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--danger);">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          ${escHtml(errType)} – ${escHtml(job.spNo)}
        </div>
        <div class="card-error-desc">
          เครื่อง ${escHtml(job.machine)} ตรวจพบความผิดปกติที่ ${escHtml(job.spNo)}
          | น้ำหนักล่าสุด ${escHtml(String(job.currentWeight))} kg
          | กระสอบ ${escHtml(String(bagNo))}
        </div>
      </div>

      <div class="card-meta">
        <div class="card-meta-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
          เครื่อง: <strong>${escHtml(job.machine)}</strong>
        </div>
        <div class="card-meta-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
          Nozzle: <strong>${escHtml(job.spNo)}</strong>
        </div>
        <div class="card-meta-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          ต่อเนื่อง: <strong>${escHtml(String(consec))} ครั้ง</strong>
        </div>
        ${job.technician && job.technician.startsWith('ส่งต่อจาก')
            ? `<div class="card-meta-item" style="background: var(--waiting-bg); color: var(--waiting); border-color: var(--waiting-border);">
                 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                   <polyline points="23 4 23 10 17 10"></polyline>
                   <polyline points="1 20 1 14 7 14"></polyline>
                   <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                 </svg>
                 <strong>${escHtml(job.technician)}</strong>
               </div>`
            : job.technician
                ? `<div class="card-meta-item" style="background: var(--checking-bg); color: var(--checking); border-color: var(--checking-border);">
                     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                       <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                       <circle cx="12" cy="7" r="4"></circle>
                     </svg>
                     👷 กำลังทำ: <strong>${escHtml(job.technician)}</strong>
                   </div>`
                : ''}
      </div>
    </div>`;
}

// ---------- Detail ----------
function openJobDetail(rowIndex) {
    currentJob = allJobs.find(job => Number(job.rowIndex) === Number(rowIndex));

    if (!currentJob) {
        showToast('⚠️ ไม่พบงานนี้ อาจถูกปิดไปแล้ว', 'error');
        return;
    }

    clearTimer();
    renderDetail(currentJob);
    switchView('detail');
    updateHeaderForDetail(currentJob);
}

function renderDetail(job) {
    const log = parseLog(job.systemLog);
    const product = log.Product || '—';
    const errType = log.Error_Type || log.Final_Error_Type || '—';
    const bagNo = log.Bag_No || log.Latest_Bag_No || '—';
    const consec = log.Consecutive_Count || log.Latest_Consecutive || '—';
    const priority = (errType === 'Over' || errType === 'Under') ? 'high' : 'medium';
    const priorityLabel = priority === 'high' ? 'ด่วน' : 'เฝ้าระวัง';

    const content = document.getElementById('job-detail-content');

    content.innerHTML = `
    <div class="detail-hero">
      <div class="detail-hero-top">
        <div class="detail-case-id">
          <h2>${escHtml(job.numberRepair)}</h2>
          <span class="priority-badge ${priority}">${priorityLabel}</span>
        </div>
        <span class="status-badge ${escHtml(job.repairStatus)}">
          ${escHtml(STATUS_LABEL[job.repairStatus] || job.repairStatus)}
        </span>
      </div>

      <div class="detail-wo">${escHtml(product)} | WO-${escHtml(job.machine)}-${escHtml(job.spNo)}</div>

      <div class="detail-error-box">
        <div class="detail-error-type">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--danger); margin-right: 4px; display: inline-block; vertical-align: middle;">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          ${escHtml(errType)} – ${escHtml(job.spNo)}
        </div>
        <div class="detail-error-desc">
          เครื่อง ${escHtml(job.machine)} ตรวจพบความผิดปกติที่ ${escHtml(job.spNo)}
          | น้ำหนักล่าสุด ${escHtml(String(job.currentWeight))} kg
          | กระสอบ ${escHtml(String(bagNo))}
          | ต่อเนื่อง ${escHtml(String(consec))} ครั้ง
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-grid-item">
        <label>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
          </svg>
          Machine
        </label>
        <span>${escHtml(job.machine)}</span>
      </div>
      <div class="detail-grid-item">
        <label>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
          Nozzle
        </label>
        <span>${escHtml(job.spNo)}</span>
      </div>
      <div class="detail-grid-item">
        <label>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
          Product
        </label>
        <span>${escHtml(product)}</span>
      </div>
      <div class="detail-grid-item">
        <label>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="9" x2="15" y2="9"></line>
            <line x1="9" y1="13" x2="15" y2="13"></line>
          </svg>
          Bag
        </label>
        <span>${escHtml(String(bagNo))}</span>
      </div>
      <div class="detail-grid-item">
        <label>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          Weight ล่าสุด
        </label>
        <span>${escHtml(String(job.currentWeight))} kg</span>
      </div>
      <div class="detail-grid-item">
        <label>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: var(--danger);">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
          </svg>
          Error Type
        </label>
        <span class="error-type">${escHtml(errType)}</span>
      </div>
      <div class="detail-grid-item">
        <label>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Consecutive
        </label>
        <span>${escHtml(String(consec))} ครั้ง</span>
      </div>
      <div class="detail-grid-item">
        <label>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          แจ้งเตือน
        </label>
        <span>${formatTime(job.timestamp)}</span>
      </div>
    </div>

    <div class="timeline-card">
      <div class="timeline-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand);">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        ความคืบหน้างานซ่อม
      </div>
      ${buildTimeline(job.repairStatus)}
    </div>

    ${buildTimerSection(job)}

    <div class="info-card">
      <div class="info-row">
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); margin-right: 4px;">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          เวลาแจ้งเตือน
        </span>
        <span>${formatTime(job.timestamp)}</span>
      </div>
      <div class="info-row">
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); margin-right: 4px;">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          เวลารับงาน
        </span>
        <span>${formatTime(job.acceptTime)}</span>
      </div>
      <div class="info-row">
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); margin-right: 4px;">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
          </svg>
          เวลาเริ่มซ่อม
        </span>
        <span>${formatTime(job.startRepairTime)}</span>
      </div>
      <div class="info-row">
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); margin-right: 4px;">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          ช่างซ่อม
        </span>
        <span>${escHtml(job.technician || '—')}</span>
      </div>
    </div>

    ${job.note ? `
      <div class="info-card">
        <div class="info-row vertical">
          <label>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand); margin-right: 4px;">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            หมายเหตุเพิ่มเติม
          </label>
          <span>${escHtml(job.note)}</span>
        </div>
      </div>` : ''}

    ${job.imageUrl ? buildImageLinks(job.imageUrl) : ''}

    ${job.repairStatus === STATUS.COMPLETED ? buildCompletedBanner(job) : ''}
  `;

    if (job.repairStatus === STATUS.CHECKING || job.repairStatus === STATUS.REPAIRING) {
        startTimer(job);
    }

    renderDetailActions(job);
}

function buildTimeline(status) {
    const steps = [
        { key: STATUS.WAITING, icon: '🔔', label: 'แจ้งเตือน' },
        { key: STATUS.CHECKING, icon: '👁️', label: 'รับงาน' },
        { key: STATUS.REPAIRING, icon: '🔧', label: 'กำลังซ่อม' },
        { key: STATUS.COMPLETED, icon: '✅', label: 'ซ่อมเสร็จ' }
    ];

    const order = {
        Waiting: 0,
        Checking: 1,
        Repairing: 2,
        Completed: 3
    };

    const current = order[status] ?? 0;

    const html = steps.map((step, index) => {
        const cls = index < current ? 'done' : index === current ? 'active' : '';
        return `
      <div class="timeline-step ${cls}">
        <div class="step-dot">${step.icon}</div>
        <div class="step-label">${step.label}</div>
      </div>`;
    }).join('');

    return `<div class="timeline">${html}</div>`;
}

function buildTimerSection(job) {
    if (job.repairStatus === STATUS.WAITING || job.repairStatus === STATUS.COMPLETED) {
        return '';
    }

    const label = job.repairStatus === STATUS.CHECKING
        ? 'เวลาตั้งแต่รับงาน'
        : 'เวลาซ่อมจริง';

    return `
    <div class="timer-card">
      <div class="timer-label">⏱️ ${label}</div>
      <div class="timer-display" id="timer-display">00:00:00</div>
      <div class="timer-sub" id="timer-sub">กำลังนับเวลา...</div>
    </div>`;
}

function buildCompletedBanner(job) {
    return `
    <div class="completed-banner">
      <div class="big-check">🎉</div>
      <h3>ซ่อมเสร็จเรียบร้อย</h3>
      <p>ปิดงานเมื่อ ${formatTime(job.closeTime)}</p>
    </div>`;
}

function buildImageLinks(imageUrlText) {
    const urls = String(imageUrlText || '')
        .split(/\n|,\s*/)
        .map(url => url.trim())
        .filter(Boolean);

    if (!urls.length) return '';

    return `
    <div class="info-card">
      <div class="image-link-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand); margin-right: 4px; display: inline-block; vertical-align: middle;">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        รูปภาพถ่ายหน้างานซ่อม
      </div>
      <div class="image-link-list">
        ${urls.map((url, i) => `
          <a class="image-link" href="${escAttr(url)}" target="_blank" rel="noopener">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
            รูปภาพที่ ${i + 1}
          </a>
        `).join('')}
      </div>
    </div>`;
}

// ---------- Actions ----------
function renderDetailActions(job) {
    const el = document.getElementById('detail-actions');

    if (job.repairStatus === STATUS.WAITING) {
        el.innerHTML = `
      <button class="btn btn-ghost" onclick="goBack()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        กลับ
      </button>
      <a href="#" target="_blank" class="btn btn-ghost" style="text-decoration:none; text-align:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        เว็บ LoadAlert
      </a>
      <button class="btn btn-primary" id="btn-accept" onclick="openAcceptModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
        </svg>
        รับงานซ่อม
      </button>`;
        return;
    }

    if (job.repairStatus === STATUS.CHECKING) {
        el.innerHTML = `
      <button class="btn btn-ghost" onclick="goBack()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        กลับ
      </button>
      <button class="btn btn-warning" id="btn-forward-op" onclick="openForwardOperatorModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
        ส่งต่อ Operator
      </button>
      <button class="btn btn-primary" id="btn-start-repair" onclick="openRepairModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        ซ่อมเองได้
      </button>`;
        return;
    }

    if (job.repairStatus === STATUS.REPAIRING) {
        el.innerHTML = `
      <button class="btn btn-ghost" onclick="goBack()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        กลับ
      </button>
      <button class="btn btn-warning" id="btn-forward-shift" onclick="openForwardShiftModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        ส่งต่อกะ
      </button>
      <button class="btn btn-success" id="btn-complete" onclick="openCompleteModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        ปิดงาน
      </button>`;
        return;
    }

    el.innerHTML = `
    <button class="btn btn-ghost" style="flex:1" onclick="goBack()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
      กลับรายการ
    </button>`;
}

// ---------- Timer ----------
function startTimer(job) {
    clearTimer();

    const from = getTimerStartDate(job);

    function tick() {
        const display = document.getElementById('timer-display');

        if (!display) {
            clearTimer();
            return;
        }

        const diff = Math.max(0, Date.now() - from.getTime());
        display.textContent = formatDuration(diff);

        const mins = Math.floor(diff / 60000);
        const sub = document.getElementById('timer-sub');

        if (sub) {
            sub.textContent = `ผ่านไปแล้ว ${mins} นาที`;
        }
    }

    tick();
    timerInterval = setInterval(tick, 1000);
}

function getTimerStartDate(job) {
    if (job.repairStatus === STATUS.REPAIRING && job.startRepairTime) {
        return new Date(job.startRepairTime);
    }

    if (job.acceptTime) {
        return new Date(job.acceptTime);
    }

    if (job.timestamp) {
        return new Date(job.timestamp);
    }

    return new Date();
}

function clearTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ---------- Accept ----------
function openAcceptModal() {
    const now = new Date();

    document.getElementById('modal-tech-name').textContent =
        userProfile?.displayName || 'ไม่ทราบชื่อ';

    document.getElementById('modal-accept-time').textContent =
        now.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });

    document.getElementById('modal-accept-desc').textContent =
        `รับงานซ่อม ${currentJob?.numberRepair} เครื่อง ${currentJob?.machine}`;

    openModal('modal-accept');
}

async function confirmAccept() {
    setBtnLoading('btn-confirm-accept', true);

    const now = new Date();
    const techName = userProfile?.displayName || 'ไม่ทราบชื่อ';

    try {
        const res = await postAction({
            action: 'accept',
            rowIndex: currentJob.rowIndex,
            caseId: currentJob.numberRepair,
            techName,
            acceptTime: now.toISOString()
        });

        if (!res.success) throw new Error(res.error || res.message || 'รับงานไม่สำเร็จ');

        currentJob.repairStatus = STATUS.CHECKING;
        currentJob.technician = techName;
        currentJob.acceptTime = now.toISOString();

        closeModal('modal-accept');
        showToast('✅ รับงานเรียบร้อย', 'success');

        updateJobInList(currentJob);
        renderDetail(currentJob);
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        setBtnLoading('btn-confirm-accept', false);
    }
}

// ---------- Start Repair ----------
function openRepairModal() {
    document.getElementById('modal-repair-desc').textContent =
        `เริ่มซ่อม ${currentJob?.numberRepair} เครื่อง ${currentJob?.machine}`;

    openModal('modal-repair');
}

async function confirmStartRepair() {
    setBtnLoading('btn-confirm-repair', true);

    const now = new Date();
    const techName = userProfile?.displayName || 'ไม่ทราบชื่อ';

    try {
        const res = await postAction({
            action: 'startRepair',
            rowIndex: currentJob.rowIndex,
            caseId: currentJob.numberRepair,
            techName,
            startTime: now.toISOString()
        });

        if (!res.success) throw new Error(res.error || res.message || 'เริ่มซ่อมไม่สำเร็จ');

        currentJob.repairStatus = STATUS.REPAIRING;
        currentJob.startRepairTime = now.toISOString();

        closeModal('modal-repair');
        showToast('⚙️ เริ่มซ่อมแล้ว', 'success');

        updateJobInList(currentJob);
        renderDetail(currentJob);
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        setBtnLoading('btn-confirm-repair', false);
    }
}

// ---------- Complete ----------
function openCompleteModal() {
    const now = new Date();
    const from = currentJob.startRepairTime
        ? new Date(currentJob.startRepairTime)
        : currentJob.acceptTime
            ? new Date(currentJob.acceptTime)
            : new Date(currentJob.timestamp);

    const durMs = Math.max(0, now - from);

    document.getElementById('modal-complete-summary').innerHTML = `
    <div class="modal-summary-row"><label>งาน</label><strong>${escHtml(currentJob.numberRepair)}</strong></div>
    <div class="modal-summary-row"><label>เครื่อง</label><strong>${escHtml(currentJob.machine)} / ${escHtml(currentJob.spNo)}</strong></div>
    <div class="modal-summary-row"><label>เวลารับงาน</label><strong>${formatTime(currentJob.acceptTime)}</strong></div>
    <div class="modal-summary-row"><label>เวลาเริ่มซ่อม</label><strong>${formatTime(currentJob.startRepairTime)}</strong></div>
    <div class="modal-summary-row"><label>เวลาซ่อม ณ ตอนนี้</label><strong>${formatDuration(durMs)}</strong></div>
  `;

    document.getElementById('input-detail').value = '';
    document.getElementById('input-note').value = '';
    document.getElementById('input-images').value = '';

    selectedImages = [];
    renderImagePreviews();

    openModal('modal-complete');
}

async function confirmComplete() {
    const detail = document.getElementById('input-detail').value.trim();
    const note = document.getElementById('input-note').value.trim();

    if (!detail) {
        showToast('⚠️ กรุณากรอกรายละเอียดปัญหา', 'error');
        return;
    }

    setBtnLoading('btn-confirm-complete', true);

    const now = new Date();
    const techName = userProfile?.displayName || 'ไม่ทราบชื่อ';

    try {
        const imageUrls = await uploadImages_();

        const res = await postAction({
            action: 'complete',
            rowIndex: currentJob.rowIndex,
            caseId: currentJob.numberRepair,
            completeTime: now.toISOString(),
            techName,
            detail,
            note,
            imageUrls
        });

        if (!res.success) throw new Error(res.error || res.message || 'ปิดงานไม่สำเร็จ');

        currentJob.repairStatus = STATUS.COMPLETED;
        currentJob.closeTime = now.toISOString();
        currentJob.imageUrl = imageUrls.join('\n');

        allJobs = allJobs.filter(job => Number(job.rowIndex) !== Number(currentJob.rowIndex));

        closeModal('modal-complete');
        clearTimer();

        showToast(`🎉 ปิดงานเรียบร้อย! Downtime ${res.downtimeMin} นาที`, 'success');

        setTimeout(() => {
            renderJobList();
            goBack();
        }, 1200);
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        setBtnLoading('btn-confirm-complete', false);
    }
}

// ---------- Forward Shift ----------
function openForwardShiftModal() {
    document.getElementById('input-forward-reason').value = '';
    openModal('modal-forward-shift');
}

async function confirmForwardShift() {
    const reason = document.getElementById('input-forward-reason').value.trim();
    if (!reason) {
        showToast('⚠️ กรุณาระบุเหตุผลที่ส่งต่อ', 'error');
        return;
    }

    setBtnLoading('btn-confirm-forward-shift', true);

    const now = new Date();
    const techName = userProfile?.displayName || 'ไม่ทราบชื่อ';

    try {
        const res = await postAction({
            action: 'forwardShift',
            rowIndex: currentJob.rowIndex,
            caseId: currentJob.numberRepair,
            techName,
            reason,
            time: now.toISOString()
        });

        if (!res.success) throw new Error(res.error || res.message || 'ส่งต่องานไม่สำเร็จ');

        currentJob.repairStatus = STATUS.WAITING;
        currentJob.technician = 'ส่งต่อจาก: ' + techName;
        currentJob.acceptTime = '';
        currentJob.startRepairTime = '';

        closeModal('modal-forward-shift');
        clearTimer();
        showToast('🔄 ส่งต่องานให้กะถัดไปเรียบร้อย', 'success');

        setTimeout(() => {
            renderJobList();
            goBack();
        }, 1200);
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        setBtnLoading('btn-confirm-forward-shift', false);
    }
}

// ---------- Forward Operator ----------
function openForwardOperatorModal() {
    openModal('modal-forward-operator');
}

async function confirmForwardOperator() {
    // UI Only for now as requested
    setBtnLoading('btn-confirm-forward-operator', true);

    setTimeout(() => {
        setBtnLoading('btn-confirm-forward-operator', false);
        closeModal('modal-forward-operator');
        showToast('📞 ระบบส่งต่อ Operator กำลังพัฒนา (Backend pending)', 'success');
    }, 1000);
}

// ---------- Image Handling ----------
function handleImageSelect(event) {
    const files = Array.from(event.target.files || []);
    const remaining = MAX_IMAGES - selectedImages.length;

    if (remaining <= 0) {
        showToast(`⚠️ แนบได้สูงสุด ${MAX_IMAGES} รูป`, 'error');
        event.target.value = '';
        return;
    }

    files.slice(0, remaining).forEach(file => {
        if (!file.type.startsWith('image/')) {
            showToast(`⚠️ ${file.name} ไม่ใช่ไฟล์รูปภาพ`, 'error');
            return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
            showToast(`⚠️ ${file.name} ใหญ่เกิน 5MB`, 'error');
            return;
        }

        const reader = new FileReader();

        reader.onload = e => {
            selectedImages.push({
                file,
                dataUrl: e.target.result
            });
            renderImagePreviews();
        };

        reader.readAsDataURL(file);
    });

    event.target.value = '';
}

function renderImagePreviews() {
    const container = document.getElementById('img-previews');
    const placeholder = document.getElementById('img-placeholder');
    const count = document.getElementById('img-count');

    if (!container || !placeholder || !count) return;

    placeholder.style.display = selectedImages.length > 0 ? 'none' : 'flex';
    count.textContent = selectedImages.length > 0
        ? `(${selectedImages.length}/${MAX_IMAGES})`
        : '';

    container.innerHTML = selectedImages.map((img, index) => `
    <div class="img-preview-item">
      <img src="${img.dataUrl}" alt="รูป ${index + 1}">
      <button class="img-preview-remove" onclick="removeImage(${index})" type="button">×</button>
    </div>
  `).join('');

    if (selectedImages.length > 0 && selectedImages.length < MAX_IMAGES) {
        container.innerHTML += `
      <div class="img-preview-item img-add-more"
           onclick="document.getElementById('input-images').click()">
        +
      </div>`;
    }
}

function removeImage(index) {
    selectedImages.splice(index, 1);
    renderImagePreviews();
}

// -------- Chunked Image Upload — ส่งผ่าน GET แบ่งเป็น chunks --------
const CHUNK_SIZE = 1500; // keep URLs short for LINE WebView / mobile browsers
const UPLOAD_RETRY = 2;

async function uploadImages_() {
    if (selectedImages.length === 0) return [];

    showToast('📤 กำลังอัปโหลดรูปภาพ...');

    const results = [];

    for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        showToast(`📤 อัปโหลดรูป ${i + 1}/${selectedImages.length}...`);

        const compressed = await compressImage_(img.dataUrl, 800, 0.65);
        const base64 = compressed.split(',')[1];

        const safeName = img.file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[^\wก-๙-]+/g, '_');
        const filename = `${safeName}_${Date.now()}.jpg`;

        // สั่งอัปโหลดรวดเดียวผ่าน POST (postLargeAction)
        const res = await postLargeAction({
            action: 'uploadImage',
            base64: base64,
            filename: filename,
            mimeType: 'image/jpeg',
            caseId: currentJob.numberRepair
        });

        if (!res.success || !res.url) {
            throw new Error(res.error || res.message || 'อัปโหลดรูปล้มเหลว');
        }

        results.push(res.url);
    }

    return results;
}

async function uploadChunkWithRetry_(payload) {
    let lastError = null;

    for (let attempt = 0; attempt <= UPLOAD_RETRY; attempt++) {
        try {
            const res = await postAction(payload);
            if (res.success) return res;

            lastError = new Error(res.error || res.message || `upload chunk ${payload.chunkIndex} failed`);
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError;
}

async function finalizeUploadWithRetry_(payload, chunks) {
    let finalRes = await postAction(payload);

    for (let attempt = 0; attempt <= UPLOAD_RETRY && !finalRes.success && isMissingChunkError_(finalRes); attempt++) {
        const missingIndex = getMissingChunkIndex_(finalRes);

        if (missingIndex < 0 || missingIndex >= chunks.length) {
            return finalRes;
        }

        const retryRes = await uploadChunkWithRetry_({
            action: 'uploadChunk',
            sessionId: payload.sessionId,
            chunkIndex: missingIndex,
            totalChunks: payload.totalChunks,
            chunk: chunks[missingIndex],
            filename: payload.filename,
            caseId: payload.caseId
        });

        if (!retryRes.success) return retryRes;

        finalRes = await postAction(payload);
    }

    return finalRes;
}

function isMissingChunkError_(res) {
    const msg = String(res?.error || res?.message || '');
    return msg.includes('chunk') && (msg.includes('หาย') || msg.toLowerCase().includes('missing'));
}

function getMissingChunkIndex_(res) {
    const msg = String(res?.error || res?.message || '');
    const match = msg.match(/chunk\s+(\d+)/i);
    return match ? Number(match[1]) : -1;
}

function compressImage_(dataUrl, maxPx, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
            const canvas = document.createElement('canvas');

            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            resolve(canvas.toDataURL('image/jpeg', quality));
        };

        img.onerror = () => reject(new Error('อ่านรูปภาพไม่สำเร็จ'));
        img.src = dataUrl;
    });
}

// ---------- Navigation ----------
function switchView(name) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    document.getElementById(`view-${name}`).classList.add('active');
}

function goBack() {
    clearTimer();
    currentJob = null;

    switchView('list');

    document.getElementById('btn-back').classList.add('hidden');
    document.getElementById('header-title-text').textContent = 'รายการซ่อม';
    document.getElementById('header-subtitle').textContent = '';

    renderJobList();
}

function updateHeaderForDetail(job) {
    document.getElementById('btn-back').classList.remove('hidden');
    document.getElementById('header-title-text').textContent = job.numberRepair;
    document.getElementById('header-subtitle').textContent =
        `${job.machine} / ${job.spNo} — ${STATUS_LABEL[job.repairStatus] || job.repairStatus}`;
}

// ---------- Modal ----------
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            overlay.classList.add('hidden');
        }
    });
});

// ---------- Toast ----------
function showToast(msg, type = '') {
    const el = document.getElementById('toast');

    el.textContent = msg;
    el.className = `toast ${type}`;
    el.classList.remove('hidden');

    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
        el.classList.add('hidden');
    }, 3000);
}

// ---------- Utils ----------
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escAttr(str) {
    return escHtml(str).replace(/'/g, '&#39;');
}

function formatTime(isoStr) {
    if (!isoStr) return '—';

    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;

        return d.toLocaleString('th-TH', {
            dateStyle: 'short',
            timeStyle: 'medium'
        });
    } catch {
        return isoStr;
    }
}

function updateJobInList(job) {
    const idx = allJobs.findIndex(item => Number(item.rowIndex) === Number(job.rowIndex));

    if (idx !== -1) {
        allJobs[idx] = {
            ...allJobs[idx],
            ...job
        };
    }
}

function setBtnLoading(id, loading) {
    const btn = document.getElementById(id);
    if (!btn) return;

    if (!btn.dataset.origText) {
        btn.dataset.origText = btn.textContent;
    }

    btn.disabled = loading;
    btn.textContent = loading ? '⏳ กำลังดำเนินการ...' : btn.dataset.origText;
}
