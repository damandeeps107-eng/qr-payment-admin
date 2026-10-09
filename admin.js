const MASTER_INDEX_ID = "ff808181a09d98f701a11ecd111827bb";
const CLOUD_API_BASE = "https://api.restful-api.dev/objects";

let adminPin = sessionStorage.getItem('admin_pin') || '';
let allRequests = [];
let masterQrUrl = localStorage.getItem('admin_master_qr_url') || '';
let targetRequestCloudId = null;
let autoRefreshTimer = null;
let merchantSettings = {
  payeeName: 'Inspire Technologies',
  upiId: 'payment.express@upi',
  adminPin: '1234'
};

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const loginForm = document.getElementById('admin-login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const sendQrForm = document.getElementById('send-qr-form');
  if (sendQrForm) sendQrForm.addEventListener('submit', handleSendSpecificQr);

  if (adminPin) {
    verifyAndInitAdmin();
  }
});

function handleLogin(e) {
  e.preventDefault();
  const inputPin = document.getElementById('adminPinInput').value.trim();

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

function verifyAndInitAdmin() {
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
  document.getElementById('admin-merchant-name').innerText = merchantSettings.payeeName;

  if (masterQrUrl) {
    showMasterQrPreview(masterQrUrl);
  }

  await fetchAdminRequests();

  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(fetchAdminRequests, 2000);
}

async function fetchAdminRequests() {
  try {
    const res = await fetch(`${CLOUD_API_BASE}/${MASTER_INDEX_ID}`);
    const masterObj = await res.json();
    const requestsList = (masterObj && masterObj.data && Array.isArray(masterObj.data.requests)) ? masterObj.data.requests : [];

    if (requestsList.length === 0) {
      allRequests = [];
      renderRequestsTable();
      return;
    }

    // Fetch details for all request IDs in parallel
    const requestPromises = requestsList.map(cloudId => 
      fetch(`${CLOUD_API_BASE}/${cloudId}`)
        .then(r => r.json())
        .then(obj => obj && obj.data ? { _cloudId: cloudId, ...obj.data } : null)
        .catch(() => null)
    );

    const results = await Promise.all(requestPromises);
    allRequests = results.filter(r => r !== null);
    allRequests.sort((a, b) => new Date(b.date) - new Date(a.date));

    renderRequestsTable();
  } catch (err) {
    console.error('Fetch requests error:', err);
  }
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
  localStorage.setItem('admin_master_qr_url', masterQrUrl);
  showMasterQrPreview(masterQrUrl);
  showToast('Master QR Image saved locally!', 'success');
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
          <button class="btn btn-primary btn-sm" onclick="openSendQrModal('${r._cloudId}', '${r.clientName}', ${r.amount})" title="Attach & Send Specific QR Image to Client">
            <i data-lucide="send" style="width:14px;"></i> Send QR
          </button>
          <a href="${waUrl}" target="_blank" class="btn btn-secondary btn-sm" style="color:#25D366; border-color:rgba(37,211,102,0.3);" title="WhatsApp Client">
            <i data-lucide="message-circle" style="width:14px;"></i>
          </a>
          ${r.status === 'Payment Submitted' ? `<button class="btn btn-success btn-sm" onclick="updateStatus('${r._cloudId}', 'Approved')" title="Approve Payment"><i data-lucide="check" style="width:14px;"></i></button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteRequest('${r._cloudId}')" title="Delete"><i data-lucide="trash-2" style="width:14px;"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function openSendQrModal(cloudId, clientName, amount) {
  targetRequestCloudId = cloudId;
  document.getElementById('modal-client-name').innerText = clientName;
  document.getElementById('modal-client-amount').innerText = `₹${amount}`;
  document.getElementById('sendQrModal').classList.add('show');
}

function closeSendQrModal() {
  document.getElementById('sendQrModal').classList.remove('show');
}

async function handleSendSpecificQr(e) {
  e.preventDefault();
  if (!targetRequestCloudId) return;

  const fileInput = document.getElementById('specificQrFileInput');
  if (!fileInput.files[0]) {
    showToast('Please select a QR image file to send, or click Send Master QR.', 'error');
    return;
  }

  const qrDataUrl = await fileToDataUrl(fileInput.files[0]);
  await dispatchQrToClient(targetRequestCloudId, qrDataUrl);
}

async function sendMasterQrToClient() {
  if (!targetRequestCloudId) return;
  if (!masterQrUrl) {
    showToast('Please upload a Master QR Image first!', 'error');
    return;
  }
  await dispatchQrToClient(targetRequestCloudId, masterQrUrl);
}

async function dispatchQrToClient(cloudId, qrUrl) {
  try {
    const res = await fetch(`${CLOUD_API_BASE}/${cloudId}`);
    const obj = await res.json();

    if (obj && obj.data) {
      const updatedData = { ...obj.data, assignedQrUrl: qrUrl, status: 'QR Sent' };
      await fetch(`${CLOUD_API_BASE}/${cloudId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: obj.name, data: updatedData })
      });

      closeSendQrModal();
      showToast('Payment QR Code sent to client! Client screen will now show QR.', 'success');
      await fetchAdminRequests();
    }
  } catch (err) {
    showToast('Network error while dispatching QR', 'error');
  }
}

async function updateStatus(cloudId, newStatus) {
  try {
    const res = await fetch(`${CLOUD_API_BASE}/${cloudId}`);
    const obj = await res.json();
    if (obj && obj.data) {
      const updatedData = { ...obj.data, status: newStatus };
      await fetch(`${CLOUD_API_BASE}/${cloudId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: obj.name, data: updatedData })
      });

      showToast(`Marked as ${newStatus}`, 'success');
      await fetchAdminRequests();
    }
  } catch (err) {
    showToast('Error updating status', 'error');
  }
}

async function deleteRequest(cloudId) {
  if (!confirm('Delete this request?')) return;
  try {
    await fetch(`${CLOUD_API_BASE}/${cloudId}`, { method: 'DELETE' });

    // Remove from master index
    const res = await fetch(`${CLOUD_API_BASE}/${MASTER_INDEX_ID}`);
    const masterObj = await res.json();
    let requestsList = (masterObj && masterObj.data && Array.isArray(masterObj.data.requests)) ? masterObj.data.requests : [];
    requestsList = requestsList.filter(id => id !== cloudId);

    await fetch(`${CLOUD_API_BASE}/${MASTER_INDEX_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'QR_DISPATCHER_MASTER_INDEX',
        data: { requests: requestsList }
      })
    });

    showToast('Request deleted', 'success');
    await fetchAdminRequests();
  } catch (err) {
    showToast('Error deleting', 'error');
  }
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
