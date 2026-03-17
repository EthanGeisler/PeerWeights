# PeerWeights — AI Model Marketplace

> **Start here:** Read `CONTEXT.md` for full project state, what's been built, known issues, and next steps.

## Project Structure
- `server/` — Node.js + TypeScript backend (Express, Prisma, PostgreSQL)
- `web/` — Storefront + creator dashboard SPA (Vite, React)

## Development
- **Server:** `npm run dev:server` from root
- **Web:** `npm run dev:web` from root
- All packages use ESM (`"type": "module"`) — use `.js` extensions in imports

## Key Conventions
- Express routes use `try/catch` with `next(err)` pattern
- Input validation via Zod schemas
- Auth via JWT (access + refresh tokens)
- Prisma models are PascalCase, DB tables are snake_case (via `@@map`)
- Server error shape: `{ error: { code, message } }`

## Heritage
This project is adapted from BoilerDeck (`C:\Users\eface\peerplay\`). When porting code, remember to:
- Replace game-specific terminology with model terminology
- Replace exe detection with model format detection (safetensors, GGUF, ONNX)
- Keep the same auth, payment, and torrent distribution patterns — they're battle-tested
