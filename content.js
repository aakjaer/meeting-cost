// Meeting Cost Tracker - Content Script

const WIDGET_CLASS = 'mct-widget';

// Material Icons "payments" — front bill (outlined ring) + coin circle + back bill
const MONEY_ICON = `<svg class="mct-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-2 0H3V6h14v8zm-7-1c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z"/>
</svg>`;
const pendingModals = new WeakSet(); // prevents concurrent injection on the same modal

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ roles: [] }, syncData => {
      chrome.storage.local.get({ attendeeMap: {} }, localData => {
        resolve({ roles: syncData.roles, attendeeMap: localData.attendeeMap });
      });
    });
  });
}

function parseDuration(modal) {
  // Look for "HH:MM – HH:MM" range within the modal text only
  const text = modal.innerText || modal.textContent || '';
  const match = text.match(/(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[–—\-]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i);
  if (!match) return null;

  const parseTime = str => {
    const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    let h = parseInt(m[1]), mins = parseInt(m[2]);
    if (m[3]) {
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
    }
    return h * 60 + mins;
  };

  const t1 = parseTime(match[1]), t2 = parseTime(match[2]);
  if (t1 !== null && t2 !== null && t2 > t1) return (t2 - t1) / 60;
  return null;
}

function extractAttendeeEmails(modal) {
  const emails = new Set();

  // Method 1: data-email attributes
  modal.querySelectorAll('[data-email]').forEach(el => {
    const email = el.getAttribute('data-email');
    if (email?.includes('@')) emails.add(email.toLowerCase());
  });

  // Method 2: hovercard / chip areas
  modal.querySelectorAll('[jsname="YPqjbf"], .nBzcnc, [data-hovercard-id]').forEach(el => {
    const hc = el.getAttribute('data-hovercard-id');
    if (hc?.includes('@')) emails.add(hc.toLowerCase());
    const text = el.textContent.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s]+$/.test(text)) emails.add(text.toLowerCase());
  });

  // Method 3: aria-label containing an email
  modal.querySelectorAll('[aria-label]').forEach(el => {
    const label = el.getAttribute('aria-label') || '';
    const m = label.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (m) emails.add(m[0].toLowerCase());
  });

  return Array.from(emails);
}

function matchAttendeesToRoles(emails, roles, attendeeMap) {
  const rateByRole = Object.fromEntries(roles.map(r => [r.name, parseFloat(r.rate) || 0]));
  const matched = [], unmatched = [];

  emails.forEach(email => {
    const roleName = attendeeMap[email];
    if (roleName && rateByRole[roleName] !== undefined) {
      matched.push({ email, role: roleName, rate: rateByRole[roleName] });
    } else {
      unmatched.push(email);
    }
  });

  return { matched, unmatched };
}

function buildCostWidget(matched, unmatched, durationHours) {
  const widget = document.createElement('div');
  widget.className = WIDGET_CLASS;

  if (matched.length === 0) {
    widget.innerHTML = `
      <div class="mct-icon-col">${MONEY_ICON}</div>
      <div class="mct-content-col">
        <div class="mct-main-text">No attendees matched to roles.</div>
        <div class="mct-sub-text"><a href="#" class="mct-settings-link">Configure roles in settings →</a></div>
      </div>
    `;
    widget.querySelector('.mct-settings-link')?.addEventListener('click', e => {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openSettings' });
    });
    return widget;
  }

  const totalCostPerHour = matched.reduce((sum, a) => sum + a.rate, 0);
  const totalCost = durationHours != null ? Math.round(totalCostPerHour * durationHours) : null;

  let mainHtml, subText;
  if (totalCost != null) {
    mainHtml = `Cost of this meeting: <strong>${totalCost.toLocaleString('da-DK')} kr.</strong>`;
    const durLabel = durationHours % 1 === 0
      ? `${durationHours}h`
      : `${Math.round(durationHours * 60)} min`;
    subText = `${matched.length} attendee${matched.length !== 1 ? 's' : ''} · ${durLabel} · ${totalCostPerHour.toLocaleString('da-DK')} kr/hr`;
  } else {
    mainHtml = `Meeting rate: <strong>${totalCostPerHour.toLocaleString('da-DK')} kr/hr</strong>`;
    subText = `${matched.length} matched${unmatched.length ? ` · ${unmatched.length} unmatched` : ''} · duration not detected`;
  }

  widget.innerHTML = `
    <div class="mct-icon-col">${MONEY_ICON}</div>
    <div class="mct-content-col">
      <div class="mct-main-text">${mainHtml}</div>
      <div class="mct-sub-text">${subText}</div>
    </div>
  `;
  return widget;
}

