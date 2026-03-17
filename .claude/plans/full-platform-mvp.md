# PeerWeights Full Platform Implementation Plan

## 1. Summary

PeerWeights is a torrent-based marketplace for distributing AI models, LoRAs, and datasets. It enables creators to upload models with auto-detected metadata, sell or freely distribute them via BitTorrent, and earn 95% of revenue. The platform has three clients (web storefront, Electron desktop app, CLI tool), requires accounts for all downloads to enable seed tracking, and uses namespaced identifiers (`username/model-name`) for model addressing. The entire backend, payment, and torrent infrastructure is adapted from the battle-tested BoilerDeck codebase, re-skinned for the AI model domain with additions for model format detection, seed tracking, model versioning, and namespace resolution.

## 2. Implementation Order (15 Steps)

### Step 1: Project Scaffolding
**Complexity:** Medium
**What:** Initialize workspace structure, all package.json files, tsconfig files, workspace links.
**Files to create:**
- `server/package.json` — `@peerweights/server` with deps on all sub-packages
- `server/tsconfig.json`
- `server/src/index.ts` — Express app entry point (port from BoilerDeck)
- `server/packages/shared/package.json` — `@peerweights/shared`
- `server/packages/shared/src/{config,db,errors,middleware,redis,stripe,index}.ts`
- `server/packages/auth/package.json` — `@peerweights/auth`
- `server/packages/model/package.json` — `@peerweights/model`
- `server/packages/torrent/package.json` — `@peerweights/torrent`
- `server/packages/payment/package.json` — `@peerweights/payment`
- `server/packages/license/package.json` — `@peerweights/license`
- `web/package.json` — `@peerweights/web`
- `web/vite.config.ts`
- `web/index.html`
- `client/package.json` — `@peerweights/client`
- `cli/package.json` — `@peerweights/cli`
- Root `package.json` — update workspaces to include `server/packages/*`, `client`, `cli`
- Root `tsconfig.base.json`
- `server/.env.example`

### Step 2: Prisma Schema & Initial Migration
**Complexity:** Large
**Prerequisite:** Step 1

**Models:**

```
enum UserRole { USER, CREATOR, ADMIN }
enum ModelStatus { DRAFT, PUBLISHED, SUSPENDED }
enum VersionStatus { PROCESSING, READY, FAILED }
enum ModelFormat { SAFETENSORS, GGUF, ONNX, PYTORCH, PICKLE, HUGGINGFACE_DIR, OTHER }
enum LicenseStatus { ACTIVE, REVOKED, REFUNDED }
enum PaymentStatus { PENDING, COMPLETED, FAILED, REFUNDED }

User {
  id, email, username (unique, lowercase, alphanumeric+hyphens),
  passwordHash, displayName, role, stripeCustomerId,
  bio, avatarUrl, createdAt, updatedAt
  -> creator?, licenses[], payments[], refreshTokens[], seedStats[]
}

RefreshToken { id, userId, token, expiresAt, createdAt -> user }

Creator {
  id, userId (unique), stripeAccountId, stripeOnboarded, stripePayoutsEnabled,
  createdAt, updatedAt
  -> user, models[]
}

Model {
  id, creatorId, slug (unique per creator),
  name, description, priceCents, status,
  format (ModelFormat), architecture, parameterCount (BigInt?),
  baseModel, quantization, license (text: MIT, Apache, etc.),
  tags (string[]), coverImageUrl, readmeContent,
  downloadCount, createdAt, updatedAt
  -> creator, versions[], licenses[], payments[]
  @@unique([creatorId, slug])
}

ModelVersion {
  id, modelId, version, torrentId (unique, optional),
  fileSizeBytes (BigInt), format (ModelFormat), changelog,
  metadata (Json — raw extracted metadata),
  status (VersionStatus),
  createdAt
  -> model, torrent?
  @@unique([modelId, version])
}

Torrent {
  id, infoHash (unique), magnetUri, torrentFile (Bytes), createdAt
  -> version?
}

License {
  id, userId, modelId, paymentId (unique, optional),
  status (LicenseStatus), createdAt, updatedAt
  -> user, model, payment?
  @@unique([userId, modelId])
}

Payment {
  id, userId, modelId, stripePaymentIntentId, stripeCheckoutSessionId,
  amountCents, platformFeeCents, status (PaymentStatus),
  createdAt, updatedAt
  -> user, model, license?
}

SeedStats {
  id, userId, modelVersionId, bytesUploaded (BigInt),
  seedingSeconds (Int), lastReportedAt,
  createdAt, updatedAt
  -> user, modelVersion
  @@unique([userId, modelVersionId])
}

Tag {
  id, name (unique, lowercase), modelCount (denormalized)
}
```

