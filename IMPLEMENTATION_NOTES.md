# NPTEL Desktop App Implementation Notes

## Overview

This desktop app was evolved from a simple Electron shell into a self-contained NPTEL assignment automation app that can:
- open a native login flow for NPTEL/Google auth
- save authentication state locally
- restore auth into a Playwright browser context before scraping
- scrape NPTEL assignment questions from the course pages
- solve the questions via Groq
- submit answers and track history
- persist auth/history in SQLite instead of server-side storage

## Key design direction

The app was intentionally shifted away from the old server-backed design and toward a desktop-only architecture so the user can run the automation locally without needing a separate backend service.

## Major milestones in this session

### 1. Initial Electron app review

The existing Electron app was inspected to understand:
- renderer-side login flow
- IPC bridge between render and main process
- auth/session persistence structure
- how the app interacted with the backend server previously

Reference files:
- [fuck-nptel/PROJECT.md](/home/realrnvr/Desktop/web/fuck-nptel/PROJECT.md)
- [fuck-nptel/electron/main.cjs](/home/realrnvr/Desktop/web/fuck-nptel/electron/main.cjs)

### 2. Fixed stale auth state bugs

A number of false-positive and stale-state issues were found:
- localStorage auth cache could remain after failed login
- logout did not fully clear browser storage
- the app could incorrectly still show the user as connected even when the popup was not authenticated
- the login detection incorrectly treated any cookie presence as success

Fixes were applied in:
- [src/renderer/src/App.tsx](/home/realrnvr/Desktop/web/fuck-nptel-electron/src/renderer/src/App.tsx)
- [src/main/index.ts](/home/realrnvr/Desktop/web/fuck-nptel-electron/src/main/index.ts)

### 3. Removed server API dependency

The app was reworked so it no longer calls backend routes such as:
- /auth/status
- /assignments/solve
- /assignments/models
- /assignments

The desktop app now performs the work directly in Electron main process via Playwright and direct LLM calls.

Files involved:
- [src/main/index.ts](/home/realrnvr/Desktop/web/fuck-nptel-electron/src/main/index.ts)
- [src/preload/index.ts](/home/realrnvr/Desktop/web/fuck-nptel-electron/src/preload/index.ts)

### 4. Added direct scraping and solving flow

The Electron main process now includes:
- persistent Playwright browser profile
- NPTEL login session capture
- assignment page scraping logic
- question answer solving with Groq
- answer submission flow
- local assignment history tracking

### 5. Switched persistence to SQLite

To make persistence local and robust, the app moved from JSON file storage to SQLite.

Current storage includes:
- auth_session table: stores current NPTEL session and email
- assignment_history table: stores solved assignment results and metadata

Implemented in:
- [src/main/index.ts](/home/realrnvr/Desktop/web/fuck-nptel-electron/src/main/index.ts)

### 6. Fixed the real auth bug: partial cookie restore

The main underlying issue causing repeated “Not signed in on onlinecourses.nptel.ac.in” errors was that the app was restoring only a partial cookie state, not the full browser auth state.

NPTEL auth can depend on more than cookies, including:
- Firebase-generated auth entries in localStorage/sessionStorage
- browser storage state from the Google/NPTEL login flow

The final fix was to capture and restore the actual browser `storageState()` from Playwright, not a minimal cookie subset.

### 7. Final architecture

Current desktop app architecture:

Electron renderer UI
  -> Electron IPC handlers
  -> Electron main process
    -> Playwright browser for NPTEL
    -> Groq API for solving
    -> SQLite for persistence

## Current status

The app is now structured as a self-contained desktop automation tool and no longer depends on the old server backend for core behavior.

## Validation

The project was checked with:
- `npm run build` in the Electron app

This passed successfully after the final conversion to the desktop-only architecture.

## Notes

- The app expects `MAIN_VITE_GROQ_API_KEY` (or the legacy `GROQ_API_KEY`) for LLM access.
- The old server folder in the main project remains as legacy/reference code, but the Electron app itself no longer calls it.
