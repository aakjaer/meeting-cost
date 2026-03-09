// Meeting Cost Tracker - Settings Script

const rolesList = document.getElementById('roles-list');
const attendeeList = document.getElementById('attendee-list');
const addRoleBtn = document.getElementById('add-role');
const addAttendeeBtn = document.getElementById('add-attendee');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');
const csvFileInput = document.getElementById('csv-file-input');
const importStatus = document.getElementById('import-status');

let roles = [];
let attendeeMap = {};

const SEED_ROLES = [
  { name: 'Engineering Lead',    rate: 850 },
  { name: 'Engineering Senior',  rate: 600 },
  { name: 'Engineering',         rate: 420 },
  { name: 'Product Lead',        rate: 850 },
  { name: 'Product Senior',      rate: 620 },
  { name: 'Product',             rate: 440 },
  { name: 'Data Lead',           rate: 820 },
  { name: 'Data Senior',         rate: 580 },
  { name: 'Data',                rate: 410 },
  { name: 'Sales/CS Lead',       rate: 780 },
  { name: 'Sales/CS Senior',     rate: 560 },
  { name: 'Sales/CS',            rate: 390 },
  { name: 'Marketing Lead',      rate: 750 },
  { name: 'Marketing Senior',    rate: 530 },
  { name: 'Marketing',           rate: 360 },
  { name: 'Ops/Finance Lead',    rate: 800 },
  { name: 'Ops/Finance Senior',  rate: 560 },
  { name: 'Ops/Finance',         rate: 380 },
  { name: 'Leadership',          rate: 980 },
  { name: 'Standard',            rate: 350 },
];

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

  chrome.storage.sync.set({ roles: cleanRoles }, () => {
    chrome.storage.local.set({ attendeeMap }, () => {
      saveStatus.classList.add('visible');
      setTimeout(() => saveStatus.classList.remove('visible'), 2500);
      renderAttendees(); // clean up temp keys
    });
  });
});

// ─── Load ────────────────────────────────────────────────────────────────────

chrome.storage.sync.get({ roles: [] }, syncData => {
  chrome.storage.local.get({ attendeeMap: {} }, localData => {
    roles = syncData.roles.length ? syncData.roles : SEED_ROLES;
    attendeeMap = localData.attendeeMap;
    renderRoles();
    renderAttendees();
  });
});

// ─── CSV Import ──────────────────────────────────────────────────────────────

// Maps role_id values (from the taxonomy CSV) to the display names used in storage.
const ROLE_ID_TO_NAME = {
  engineering_lead:    'Engineering Lead',
  engineering_senior:  'Engineering Senior',
  engineering_std:     'Engineering',
  product_lead:        'Product Lead',
  product_senior:      'Product Senior',
  product_std:         'Product',
  data_lead:           'Data Lead',
  data_senior:         'Data Senior',
  data_std:            'Data',
  sales_cs_lead:       'Sales/CS Lead',
  sales_cs_senior:     'Sales/CS Senior',
  sales_cs_std:        'Sales/CS',
  marketing_lead:      'Marketing Lead',
  marketing_senior:    'Marketing Senior',
  marketing_std:       'Marketing',
  ops_finance_lead:    'Ops/Finance Lead',
  ops_finance_senior:  'Ops/Finance Senior',
  ops_finance_std:     'Ops/Finance',
  leadership:          'Leadership',
  standard:            'Standard',
};

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const headers = splitCSVRow(lines[0]).map(h => h.trim().toLowerCase());
  const emailIdx  = headers.indexOf('email');
  const roleIdIdx = headers.indexOf('role_id');

  if (emailIdx === -1 || roleIdIdx === -1) {
    throw new Error('CSV must have "email" and "role_id" columns.');
  }

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i]);
    const email  = cols[emailIdx]?.trim().toLowerCase();
    const roleId = cols[roleIdIdx]?.trim();
    if (!email || !email.includes('@')) continue;
    results.push({ email, roleId });
  }
  return results;
}

function splitCSVRow(line) {
  // Handles quoted fields (e.g. "Jakob F. Filippson")
  const cols = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { cols.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

csvFileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const rows = parseCSV(ev.target.result);
      let imported = 0, skipped = 0;

      rows.forEach(({ email, roleId }) => {
        const roleName = ROLE_ID_TO_NAME[roleId];
        if (roleName) {
          attendeeMap[email] = roleName;
          imported++;
        } else {
          skipped++;
        }
      });

      chrome.storage.local.set({ attendeeMap }, () => {
        renderAttendees();
        importStatus.className = 'import-status';
        importStatus.textContent = `✓ Imported ${imported} employee${imported !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped — unknown role_id)` : ''}`;
      });
    } catch (err) {
      importStatus.className = 'import-status error';
      importStatus.textContent = `Error: ${err.message}`;
    }
    // Reset so the same file can be re-imported if needed
    csvFileInput.value = '';
  };
  reader.readAsText(file);
});

// ─── Utils ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