**Migration name:** `init`

### Step 3: Shared Package
**Complexity:** Small
**Prerequisite:** Step 1, Step 2
**What:** Port all shared utilities from BoilerDeck, adapting for PeerWeights.
**Files:**
- `server/packages/shared/src/config.ts` — Add: `MODELS_DIR`, `MODEL_UPLOAD_MAX_SIZE` (default 200GB, no artificial cap), `STRIPE_PLATFORM_FEE_PERCENT` default 5. Remove: `GAMES_DIR`.
- `server/packages/shared/src/db.ts` — Direct port (BigInt toJSON polyfill)
- `server/packages/shared/src/errors.ts` — Direct port
- `server/packages/shared/src/middleware.ts` — Port, add `username` to JwtPayload interface
- `server/packages/shared/src/redis.ts` — Direct port
- `server/packages/shared/src/stripe.ts` — Direct port
- `server/packages/shared/src/index.ts` — Export all

### Step 4: Auth Package
**Complexity:** Medium
**Prerequisite:** Step 3
**Files:**
- `server/packages/auth/src/schemas.ts` — Add `username` field: `z.string().min(2).max(39).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)`
- `server/packages/auth/src/service.ts` — Port, check username uniqueness on register, include username in JWT
- `server/packages/auth/src/routes.ts` — Direct port
- `server/packages/auth/src/creator.routes.ts` — Port from `developer.routes.ts`, rename developer -> creator

### Step 5: Model Package (CRUD + Search)
**Complexity:** Large
**Prerequisite:** Step 3, Step 4
**Files:**
- `server/packages/model/src/schemas.ts` — Zod schemas for createModel, updateModel, createVersion, search params
- `server/packages/model/src/service.ts` — Port from catalog: slugify (no random suffix — namespaced), listPublishedModels, getModelByNamespace(username, slug), createModel, updateModel, publishModel/unpublishModel, search with filters (format, tags, price range, sort)
- `server/packages/model/src/routes.ts` — Public: `GET /models`, `GET /models/:username/:slug`, `GET /users/:username`. Creator: `POST /creator/models`, `PUT /creator/models/:id`, etc.
- `server/packages/model/src/format-detector.ts` — **New.** detectFormat, extractSafetensorsMetadata, extractGgufMetadata, extractOnnxMetadata, extractPytorchMetadata

### Step 6: Model Upload Pipeline
**Complexity:** Large
**Prerequisite:** Step 5, Step 7
**Files:**
- `server/packages/model/src/upload.ts` — Multer receives to `.tmp/`, move to `MODELS_DIR/<username>/<model-slug>/<version>/`, format detect, create torrent, store in DB, add to Transmission
- Key differences from BoilerDeck: no zip extraction, no artificial file size cap (200GB limit), adaptive torrent piece sizes (256KB for <1GB, 1MB for 1-10GB, 4MB for 10GB+), async processing for large files

