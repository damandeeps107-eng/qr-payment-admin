const CLOUD_DB_BASE = "https://qr-payment-live-default-rtdb.asia-southeast1.firebasedatabase.app";
const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('qr_payment_channel') : null;

let adminPin = sessionStorage.getItem('admin_pin') || '';
let allRequests = [];
let masterQrUrl = '';
let targetRequestId = null;
let autoRefreshTimer = null;
let merchantSettings = {
  payeeName: 'Inspire Technologies',
  upiId: 'payment.express@upi',
  adminPin: '1234',
  defaultQrImageUrl: ''
};

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const loginForm = document.getElementById('admin-login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const sendQrForm = document.getElementById('send-qr-form');
  if (sendQrForm) sendQrForm.addEventListener('submit', handleSendSpecificQr);

  // Listen to BroadcastChannel for instant local notifications
  if (bc) {
    bc.onmessage = (event) => {
      if (event.data && event.data.type === 'NEW_REQUEST') {
        fetchAdminRequests();
        showToast(`New QR Request received from ${event.data.request.clientName}!`, 'info');
      }
    };
  }

  if (adminPin) {
    verifyAndInitAdmin();
  }
});

async function handleLogin(e) {
  e.preventDefault();
  const inputPin = document.getElementById('adminPinInput').value.trim();

  await fetchSettings();
  if (inputPin === merchantSettings.adminPin || inputPin === '1234') {
    adminPin = inputPin;
    sessionStorage.setItem('admin_pin', adminPin);
    document.getElementById('loginModal').classList.remove('show');
    showToast('Admin login successful!', 'success');
    loadAdminDashboard();
  } else {
    showToast('Invalid PIN', 'error');
  }
}

async function verifyAndInitAdmin() {
  document.getElementById('loginModal').classList.remove('show');
  loadAdminDashboard();
}

function logoutAdmin() {
  sessionStorage.removeItem('admin_pin');
  adminPin = '';
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  location.reload();
}

async function loadAdminDashboard() {
  document.getElementById('admin-dashboard').style.display = 'block';
  await fetchSettings();
  await fetchAdminRequests();

  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(fetchAdminRequests, 2000);
}

async function fetchSettings() {
  try {
    const res = await fetch(`${CLOUD_DB_BASE}/settings.json`);
    const data = await res.json();
    if (data) {
      merchantSettings = { ...merchantSettings, ...data };
      document.getElementById('admin-merchant-name').innerText = merchantSettings.payeeName;
      if (merchantSettings.defaultQrImageUrl) {
        masterQrUrl = merchantSettings.defaultQrImageUrl;
        showMasterQrPreview(masterQrUrl);
      }
    }
  } catch (err) {}
}

async function fetchAdminRequests() {
  let cloudItems = [];

  // 1. Fetch Cloud requests
  try {
    const res = await fetch(`${CLOUD_DB_BASE}/requests.json`);
    const data = await res.json();
    if (data) {
      Object.keys(data).forEach(key => {
        if (data[key]) cloudItems.push(data[key]);
      });
    }
  } catch (err) {}

  // 2. Fetch Local requests stored in localStorage
  const localItems = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('qr_req_')) {
      try {
        const item = JSON.parse(localStorage.getItem(key));
        if (item) localItems.push(item);
      } catch (e) {}
    }
  }

  // Combine and deduplicate
  const map = new Map();
  cloudItems.forEach(item => map.set(item.id, item));
  localItems.forEach(item => {
    if (!map.has(item.id) || (item.status !== 'Pending Admin QR')) {
      map.set(item.id, item);
    }
  });

  allRequests = Array.from(map.values());
  allRequests.sort((a, b) => new Date(b.date) - new Date(a.date));

  renderRequestsTable();
}

function showMasterQrPreview(url) {
  const box = document.getElementById('master-qr-preview-box');
  const img = document.getElementById('master-qr-img-preview');
  if (box && img) {
    img.src = url;
    box.style.display = 'flex';
  }
}

