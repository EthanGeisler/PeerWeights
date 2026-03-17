# PeerWeights — Project Context

> Read this first every session. This file captures the current state of the project so future Claude instances can pick up where the last one left off.

---

## What Is PeerWeights?

A **torrent-based marketplace for AI models, LoRAs, and datasets**. Think "Steam for AI models" — creators upload, buyers purchase, files distribute via BitTorrent.

**Key value props:**
- **95/5 revenue split** (creator/platform) — made possible by near-zero CDN costs (BitTorrent distribution)
- **Large file friendly** — BitTorrent handles multi-GB model files efficiently where traditional hosting struggles
- **Creator-first** — clean marketplace for selling fine-tunes, LoRAs, datasets, and checkpoints that currently have no good home
- **Technical audience** — ML engineers and AI developers who appreciate efficient P2P distribution

**Domain:** peerweights.com (purchased 2026-03-17, Namecheap)

**Target audience:**
- **Sellers:** Model fine-tuners, dataset curators, LoRA creators who currently monetize through Patreon/Gumroad/Discord or give work away free
- **Buyers:** ML engineers, AI developers, companies looking for specialized/fine-tuned models

**Revenue model:**
- 5% transaction fee on all sales (phase 1)
- Creator pro accounts with analytics and featured placement (phase 2)
- Seedbox-as-a-service for guaranteed high-availability seeding (phase 3)

**Core policies:**
- Account required for all downloads (enables seed tracking)
- **Mandatory 1.0 seed ratio** — users must upload as much as they downloaded before stopping seeding. Enforced in UI, validated server-side, trust-based (bypassable by closing app).
- Namespaced model addressing: `username/model-name`
- Model metadata auto-detected from file headers (best effort, creator can override)

---

## What Has Been Built (as of 2026-03-17)

**Full MVP implemented.** All server packages, web frontend, CLI tool, and scripts are complete. Database migrated to VPS.

### Server (`server/`)
Monorepo with 6 packages under `server/packages/`:

| Package | Purpose | Key Files |
|---------|---------|-----------|
| **shared** | Config, DB, errors, middleware, Redis, Stripe | `config.ts` (Zod env), `db.ts` (Prisma+BigInt), `errors.ts` (AppError hierarchy), `middleware.ts` (JWT auth+roles), `redis.ts`, `stripe.ts` |
| **auth** | Register, login, refresh, logout, creator onboarding | `service.ts` (bcrypt 12 rounds, token rotation), `schemas.ts` (username validation, reserved names), `creator.routes.ts` (Stripe Connect) |
| **model** | Model CRUD, search, upload pipeline, format detection | `service.ts` (slugify, upload+torrent pipeline, Transmission RPC), `format-detector.ts` (safetensors/GGUF header parsing), `schemas.ts` |
| **torrent** | Torrent creation, license-gated access, seed tracking | `service.ts` (create-torrent, announce list, seed ratio validation) |
| **payment** | Stripe checkout, webhooks, free instant purchase | `service.ts` (destination charges, 5% fee, idempotent webhooks) |
| **license** | License listing with seed stats | `service.ts` (enriched with ratio calculation) |

**Entry point:** `server/src/index.ts` — Express 5, Stripe raw body first, helmet CORP, CORS, compression, morgan, 6 routers mounted at `/api/*`

### Database (`server/prisma/schema.prisma`)
10 models: User, RefreshToken, Creator, Model, ModelVersion, Torrent, License, Payment, SeedStats, Tag
7 enums: UserRole, ModelStatus, VersionStatus, ModelFormat, LicenseStatus, PaymentStatus

**Migration `20260317161528_init` applied to VPS database.**

Key schema features:
- User has `username` (unique, for namespace addressing)
- Creator links to User (1:1), has `stripeAccountId`
- Model has `format`, `architecture`, `parameterCount`, `baseModel`, `quantization`, `tags[]`, `readmeContent`, `downloadCount`
- ModelVersion has `format`, `metadata` (Json), links to Torrent
- SeedStats tracks `bytesUploaded`/`bytesDownloaded` per user per version
- Unique constraint on `creatorId + slug` (no random suffix needed)

### Web (`web/`)
Vite + React 19 + Zustand + BrowserRouter SPA

**Stores:** authStore, modelStore, libraryStore, creatorStore
**Pages:** Home, Search, ModelDetail, UserProfile, Login, Register, Library, CreatorDashboard, CheckoutSuccess, CheckoutCancel
**API client:** `api.ts` with auto-refresh on 401, serialized refresh lock, `pw_refresh_token` in localStorage

### CLI (`cli/`)
Commander-based: `login`, `search`, `pull` (checkout + torrent), `push` (create + upload), `list`, `seed`
Config at `~/.peerweights/config.json`

### Scripts
- `scripts/create-admin.mjs` — Create admin user
- `scripts/reseed-torrents.sh` — Re-add all published torrents to Transmission
- `scripts/upload-model.mjs` — Bulk upload from manifest.json