### Step 7: Torrent Package
**Complexity:** Medium
**Prerequisite:** Step 3
**Files:**
- `server/packages/torrent/src/service.ts` — createModelTorrent (adaptive piece length), getLatestTorrent (license-gated), getLatestTorrentFile, reportSeedStats (upsert), getUserSeedStats, canStopSeeding (checks ratio >= 1.0), addToTransmission
- `server/packages/torrent/src/routes.ts` — `GET /torrents/:modelId/latest`, `GET /torrents/:modelId/latest/file`, `POST /torrents/seed-stats`, `GET /torrents/seed-stats/me`

### Step 8: Payment Package
**Complexity:** Medium
**Prerequisite:** Step 3
**Files:**
- `server/packages/payment/src/service.ts` — Port from BoilerDeck: checkout(userId, modelId), 5% fee, free=instant license, paid=Stripe Checkout with destination charge. Port webhook handlers directly.
- `server/packages/payment/src/routes.ts` — `POST /payments/checkout`, `POST /payments/webhook`

### Step 9: License Package
**Complexity:** Small
**Prerequisite:** Step 3
**Files:**
- `server/packages/license/src/service.ts` — listUserLicenses(userId) with model metadata + seed stats
- `server/packages/license/src/routes.ts` — `GET /licenses`

### Step 10: Server Entry Point
**Complexity:** Small
**Prerequisite:** Steps 4-9
**File:** `server/src/index.ts` — Wire all routers, CORS, helmet (CORP cross-origin), compression, morgan, raw body for Stripe webhook, health check, error handler

### Step 11: Web App
**Complexity:** Large
**Prerequisite:** Steps 4-10
**Key decision:** Single SPA (not separate storefront + dev-portal like BoilerDeck). Creator pages behind auth + role check.

**Stores (Zustand):**
- `authStore.ts` — Port, add username to user state
- `modelStore.ts` — browse, search, filters, model detail
- `libraryStore.ts` — licenses, torrent downloads
- `creatorStore.ts` — creator's models, upload state

**Pages:**
- Public: Home, Search, ModelDetail (`/:username/:modelName`), UserProfile (`/:username`), Login
- Auth: Library, Settings
- Creator: Dashboard, ModelEditor, Upload, SetupCreator
- Checkout: Success, Cancel

**Router:** BrowserRouter (not HashRouter) — requires nginx `try_files` fallback

### Step 12: Electron Desktop Client
**Complexity:** Large
**Prerequisite:** Step 11, Step 7
**Key changes from BoilerDeck:**
- **DO NOT destroy torrents after download** — keep seeding
- **Mandatory 1.0 seed ratio** — users must upload as much as they downloaded before they can stop seeding a model. "Stop Seeding" button is disabled/greyed out until ratio >= 1.0. Server-side `canStopSeeding()` endpoint validates, client enforces in UI. Bypassable by closing the app (trust-based), but the UI makes the expectation clear.
- Add seeding management IPC: `seeding:start`, `seeding:stop` (checks ratio first), `seeding:get-stats`
- Remove `games:launch`, add `models:open-folder`
- Background seed stats reporting to server
- Seeding manager UI with per-model ratio display (e.g., "0.4x / 1.0x — 16GB of 40GB uploaded")

### Step 13: CLI Tool
**Complexity:** Medium
**Prerequisite:** All server APIs
**Package:** `cli/` with commander, ora, chalk
**Commands:**
- `peerweights login` — email/password, store tokens in `~/.peerweights/config.json`
- `peerweights pull username/model-name` — resolve namespace, check/acquire license, download .torrent
- `peerweights push ./path --name my-model` — create model + version, upload file
- `peerweights search "query"` — tabular output
- `peerweights list` — user's published models
- `peerweights seed` — seed downloaded models in background
- `peerweights seed --status` — show per-model seed ratios, highlight models below 1.0x
- `peerweights seed --stop <model>` — stop seeding (rejected if ratio < 1.0, override with `--force`)

### Step 14: Scripts
**Complexity:** Small
**Files:**
- `scripts/reseed-torrents.sh` — Port from BoilerDeck, change DB name
- `scripts/upload-model.mjs` — Bulk model upload
- `scripts/create-admin.mjs` — Create admin user

