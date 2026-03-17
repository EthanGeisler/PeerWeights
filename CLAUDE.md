# PeerWeights — AI Model Marketplace

> **Start here:** Read `CONTEXT.md` for full project state, what's been built, known issues, and next steps.

## Project Structure
- `server/` — Node.js + TypeScript backend monorepo (Express, Prisma, PostgreSQL)
- `server/packages/` — Modular service packages (auth, model, license, payment, torrent, shared)
- `server/prisma/` — Database schema and migrations
- `web/` — Storefront + creator dashboard SPA (Vite, React 19, Zustand, BrowserRouter)
- `cli/` — Command-line tool for pulling/pushing models
- `scripts/` — Admin and maintenance scripts

## Development
- **Server:** `npm run dev:server` from root (uses tsx watch, port 7480)
- **Web:** `npm run dev:web` from root (Vite on port 5173, proxies /api to localhost:7480)
- **Database:** `npm run db:migrate` (Prisma migrate dev), `npm run db:generate` (Prisma generate)
- All packages use ESM (`"type": "module"`) — use `.js` extensions in imports

## Key Conventions
- Express routes use `try/catch` with `next(err)` pattern
- Input validation via Zod schemas
- Auth via JWT (access + refresh tokens), `authenticate` middleware from `@peerweights/shared`
- Role checks via `requireRole("CREATOR")` etc.
- Error classes: AppError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, ValidationError
- Stripe: import `getStripe` from `@peerweights/shared` (singleton) — never instantiate Stripe directly
- Prisma models are PascalCase, DB tables are snake_case (via `@@map`)
- Server error shape: `{ error: { code, message } }`
- Helmet CORP: Always use `crossOriginResourcePolicy: { policy: "cross-origin" }`
- Token rotation uses `deleteMany` (idempotent for race conditions)
- Refresh calls serialized via `refreshPromise` lock in api.ts
- Role changes require token refresh (JWT carries old role until refreshed)
- `GET /api/licenses` returns `{ licenses: [...] }` — not a bare array
- Namespace addressing: `username/model-slug` (like GitHub repos)
- Reserved usernames prevent route collisions (admin, api, search, etc.)
- Platform fee: 5% (configurable via STRIPE_PLATFORM_FEE_PERCENT)
- BrowserRouter (not HashRouter) — requires nginx try_files fallback

## Heritage
This project is adapted from BoilerDeck (`C:\Users\eface\peerplay\`). Key changes:
- Developer -> Creator, Game -> Model, GameVersion -> ModelVersion
- Exe detection -> model format detection (safetensors, GGUF, ONNX, PyTorch)
- Added username field for namespace addressing
- Added SeedStats model for tracking seed ratios
- Adaptive torrent piece sizes (256KB/1MB/4MB based on file size)
- Torrents are NOT destroyed after download — persistent seeding
- Mandatory 1.0 seed ratio (UI-enforced, trust-based)
- Single SPA (not separate storefront + dev portal)
- BrowserRouter instead of HashRouter
- Port 7480 instead of 3001

## Deployment to VPS
Target: peerweights.com / 204.168.133.38
```bash
# Pull, install, build, restart
ssh root@204.168.133.38 "cd /opt/peerweights && git pull origin main && npm install"
ssh root@204.168.133.38 "cd /opt/peerweights && npm run build:web"
ssh root@204.168.133.38 "systemctl restart peerweights"
```

## Environment
- Copy `server/.env.example` to `server/.env` and configure
- Requires PostgreSQL and Redis running (locally or remote connection strings)