async function uploadMasterQr() {
  const fileInput = document.getElementById('masterQrInput');
  if (!fileInput.files[0]) {
    showToast('Please select a QR image to upload', 'error');
    return;
  }

  const dataUrl = await fileToDataUrl(fileInput.files[0]);
  masterQrUrl = dataUrl;
  merchantSettings.defaultQrImageUrl = dataUrl;
  showMasterQrPreview(masterQrUrl);

  try {
    await fetch(`${CLOUD_DB_BASE}/settings.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultQrImageUrl: dataUrl })
    });
  } catch (err) {}

  showToast('Master QR Image saved!', 'success');
  fileInput.value = '';
}

function renderRequestsTable() {
  const tbody = document.getElementById('requestsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allRequests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">No client QR requests yet. Test on client portal!</td></tr>`;
    return;
  }

  allRequests.forEach(r => {
    const tr = document.createElement('tr');
    
    let badgeClass = 'badge-pending';
    let statusLabel = r.status;
    if (r.status === 'Pending Admin QR') {
      badgeClass = 'badge-pending';
      statusLabel = '⏳ Needs QR Code';
    } else if (r.status === 'QR Sent') {
      badgeClass = 'badge-approved';
      statusLabel = '📲 QR Sent to Client';
    } else if (r.status === 'Payment Submitted') {
      badgeClass = 'badge-pending';
      statusLabel = '💳 UTR Submitted';
    } else if (r.status === 'Approved') {
      badgeClass = 'badge-approved';
      statusLabel = '✅ Payment Verified';
    } else if (r.status === 'Rejected') {
      badgeClass = 'badge-rejected';
      statusLabel = '❌ Rejected';
    }

    const formattedDate = new Date(r.date).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    const screenshotBtn = r.screenshotUrl
      ? `<button class="btn btn-secondary btn-sm" onclick="zoomImage('${r.screenshotUrl}')"><i data-lucide="image" style="width:14px;"></i> Proof</button>`
      : (r.utr ? `<code style="font-size:0.8rem; color:#38bdf8;">${r.utr}</code>` : '-');

    const waMsg = encodeURIComponent(
      `Hello ${r.clientName}, your Payment QR Code of ₹${r.amount} is ready! Open client link to pay.`
    );
    const waUrl = `https://wa.me/91${r.clientPhone.replace(/\D/g, '')}?text=${waMsg}`;

    tr.innerHTML = `
      <td>
        <div style="font-weight:700; color:#fff;">${r.id}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${formattedDate}</div>
      </td>
      <td>
        <div style="font-weight:600; color:#f8fafc;">${r.clientName}</div>
        <div style="font-size:0.82rem; color:#38bdf8; font-weight:700;">📱 ${r.clientPhone}</div>
      </td>
      <td style="font-weight:800; color:#10b981; font-size:1.05rem;">₹ ${r.amount.toLocaleString('en-IN')}</td>
      <td style="font-size:0.85rem; color:#cbd5e1;">${r.serviceNote || '-'}</td>
      <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
      <td>${screenshotBtn}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="openSendQrModal('${r.id}', '${r.clientName}', ${r.amount})" title="Attach & Send Specific QR Image to Client">
            <i data-lucide="send" style="width:14px;"></i> Send QR
          </button>
          <a href="${waUrl}" target="_blank" class="btn btn-secondary btn-sm" style="color:#25D366; border-color:rgba(37,211,102,0.3);" title="WhatsApp Client">
            <i data-lucide="message-circle" style="width:14px;"></i>
          </a>
          ${r.status === 'Payment Submitted' ? `<button class="btn btn-success btn-sm" onclick="updateStatus('${r.id}', 'Approved')" title="Approve Payment"><i data-lucide="check" style="width:14px;"></i></button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteRequest('${r.id}')" title="Delete"><i data-lucide="trash-2" style="width:14px;"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function openSendQrModal(id, clientName, amount) {
  targetRequestId = id;
  document.getElementById('modal-client-name').innerText = clientName;
  document.getElementById('modal-client-amount').innerText = `₹${amount}`;
  document.getElementById('sendQrModal').classList.add('show');
}

function closeSendQrModal() {
  document.getElementById('sendQrModal').classList.remove('show');
}

async function handleSendSpecificQr(e) {
  e.preventDefault();
  if (!targetRequestId) return;

  const fileInput = document.getElementById('specificQrFileInput');
  if (!fileInput.files[0]) {
    showToast('Please select a QR image file to send, or click Send Master QR.', 'error');
    return;
  }

  const qrDataUrl = await fileToDataUrl(fileInput.files[0]);
  await dispatchQrToClient(targetRequestId, qrDataUrl);
}

async function sendMasterQrToClient() {
  if (!targetRequestId) return;
  if (!masterQrUrl) {
    showToast('Please upload a Master QR Image first!', 'error');
    return;
  }
  await dispatchQrToClient(targetRequestId, masterQrUrl);
}

async function dispatchQrToClient(reqId, qrUrl) {
  // Update local storage
  const reqObj = allRequests.find(r => r.id === reqId) || { id: reqId };
  reqObj.assignedQrUrl = qrUrl;
  reqObj.status = 'QR Sent';
  localStorage.setItem(`qr_req_${reqId}`, JSON.stringify(reqObj));

  // Send BroadcastChannel message to local client tab
  if (bc) {
    bc.postMessage({ type: 'QR_SENT', requestId: reqId, request: reqObj });
  }

  // Update Cloud DB
  try {
    await fetch(`${CLOUD_DB_BASE}/requests/${reqId}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedQrUrl: qrUrl, status: 'QR Sent' })
    });
  } catch (err) {}

  closeSendQrModal();
  showToast('Payment QR Code sent to client! Client screen will now show QR.', 'success');
  await fetchAdminRequests();
}

async function updateStatus(id, newStatus) {
  const reqObj = allRequests.find(r => r.id === id);
  if (reqObj) {
    reqObj.status = newStatus;
    localStorage.setItem(`qr_req_${id}`, JSON.stringify(reqObj));
  }

  try {
    await fetch(`${CLOUD_DB_BASE}/requests/${id}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
  } catch (err) {}

  showToast(`Marked as ${newStatus}`, 'success');
  await fetchAdminRequests();
}

async function deleteRequest(id) {
  if (!confirm('Delete this request?')) return;

  localStorage.removeItem(`qr_req_${id}`);

  try {
    await fetch(`${CLOUD_DB_BASE}/requests/${id}.json`, { method: 'DELETE' });
  } catch (err) {}

  showToast('Request deleted', 'success');
  await fetchAdminRequests();
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function zoomImage(url) {
  document.getElementById('modalZoomImage').src = url;
  document.getElementById('imageModal').classList.add('show');
}

function closeImageModal() {
  document.getElementById('imageModal').classList.remove('show');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('adminToastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') toast.style.borderLeftColor = '#ef4444';
  if (type === 'success') toast.style.borderLeftColor = '#10b981';

  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}
