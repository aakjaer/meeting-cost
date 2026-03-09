// Meeting Cost Tracker - Content Script

const WIDGET_CLASS = 'mct-widget';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ roles: [], attendeeMap: {} }, resolve);
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
      <div class="mct-icon-col">💰</div>
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
    <div class="mct-icon-col">💰</div>
    <div class="mct-content-col">
      <div class="mct-main-text">${mainHtml}</div>
      <div class="mct-sub-text">${subText}</div>
    </div>
  `;
  return widget;
}

// ─── Injection ───────────────────────────────────────────────────────────────

async function tryInjectCost(modal) {
  // Guard: skip if already injected
  if (modal.querySelector(`.${WIDGET_CLASS}`)) return;

  const { roles, attendeeMap } = await getSettings();

  // Wait for Google to finish rendering attendees
  await new Promise(r => setTimeout(r, 700));

  // Re-check guard after delay
  if (modal.querySelector(`.${WIDGET_CLASS}`)) return;

  const emails = extractAttendeeEmails(modal);
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