---

## API Endpoints Quick Reference

### Auth (`/api/auth/*`)
- `POST /register` — email, username, password, displayName
- `POST /login` — email, password → tokens
- `POST /refresh` — refresh token rotation
- `POST /logout` — invalidate refresh token
- `GET /me` — current user (requires auth)

### Creator (`/api/creator/*`)
- `POST /register` — become a creator (requires USER role)
- `POST /stripe/onboard` — start Stripe Connect onboarding
- `GET /stripe/callback?token=` — complete onboarding

### Models (`/api/*`)
- `GET /models` — list published models (search, format, tag, sort, pagination)
- `GET /users/:username` — user's public profile + models
- `GET /models/:username/:slug` — model detail by namespace
- `GET /creator/models` — creator's own models list
- `POST /creator/models` — create model (requires CREATOR)
- `PUT /creator/models/:id` — update model
- `PATCH /creator/models/:id/publish` — publish model
- `PATCH /creator/models/:id/unpublish` — unpublish model
- `POST /creator/models/:id/versions` — create version
- `POST /creator/models/:id/versions/:versionId/upload` — upload model file (up to 200GB)
- `POST /creator/models/:id/cover` — upload cover image
- `GET /covers/:modelId` — serve cover image

### Torrents (`/api/torrents/*`)
- `GET /:modelId/latest` — get latest torrent info (requires license)
- `GET /:modelId/latest/file` — download .torrent file (requires license)
- `POST /seed-stats` — report seed progress
- `GET /seed-stats/me` — get user's seed stats

### Payments (`/api/payments/*`)
- `POST /checkout` — start purchase (free=instant, paid=Stripe)
- `POST /webhook` — Stripe webhook handler

### Licenses (`/api/licenses`)
- `GET /` — list user's licenses with seed stats

---

## Local Development Setup

```bash
# 1. SSH tunnels to VPS (PostgreSQL + Redis)
ssh -L 15432:127.0.0.1:5432 -L 16379:127.0.0.1:6379 root@204.168.133.38

# 2. Start server (port 7480)
npm run dev:server

# 3. Start web (Vite, port 5173, proxies /api → localhost:7480)
npm run dev:web

# 4. Database operations
npm run db:migrate    # Prisma migrate dev
npm run db:generate   # Prisma generate
```

**Environment:** `server/.env` configured with SSH tunnel ports (15432 for PostgreSQL, 16379 for Redis), Stripe test key.

---

## VPS / Deployment

**Target:** peerweights.com / 204.168.133.38 (same Hetzner VPS as BoilerDeck)

```bash
# Quick deploy (after initial setup)
ssh root@204.168.133.38 "cd /opt/peerweights && git pull origin main && npm install"
ssh root@204.168.133.38 "cd /opt/peerweights && npm run build:web"
ssh root@204.168.133.38 "systemctl restart peerweights"
```

**Deployed (2026-03-17).** nginx, SSL (certbot), systemd service, Transmission daemon, and Stripe webhook all configured and running. Smoke test passed: register, create model, upload, purchase, download torrent flow all working.

---

## Known Issues & Gotchas

1. **ESM everywhere** — all packages use `"type": "module"`, imports must use `.js` extensions
2. **Prisma client generation** — run `npm run db:generate` after schema changes or fresh install
3. **Stripe raw body** — must be parsed BEFORE `express.json()` middleware (see `server/src/index.ts`)
4. **Token rotation race** — `deleteMany` used instead of `delete` for idempotent refresh token cleanup
5. **BrowserRouter** — nginx must have `try_files $uri /index.html` fallback (unlike BoilerDeck's HashRouter)
6. **Cover images** — served from disk, probes `.jpg`, `.png`, `.webp` extensions
7. **Transmission RPC** — 409 response is expected on first call (session ID handshake), retry with returned header
8. **Port 7480** — not 3001 (BoilerDeck) or 3000 (common default)
9. **Reserved usernames** — admin, api, creator, search, models, about, etc. checked at registration

---

## What's Next

### ~~Immediate (deploy MVP)~~ DONE (2026-03-17)
- [x] Deploy to VPS (nginx, SSL, systemd, clone, install, migrate, build)
- [x] Configure Stripe webhook endpoint
- [x] Set up Transmission for model seeding
- [x] Smoke test full flow: register → create model → upload → purchase → download torrent

### Phase 2 — Growth
- [ ] Electron desktop client (persistent seeding, WebTorrent)
- [ ] Creator pro subscriptions
- [ ] Reviews / ratings
- [ ] Enhanced search (categories, filtering)
- [ ] API keys for programmatic access

### Phase 3 — Scale
- [ ] Bitcoin Lightning payments (BTCPay Server)
- [ ] Seedbox tiers for creators
- [ ] Model versioning and delta updates
- [ ] Organization accounts
- [ ] Usage analytics for creators