// ─── Injection ───────────────────────────────────────────────────────────────

async function expandAttendees(modal) {
  // Find the "N guests" text leaf
  const guestsEl = Array.from(modal.querySelectorAll('*')).find(el =>
    el.childElementCount === 0 && /^\d+\s+guests?$/i.test(el.textContent.trim())
  );
  if (!guestsEl) return;

  // Walk up from the "N guests" leaf until we find a container that has
  // [aria-expanded="false"] descendants (up to 12 levels, stopping before the modal).
  let searchRoot = guestsEl;
  let clicked = false;
  for (let i = 0; i < 12; i++) {
    if (!searchRoot.parentNode || searchRoot.parentNode === modal) break;
    searchRoot = searchRoot.parentNode;
    const collapsed = searchRoot.querySelectorAll('[aria-expanded="false"]');
    if (collapsed.length > 0) {
      collapsed.forEach(el => el.click());
      clicked = true;
      break;
    }
  }

  if (clicked) await new Promise(r => setTimeout(r, 800));
}

async function tryInjectCost(modal) {
  // Guard: skip if already injected or a concurrent run is in progress
  if (modal.querySelector(`.${WIDGET_CLASS}`)) return;
  if (pendingModals.has(modal)) return;
  pendingModals.add(modal);

  try {
    const { roles, attendeeMap } = await getSettings();

    // Wait for Google to finish initial render
    await new Promise(r => setTimeout(r, 700));

    // Re-check after delay
    if (modal.querySelector(`.${WIDGET_CLASS}`)) return;

    // Expand collapsed attendee sections before extracting emails
    await expandAttendees(modal);

  const emails = extractAttendeeEmails(modal);
  // If no emails found at all, don't inject — allows re-injection after manual expansion
  if (emails.length === 0) return;

  const durationHours = parseDuration(modal);
  const { matched, unmatched } = matchAttendeesToRoles(emails, roles, attendeeMap);
  const widget = buildCostWidget(matched, unmatched, durationHours);

  // Injection point: before the "N guests" section
  let injected = false;

  const allLeaves = Array.from(modal.querySelectorAll('*'));
  const guestsEl = allLeaves.find(el =>
    el.childElementCount === 0 && /^\d+\s+guests?$/i.test(el.textContent.trim())
  );

  if (guestsEl) {
    // Walk up until we find the rows container (4+ siblings = one per detail row),
    // then insert the widget before the guests row. Allow insertion even when the
    // rows container is a direct child of the modal.
    let el = guestsEl;
    while (el.parentNode) {
      el = el.parentNode;
      if (el === modal) break;
      if (el.parentNode && el.parentNode.children.length >= 4) {
        el.parentNode.insertBefore(widget, el);
        injected = true;
        break;
      }
    }
  }

  if (!injected) {
    // Fallback: after the heading / title block
    const heading = modal.querySelector('h1, h2, [role="heading"]');
    if (heading) {
      let el = heading;
      while (el.parentNode && el.parentNode !== modal) el = el.parentNode;
      el.parentNode?.insertBefore(widget, el.nextSibling);
    } else {
      modal.appendChild(widget);
    }
  }
  } finally {
    pendingModals.delete(modal);
  }
}

// ─── Observer ────────────────────────────────────────────────────────────────

function isEventModal(node) {
  // Must be a dialog role or contain one
  if (node.getAttribute?.('role') === 'dialog') return node;
  const dialog = node.querySelector?.('[role="dialog"]');
  if (dialog) return dialog;
  return null;
}

function checkNode(node) {
  if (node.nodeType !== 1) return;
  const modal = isEventModal(node);
  if (modal) tryInjectCost(modal);
}

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    // Newly added nodes
    for (const node of mutation.addedNodes) {
      checkNode(node);
    }
    // Google Calendar sometimes reveals modals by flipping aria-hidden
    if (
      mutation.type === 'attributes' &&
      mutation.target.getAttribute('aria-hidden') === 'false' &&
      mutation.target.getAttribute('role') === 'dialog'
    ) {
      tryInjectCost(mutation.target);
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['aria-hidden'],
});

// Initial scan in case a modal is already open when the script loads
document.querySelectorAll('[role="dialog"]').forEach(tryInjectCost);