### Step 15: Infrastructure & Deployment
**Complexity:** Medium
**Actions:**
1. DNS: Point peerweights.com A record to 204.168.133.38
2. nginx: `/etc/nginx/sites-available/peerweights` — proxy /api to port 7480, serve web/dist with try_files fallback, client_max_body_size 200g, extended proxy timeouts
3. SSL: certbot for peerweights.com
4. PostgreSQL: createdb peerweights
5. systemd: peerweights.service (port 7480)
6. Transmission: shared instance, different download-dir `/opt/peerweights/models`
7. Environment: `/opt/peerweights/server/.env`
8. Clone, install, migrate, build, start

## 3. API Endpoints (Complete)

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register with email, username, password |
| POST | `/api/auth/login` | No | Login |
| POST | `/api/auth/refresh` | No | Refresh access token |
| POST | `/api/auth/logout` | No | Invalidate refresh token |
| GET | `/api/auth/me` | Yes | Current user profile |

### Creator
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/creator/register` | Yes (USER) | Upgrade to CREATOR |
| GET | `/api/creator/profile` | Yes (CREATOR) | Creator profile |
| GET | `/api/creator/stripe/onboard` | Yes (CREATOR) | Stripe Connect URL |
| GET | `/api/creator/stripe/onboard/return` | No | Stripe return callback |
| GET | `/api/creator/stripe/onboard/refresh` | No | Stripe refresh callback |

### Models (Public)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/models` | No | List published models (paginated, filterable) |
| GET | `/api/models/:username/:slug` | No | Get model by namespace |
| GET | `/api/users/:username` | No | User profile + models |
| GET | `/api/tags` | No | List tags |

### Models (Creator)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/creator/models` | Yes (CREATOR) | Creator's models |
| POST | `/api/creator/models` | Yes (CREATOR) | Create model |
| PUT | `/api/creator/models/:id` | Yes (CREATOR) | Update model |
| PATCH | `/api/creator/models/:id/publish` | Yes (CREATOR) | Publish |
| PATCH | `/api/creator/models/:id/unpublish` | Yes (CREATOR) | Unpublish |
| POST | `/api/creator/models/:id/versions` | Yes (CREATOR) | Create version |
| POST | `/api/creator/models/:id/versions/:versionId/upload` | Yes (CREATOR) | Upload model file |
| POST | `/api/creator/models/:id/cover` | Yes (CREATOR) | Upload cover image |

### Torrents
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/torrents/:modelId/latest` | Yes (license) | Torrent metadata |
| GET | `/api/torrents/:modelId/latest/file` | Yes (license) | .torrent file bytes |
| POST | `/api/torrents/seed-stats` | Yes | Report seeding activity |
| GET | `/api/torrents/seed-stats/me` | Yes | User's seed stats |

### Payments
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/payments/checkout` | Yes | Checkout (free=instant, paid=Stripe) |
| POST | `/api/payments/webhook` | No (Stripe sig) | Stripe webhook |

