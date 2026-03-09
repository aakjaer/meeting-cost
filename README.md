# Meeting Cost Tracker — Chrome Extension

A Chrome extension that injects a **meeting cost estimate** directly into Google Calendar event modals, based on attendee roles and hourly rates.

---

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select this folder (`meeting-cost-tracker/`)

---

## Setup

1. Click the extension icon in the toolbar → **Open Settings**
2. **Add roles** with their hourly rates in DKK (e.g. Developer → 650 DKK/hr)
3. **Map attendees** — add each team member's email and assign their role
4. Click **Save settings**

---

## How it works

- When you open a meeting event in Google Calendar, the extension detects the attendees
- It matches attendees to roles using your configured email → role mapping
- It calculates the total cost based on the meeting duration × summed hourly rates
- A **cost widget** is injected directly into the event detail modal

---

## File Structure

```
meeting-cost-tracker/
├── manifest.json       — Extension config (Manifest V3)
├── content.js          — DOM observer + cost injection logic
├── content.css         — Styles for the injected widget
├── settings.html       — Settings page UI
├── settings.js         — Settings page logic
├── popup.html          — Toolbar popup
├── background.js       — Service worker
└── icons/              — Extension icons (add your own PNG files)
```

---

## Icons

You'll need to add icon files:
- `icons/icon16.png` (16×16)
- `icons/icon48.png` (48×48)  
- `icons/icon128.png` (128×128)

You can use any PNG — a simple emoji screenshot works fine for testing.

---

## Notes

- Attendee matching requires emails visible in the Google Calendar event
- Duration is parsed from the event time display — all-day events won't show a total cost, only a rate/hr
- Data is stored via `chrome.storage.sync`, so settings sync across your Chrome profile
- Unmatched attendees are shown as a note in the widget
