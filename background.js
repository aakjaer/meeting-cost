// Meeting Cost Tracker - Service Worker

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openSettings') {
    chrome.runtime.openOptionsPage();
  }
});

// ─── Seed data ────────────────────────────────────────────────────────────────
// Role taxonomy sourced from roles.csv (PluginRoleTaxonomy_Universal).
// Employee→role assignments are hardcoded here for testing.
// TODO: Replace with import from CSV/XLSX when that feature is built.

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

// Seed storage on install — only seeds roles if none exist yet.
// Employees are imported via CSV in settings (not stored in code).
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ roles: [] }, data => {
    if (data.roles.length === 0) {
      chrome.storage.sync.set({ roles: SEED_ROLES });
    }
  });
});