### Licenses
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/licenses` | Yes | User's licenses + model info + seed stats |

## 4. Risks & Gotchas

1. **Large file handling (200GB cap, no artificial limit):** Multer disk storage required. nginx `client_max_body_size 200g`. Extended proxy timeouts (30min+). Consider async processing: mark PROCESSING, return immediately, process in background. Disk space is the real constraint, not upload size.
2. **Model format detection edge cases:** Safetensors most reliable (JSON header). GGUF has versioned headers (v1/v2/v3). PyTorch .pt files are ZIP files. Pickle files are dangerous — never unpickle on server. All extraction must be best-effort with try/catch.
3. **Seed tracking is trust-based:** Clients self-report stats. Mitigate: rate-limit reports, sanity-check values, use Transmission stats as ground truth for VPS-seeded torrents. **Mandatory 1.0 ratio** is enforced in UI (stop button disabled) and validated server-side, but users can bypass by closing the app. The social contract is clear even if not cryptographically enforced.
4. **Torrent compatibility:** WebTorrent (Electron) uses WebRTC. Transmission (VPS) uses TCP/UDP. Include both WebSocket and UDP trackers in announce lists.
5. **Stripe Connect for new platform:** Needs separate Stripe account from BoilerDeck. Review process may take time — plan for free-only launch initially.
6. **Namespace collisions:** Reserve system usernames (admin, api, creator, settings, search, explore, etc.).
7. **BoilerDeck Electron divergence:** BoilerDeck destroys torrents after download. PeerWeights must NOT — keep seeding. File handles stay open but models aren't executables so no locking issues.
8. **BrowserRouter needs nginx try_files:** Every route must fall back to /index.html. API routes must take priority.
9. **HuggingFace directory uploads:** Multiple files (config.json, model.safetensors, tokenizer.json). Phase 2 — MVP requires single-file or zip upload.
10. **VPS disk space:** Model files live on disk for seeding. Plan storage capacity for growth.

## 5. Future: Bitcoin Lightning Payments (Post-MVP)

**Why:** Lower fees than Stripe (1% vs 2.9% + $0.30), no chargebacks, global/permissionless (no Stripe Connect approval delays), aligns with the decentralized ethos of torrent-based distribution. Particularly attractive for microtransactions (small model purchases where Stripe's $0.30 flat fee eats a disproportionate chunk).

**Planned approach:**
- Add Lightning as an alternative payment method alongside Stripe (not a replacement)
- Integrate via BTCPay Server (self-hosted, no third-party custody) or LNbits
- Payment flow: user selects Lightning at checkout → server generates Lightning invoice → user pays from any Lightning wallet → server receives payment confirmation via webhook/polling → license granted
- Creator payouts: creators provide a Lightning address or LNURL, platform forwards payments minus 5% fee
- UI: QR code display for invoice, real-time payment status via WebSocket

**Schema changes needed (when implemented):**
- Add `paymentMethod` enum to Payment model: `STRIPE`, `LIGHTNING`
- Add `lightningInvoiceId`, `lightningPaymentHash` fields to Payment
- Add `lightningAddress` field to Creator (optional, for payouts)

**Infrastructure:**
- BTCPay Server instance on VPS (or separate small VPS)
- Lightning node (LND or CLN) with channel management
- Or: use a hosted solution like Voltage for the Lightning node, BTCPay Server self-hosted

**Dependencies:** None on MVP — this is a standalone addition to the payment package. The checkout endpoint gains a `paymentMethod` parameter, and a new Lightning payment handler sits alongside the Stripe handler.

**Risks:**
- Lightning UX is still rough for non-technical users — Stripe should remain the default
- Channel liquidity management is non-trivial for receiving payments
- BTC price volatility — consider auto-converting to USD via exchange API if creators want fiat payouts
- Regulatory considerations vary by jurisdiction

## 6. Key BoilerDeck Files to Port

| BoilerDeck File | PeerWeights Target | Changes Needed |
|---|---|---|
| `server/prisma/schema.prisma` | `server/prisma/schema.prisma` | Full rewrite for model domain |
| `server/packages/catalog/src/service.ts` | `server/packages/model/src/service.ts` | Replace game logic with model logic, add format detection |
| `server/packages/payment/src/service.ts` | `server/packages/payment/src/service.ts` | Nearly direct port, change fee to 5% |
| `server/packages/shared/src/middleware.ts` | `server/packages/shared/src/middleware.ts` | Add username to JWT payload |
| `server/packages/auth/src/developer.routes.ts` | `server/packages/auth/src/creator.routes.ts` | Rename developer -> creator |
| `client/src/main/torrentManager.ts` | `client/src/main/torrentManager.ts` | Remove destroy-after-download, add persistent seeding |
| `web/src/api.ts` | `web/src/api.ts` | Change localStorage key prefix |
| `web/src/stores/authStore.ts` | `web/src/stores/authStore.ts` | Add username to user state |
