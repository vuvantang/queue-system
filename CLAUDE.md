# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bamso is a queue management system (like banks/hospitals) with three components:
- **Server** (`server/`) — Node.js + Express + Socket.IO + SQLite (better-sqlite3) backend, also serves the TV Display
- **Kiosk** (`apps/kiosk/`) — Tauri v2 desktop app for customers to take a number
- **Counter** (`apps/counter/`) — Tauri v2 desktop app for staff to call numbers

## Commands

### Server
```bash
cd server
npm run dev          # Start dev server with hot reload (tsx watch), port 3000
npm run build        # TypeScript compile to dist/
npm start            # Run compiled JS from dist/
```

### Tauri Apps
```bash
cd apps/kiosk        # or apps/counter
npx tauri dev        # Dev mode (starts Vite + Tauri window)
npx tauri build      # Production build (.dmg/.app)
```

### Install Dependencies
```bash
npm install          # Root workspace installs all
# Or individually:
cd server && npm install
cd apps/kiosk && npm install
cd apps/counter && npm install
```

## Architecture

### Monorepo Structure
npm workspaces with `server/` and `apps/*`. Each Tauri app has its own `package.json`, `vite.config.ts`, and `src-tauri/` Rust backend.

### Multi-Area Model
The system supports multiple **areas** (khu vực), each with its own:
- Service types (loại dịch vụ) with unique prefix (A, B, C...)
- Counters (quầy) for staff
- Independent queue and TV display

### Data Flow
1. Kiosk calls `POST /api/tickets {service_type_id}` → creates ticket (public, no auth)
2. Server broadcasts `ticket:created` via Socket.IO to the area's room
3. Staff calls `POST /api/tickets/call-next {counter_id}` (requires JWT)
4. Server broadcasts `ticket:called` with ticket + counter info
5. TV Display receives event → shows announcement overlay + plays chime + speaks Vietnamese TTS

### Socket.IO Rooms
Each area ID maps to a room (`area:<id>`). Clients join their area's room on connect. Server broadcasts events only to the relevant area room.

### Auth
- JWT tokens (24h expiry) via `Authorization: Bearer <token>` header
- Roles: `admin` (full access) and `staff` (ticket operations only)
- Public endpoints: `POST /api/tickets`, `GET /api/areas/*`, `GET /api/settings`
- Default credentials: `admin` / `admin123`

### Database
SQLite via better-sqlite3 (synchronous, transactions for atomicity). Key tables: `users`, `areas`, `service_types`, `counters`, `tickets`, `settings`. Daily auto-reset: on first request of a new day, all waiting tickets are skipped and sequence numbers reset to 1.

### Tauri v2 Specifics
- Uses Tauri v2 capabilities system (not v1 allowlist)
- Kiosk: Rust commands for `list_monitors` (secondary display detection) and `print_ticket` (thermal printer placeholder)
- Both apps connect to server via HTTP fetch + Socket.IO client (configured via localStorage `kiosk_server_url` / `counter_server_url`)
- CSP allows `http://*` and `ws://*` for LAN connectivity

## Key Conventions
- Vietnamese UI throughout (error messages, labels, announcements)
- Server TypeScript uses NodeNext module resolution with `.js` extensions in imports
- Tauri frontends are vanilla TypeScript + Vite (no React/Vue)
- Ticket number format: `{prefix}{number padded to 3 digits}` (e.g., A001, B042)
