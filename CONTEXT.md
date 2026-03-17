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

---

## What Has Been Built

Nothing yet — project initialized 2026-03-17.

**Tech stack (planned, based on BoilerDeck architecture):**
- Server: Node.js + TypeScript + Express + Prisma + PostgreSQL
- Web: Vite + React
- Distribution: BitTorrent (Transmission daemon on VPS for seeding)
- Payments: Stripe Connect (destination charges)
- Auth: JWT (access + refresh tokens)

**Heritage:** PeerWeights is a pivot of the BoilerDeck game distribution platform (`C:\Users\eface\peerplay\`). The core distribution, auth, and payment infrastructure will be adapted from that codebase. Key differences from BoilerDeck:
- Model metadata instead of game metadata (architecture, parameter count, base model, format)
- Model format detection instead of exe detection (safetensors, GGUF, ONNX, etc.)
- No desktop client needed initially — web-first with torrent file downloads
- Model preview/comparison tools instead of game screenshots

---

## Infrastructure (Planned)

Will share the same Hetzner VPS pattern as BoilerDeck, or potentially the same VPS with a separate nginx server block.

---

## Git State

- **Repo:** https://github.com/EthanGeisler/PeerWeights
- **Branch:** main
- **Status:** Initial commit

---

## What's Next

### Phase 1 — MVP
- [ ] Server: auth (register/login/JWT), user profiles
- [ ] Server: model CRUD (upload, metadata, listing, search)
- [ ] Server: file upload pipeline (zip/safetensors → torrent creation → Transmission seeding)
- [ ] Server: Stripe Connect payments (checkout, webhooks, creator payouts)
- [ ] Web: storefront (browse, search, model detail pages)
- [ ] Web: creator dashboard (upload models, manage listings, view sales)
- [ ] Web: auth (login/register, session management)
- [ ] Deploy to VPS

### Phase 2 — Growth
- [ ] Creator pro subscriptions
- [ ] Model format auto-detection and metadata extraction
- [ ] Reviews / ratings
- [ ] Categories and tags
- [ ] API for programmatic model downloads

### Phase 3 — Scale
- [ ] Seedbox tiers for creators
- [ ] Model versioning and delta updates
- [ ] Organization accounts
- [ ] Usage analytics for creators
