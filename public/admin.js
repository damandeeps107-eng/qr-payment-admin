let adminPin = sessionStorage.getItem('admin_pin') || '';
let allRequests = [];
let masterQrUrl = '';
let targetRequestId = null;
let autoRefreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const loginForm = document.getElementById('admin-login-form');
  loginForm.addEventListener('submit', handleLogin);

  const sendQrForm = document.getElementById('send-qr-form');
  sendQrForm.addEventListener('submit', handleSendSpecificQr);

  if (adminPin) {
    verifyAndInitAdmin();
  }
});

async function handleLogin(e) {
  e.preventDefault();
  const inputPin = document.getElementById('adminPinInput').value.trim();

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: inputPin })
    });
    const data = await res.json();

    if (data.success) {
      adminPin = inputPin;
      sessionStorage.setItem('admin_pin', adminPin);
      document.getElementById('loginModal').classList.remove('show');
      showToast('Admin login successful!', 'success');
      loadAdminDashboard();
    } else {
      showToast(data.message || 'Invalid PIN', 'error');
    }
  } catch (err) {
    showToast('Server error during login.', 'error');
  }
}

async function verifyAndInitAdmin() {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: adminPin })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('loginModal').classList.remove('show');
      loadAdminDashboard();
    } else {
      sessionStorage.removeItem('admin_pin');
      adminPin = '';
    }
  } catch (err) {
    console.error(err);
  }
}

function logoutAdmin() {
  sessionStorage.removeItem('admin_pin');
  adminPin = '';
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  location.reload();
}

async function loadAdminDashboard() {
  document.getElementById('admin-dashboard').style.display = 'block';
  await fetchAdminRequests();

  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(fetchAdminRequests, 3000);
}

async function fetchAdminRequests() {
  try {
    const res = await fetch('/api/admin/requests', {
      headers: { 'x-admin-pin': adminPin }
    });
    const data = await res.json();

    if (data.success) {
      allRequests = data.requests;
      if (data.settings && data.settings.defaultQrImageUrl) {
        masterQrUrl = data.settings.defaultQrImageUrl;
        showMasterQrPreview(masterQrUrl);
      }
      renderRequestsTable();
    }
  } catch (err) {
    console.error('Fetch requests error:', err);
  }
}

function showMasterQrPreview(url) {
  const box = document.getElementById('master-qr-preview-box');
  const img = document.getElementById('master-qr-img-preview');
  img.src = url;
  box.style.display = 'flex';
}

async function uploadMasterQr() {
  const fileInput = document.getElementById('masterQrInput');
  if (!fileInput.files[0]) {
    showToast('Please select a QR image to upload', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('pin', adminPin);
  formData.append('qrImage', fileInput.files[0]);

  try {
    const res = await fetch('/api/admin/upload-default-qr', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      showToast('Master QR Image saved!', 'success');
      masterQrUrl = data.qrImageUrl;
      showMasterQrPreview(masterQrUrl);
      fileInput.value = '';
    } else {
      showToast(data.message || 'Upload failed', 'error');
    }
  } catch (err) {
    showToast('Server error during upload.', 'error');
  }
}

function renderRequestsTable() {
  const tbody = document.getElementById('requestsTableBody');
  tbody.innerHTML = '';

  if (allRequests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">No client QR requests yet.</td></tr>`;
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

    // Generate WhatsApp direct notify link with request recovery URL
    const clientPortalUrl = window.location.origin.replace('admin', 'client'); // Fallback or domain
    const waText = encodeURIComponent(
      `Hello ${r.clientName}, your Payment QR Code of ₹${r.amount} is ready! Open link to view & pay: ${clientPortalUrl}/?req=${r.id}`
    );
    const waUrl = `https://wa.me/91${r.clientPhone.replace(/\D/g, '')}?text=${waText}`;

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
          <button class="btn btn-primary btn-sm" onclick="openSendQrModal('${r.id}', '${r.clientName}', ${r.amount})" title="Attach & Send QR Image to Client">
            <i data-lucide="send" style="width:14px;"></i> Send QR
          </button>
          <a href="${waUrl}" target="_blank" class="btn btn-secondary btn-sm" style="color:#25D366; border-color:rgba(37,211,102,0.3);" title="Send Direct WhatsApp Link">
            <i data-lucide="message-circle" style="width:14px;"></i> WhatsApp
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
    showToast('Please select a QR image file to send, or use Master QR button.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('pin', adminPin);
  formData.append('qrImage', fileInput.files[0]);

  try {
    const res = await fetch(`/api/admin/attach-qr/${targetRequestId}`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      closeSendQrModal();
      fileInput.value = '';
      showToast('Payment QR Image sent to client!', 'success');
      await fetchAdminRequests();
    } else {
      showToast(data.message || 'Failed to send QR', 'error');
    }
  } catch (err) {
    showToast('Server error while sending QR image.', 'error');
  }
}

async function sendMasterQrToClient() {
  if (!targetRequestId) return;
  if (!masterQrUrl) {
    showToast('Please upload a Master QR Image first!', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/admin/attach-qr/${targetRequestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: adminPin, existingQrUrl: masterQrUrl })
    });
    const data = await res.json();

    if (data.success) {
      closeSendQrModal();
      showToast('Master QR Image sent to client!', 'success');
      await fetchAdminRequests();
    } else {
      showToast(data.message || 'Error sending QR', 'error');
    }
  } catch (err) {
    showToast('Server error', 'error');
  }
}

async function updateStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/admin/requests/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: adminPin, status: newStatus })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Marked as ${newStatus}`, 'success');
      await fetchAdminRequests();
    }
  } catch (err) {
    showToast('Error updating status', 'error');
  }
}

async function deleteRequest(id) {
  if (!confirm('Delete this request?')) return;
  try {
    const res = await fetch(`/api/admin/requests/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-pin': adminPin }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Request deleted', 'success');
      await fetchAdminRequests();
    }
  } catch (err) {
    showToast('Error deleting', 'error');
  }
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
