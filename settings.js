// Meeting Cost Tracker - Settings Script

const rolesList = document.getElementById('roles-list');
const attendeeList = document.getElementById('attendee-list');
const addRoleBtn = document.getElementById('add-role');
const addAttendeeBtn = document.getElementById('add-attendee');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

let roles = [];
let attendeeMap = {};

// ─── Render ──────────────────────────────────────────────────────────────────

function renderRoles() {
  rolesList.innerHTML = '';
  roles.forEach((role, i) => {
    const row = document.createElement('div');
    row.className = 'role-row';
    row.innerHTML = `
      <input type="text" placeholder="e.g. Developer" value="${escHtml(role.name)}" data-i="${i}" data-field="name">
      <input type="number" class="rate-input" placeholder="e.g. 650" value="${escHtml(String(role.rate))}" data-i="${i}" data-field="rate" min="0" step="50">
      <button class="btn-remove" data-i="${i}" title="Remove">×</button>
    `;
    row.querySelector('[data-field="name"]').addEventListener('input', e => {
      roles[i].name = e.target.value;
      renderAttendees(); // refresh role dropdowns
    });
    row.querySelector('[data-field="rate"]').addEventListener('input', e => {
      roles[i].rate = parseFloat(e.target.value) || 0;
    });
    row.querySelector('.btn-remove').addEventListener('click', () => {
      roles.splice(i, 1);
      renderRoles();
      renderAttendees();
    });
    rolesList.appendChild(row);
  });
}

function getRoleOptions(selectedRole) {
  return roles.map(r =>
    `<option value="${escHtml(r.name)}" ${r.name === selectedRole ? 'selected' : ''}>${escHtml(r.name)}</option>`
  ).join('');
}

function renderAttendees() {
  const entries = Object.entries(attendeeMap);
  attendeeList.innerHTML = '';
  entries.forEach(([email, role], i) => {
    const row = document.createElement('div');
    row.className = 'attendee-row';
    row.innerHTML = `
      <input type="email" placeholder="name@company.com" value="${escHtml(email)}" data-original="${escHtml(email)}">
      <select>${getRoleOptions(role)}</select>
      <button class="btn-remove" title="Remove">×</button>
    `;
    const emailInput = row.querySelector('input');
    const roleSelect = row.querySelector('select');

    emailInput.addEventListener('blur', e => {
      const oldEmail = e.target.getAttribute('data-original');
      const newEmail = e.target.value.trim().toLowerCase();
      if (oldEmail !== newEmail && oldEmail in attendeeMap) {
        delete attendeeMap[oldEmail];
      }
      if (newEmail) attendeeMap[newEmail] = roleSelect.value;
      e.target.setAttribute('data-original', newEmail);
    });

    roleSelect.addEventListener('change', e => {
      const currentEmail = emailInput.value.trim().toLowerCase();
      if (currentEmail) attendeeMap[currentEmail] = e.target.value;
    });

    row.querySelector('.btn-remove').addEventListener('click', () => {
      const emailVal = emailInput.value.trim().toLowerCase();
      delete attendeeMap[emailVal];
      renderAttendees();
    });

    attendeeList.appendChild(row);
  });
}

// ─── Add rows ────────────────────────────────────────────────────────────────

addRoleBtn.addEventListener('click', () => {
  roles.push({ name: '', rate: 0 });
  renderRoles();
  // Focus the new name input
  const inputs = rolesList.querySelectorAll('input[data-field="name"]');
  inputs[inputs.length - 1]?.focus();
});

addAttendeeBtn.addEventListener('click', () => {
  // Add a temp entry with empty email
  const tempKey = `__new_${Date.now()}`;
  attendeeMap[tempKey] = roles[0]?.name || '';
  renderAttendees();
  // Focus the new email input
  const inputs = attendeeList.querySelectorAll('input[type="email"]');
  const last = inputs[inputs.length - 1];
  if (last) {
    last.value = '';
    last.setAttribute('data-original', tempKey);
    last.focus();
  }
});

// ─── Save ────────────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', () => {
  // Clean up empty entries
  const cleanMap = {};
  Object.entries(attendeeMap).forEach(([email, role]) => {
    if (email && !email.startsWith('__new_') && email.includes('@')) {
      cleanMap[email] = role;
    }
  });
  attendeeMap = cleanMap;

  const cleanRoles = roles.filter(r => r.name.trim());

  chrome.storage.sync.set({ roles: cleanRoles, attendeeMap }, () => {
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2500);
    renderAttendees(); // clean up temp keys
  });
});

// ─── Load ────────────────────────────────────────────────────────────────────

chrome.storage.sync.get({ roles: [], attendeeMap: {} }, data => {
  roles = data.roles.length ? data.roles : [
    { name: 'Developer', rate: 650 },
    { name: 'Designer', rate: 600 },
    { name: 'Product Manager', rate: 700 },
    { name: 'Manager', rate: 750 },
  ];
  attendeeMap = data.attendeeMap;
  renderRoles();
  renderAttendees();
});

// ─── Utils ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
