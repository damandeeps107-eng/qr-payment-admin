let adminPin = sessionStorage.getItem('admin_pin') || '';

let merchantSettings = JSON.parse(localStorage.getItem('qr_merchant_settings')) || {
  payeeName: 'Inspire Technologies',
  upiId: 'payment.express@upi',
  customQrUrl: '',
  adminPin: '1234'
};

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const loginForm = document.getElementById('admin-login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

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
  location.reload();
}

function loadAdminDashboard() {
  document.getElementById('admin-dashboard').style.display = 'block';
  document.getElementById('admin-merchant-name').innerText = merchantSettings.payeeName;

  if (merchantSettings.customQrUrl) {
    showMasterQrPreview(merchantSettings.customQrUrl);
  }
  renderRequestsTable();
}

function showMasterQrPreview(url) {
  const box = document.getElementById('master-qr-preview-box');
  const img = document.getElementById('master-qr-img-preview');
  if (img && box) {
    img.src = url;
    box.style.display = 'flex';
  }
}

function uploadMasterQr() {
  const fileInput = document.getElementById('masterQrInput');
  if (!fileInput.files[0]) {
    showToast('Please select a QR image file', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    merchantSettings.customQrUrl = e.target.result;
    localStorage.setItem('qr_merchant_settings', JSON.stringify(merchantSettings));
    showToast('Master QR Code Image saved successfully!', 'success');
    showMasterQrPreview(merchantSettings.customQrUrl);
    fileInput.value = '';
  };
  reader.readAsDataURL(fileInput.files[0]);
}

function renderRequestsTable() {
  const tbody = document.getElementById('requestsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const activeReq = JSON.parse(localStorage.getItem('active_qr_request'));

  if (!activeReq) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">No active client QR requests. Test on client page!</td></tr>`;
    return;
  }

  const tr = document.createElement('tr');
  const formattedDate = new Date(activeReq.date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  const waText = encodeURIComponent(
    `Hello ${activeReq.clientName}, your Payment QR Code of ₹${activeReq.amount} is ready! Thank you.`
  );
  const waUrl = `https://wa.me/91${activeReq.clientPhone.replace(/\D/g, '')}?text=${waText}`;

  tr.innerHTML = `
    <td>
      <div style="font-weight:700; color:#fff;">${activeReq.id}</div>
      <div style="font-size:0.75rem; color:var(--text-muted);">${formattedDate}</div>
    </td>
    <td>
      <div style="font-weight:600; color:#f8fafc;">${activeReq.clientName}</div>
      <div style="font-size:0.82rem; color:#38bdf8; font-weight:700;">📱 ${activeReq.clientPhone}</div>
    </td>
    <td style="font-weight:800; color:#10b981; font-size:1.05rem;">₹ ${activeReq.amount.toLocaleString('en-IN')}</td>
    <td style="font-size:0.85rem; color:#cbd5e1;">${activeReq.serviceNote || '-'}</td>
    <td><span class="badge badge-approved">📲 QR Generated</span></td>
    <td>-</td>
    <td>
      <div style="display:flex; gap:6px;">
        <a href="${waUrl}" target="_blank" class="btn btn-secondary btn-sm" style="color:#25D366; border-color:rgba(37,211,102,0.3);" title="Send WhatsApp Message">
          <i data-lucide="message-circle" style="width:14px;"></i> WhatsApp
        </a>
      </div>
    </td>
  `;
  tbody.appendChild(tr);
  lucide.createIcons();
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
