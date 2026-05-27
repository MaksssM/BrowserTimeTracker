# Zenith Dashboard Pro

Zenith Dashboard Pro is a Manifest V3 browser extension for tracking time spent on websites and reviewing that activity in a compact analytics dashboard.

The project is built with TypeScript and Vite. Data is stored locally by default, JSON backup import/export is supported, and the main statistics can optionally be synced through Google Drive `appDataFolder` after the user authorizes access.

## Features

- Tracks the active tab and accumulates time by hostname.
- Shows a live current-session timer in the popup.
- Provides summaries for today, week, month, and year.
- Includes analytics views for activity, distribution, sites, transitions, and trends.
- Supports site categories with custom colors.
- Supports bulk actions for selected sites.
- Includes pause and resume tracking.
- Sends reminders after long activity on the same site.
- Supports multiple UI themes and interface languages.
- Exports a versioned JSON backup.
- Imports the current backup format and older `dailyStats`-only files.
- Makes repeated imports safe: time is not duplicated and transitions are deduplicated.
- Supports Google Drive sync through Chrome Identity and Drive `appDataFolder`.

## Data Model

Main `chrome.storage.local` keys:

- `dailyStats`: time by date and hostname, in seconds.
- `siteCategories`: hostname-to-category mapping.
- `categoryColors`: category-to-color mapping.
- `siteTransitions`: recent transitions between hostnames.
- `isPaused`: tracking pause state.
- `lastProcessedDate`: day rollover marker.
- `reminderThreshold`: long-session reminder threshold in milliseconds.

Current exports use this versioned backup format:

```json
{
  "app": "zenith-time-tracker",
  "version": 2,
  "exportedAt": "2026-05-27T00:00:00.000Z",
  "data": {
    "dailyStats": {},
    "siteCategories": {},
    "categoryColors": {},
    "siteTransitions": [],
    "settings": {
      "language": "en",
      "timezone": "auto",
      "chartStyle": "line"
    }
  }
}
```

Repeated imports of the same backup are designed to be safe. For each date and hostname pair, the larger time value is kept, and site transitions are deduplicated.

## Development

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Build the extension:

```bash
npm run build
```

Production files are generated in `dist/`.

## Load In Chrome Or Edge

1. Run `npm run build`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the generated `dist/` folder.

After every source change and rebuild, reload the unpacked extension on the browser extensions page so the browser uses the latest files from `dist`.

## Project Structure

```text
src/
  background.ts      Service worker for tracking, storage, and messages
  gdrive-sync.ts     Google Drive appDataFolder sync service
  popup.ts           Popup UI, analytics, import/export, categories, settings
  translations.ts    Interface translations
public/
  manifest.json      Extension manifest
  popup.html         Popup markup
  style.css          Popup styles
vite.config.ts       Vite configuration
```

## Scripts

- `npm run dev`: start Vite in development mode.
- `npm run build`: build the extension into `dist/`.
- `npm run preview`: preview the Vite build.

## Permissions

The extension currently requests:

- `tabs`: read the active tab URL to determine the hostname.
- `storage`: store statistics, settings, categories, and sync state.
- `alarms`: support background scheduling.
- `contextMenus`: add the current page to a category from the browser menu.
- `identity`: authorize optional Google Drive sync.

Google Drive sync uses this scope:

```text
https://www.googleapis.com/auth/drive.appdata
```

This scope limits access to the extension's hidden app data folder in Google Drive.

## Privacy

Data stays local unless the user explicitly starts Google Drive sync. The extension stores hostnames and time totals, not page contents.

JSON backups can contain hostnames, category names, category colors, transitions, and usage totals. Treat backup files as private data.
