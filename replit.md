# ChatApp — Real-Time Chat Application

## Overview

A production-ready WhatsApp-like real-time chat application with full authentication, one-to-one messaging, online status, typing indicators, message receipts, and media sharing.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (`frontend/`) — package `@workspace/frontend`
- **Backend**: Express 5 + Socket.IO (`backend/`) — package `@workspace/backend`
- **Database**: MongoDB Atlas via Mongoose
- **Authentication**: JWT + bcrypt
- **Real-time**: Socket.IO WebSockets
- **File Uploads**: multer (local storage at backend/uploads)
- **Shared API client**: `lib/api-client-react` — TanStack Query hooks used by frontend

## Project Structure

```
├── frontend/          ← React + Vite frontend (deploy to Vercel)
│   ├── src/
│   ├── vite.config.ts
│   └── vercel.json    ← Vercel SPA routing config
├── backend/           ← Express + MongoDB backend (deploy to Render)
│   ├── src/
│   │   ├── routes/   ← auth, users, conversations, messages, media
│   │   ├── lib/      ← mongo models, socket, auth helpers
│   │   └── middlewares/
│   ├── build.mjs     ← esbuild bundler
│   └── .env.example  ← required env vars
├── lib/
│   ├── api-client-react/  ← generated TanStack Query hooks (used by frontend)
│   ├── api-zod/           ← Zod schemas (generated)
│   └── db/                ← legacy Drizzle ORM (unused, kept for reference)
└── artifacts/         ← Replit artifact wrappers (do not edit source here)
```

## Backend Routes (`backend/src/routes/`)
- `auth.ts` — /api/auth/register, /api/auth/login, /api/auth/reset-password, /api/auth/me
- `users.ts` — /api/users/search, /api/users/:id, /api/users/:id/profile
- `conversations.ts` — /api/conversations (CRUD)
- `messages.ts` — /api/conversations/:id/messages (CRUD + read receipts)
- `media.ts` — /api/media/upload (multipart form)

## Socket.IO Events (`backend/src/lib/socket.ts`)
Path: /api/socket.io

Server emits:
- `user:online` / `user:offline` — presence updates
- `message:new` — new message to all participants
- `message:status` — delivery/read status changes
- `conversation:new` — new conversation created
- `typing:start` / `typing:stop` — typing indicators

Client emits:
- `typing:start` / `typing:stop` — with conversationId
- `conversation:join` / `conversation:leave` — room management

## Frontend Pages (`frontend/src/`)
- `/login` — JWT login form
- `/register` — registration form
- `/` — main chat interface (sidebar + chat window)
- `/profile` — profile settings

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/frontend run dev` — run frontend locally
- `pnpm --filter @workspace/backend run dev` — run backend locally

## Deployment

### Vercel (Frontend)
- **Root Directory**: `frontend`
- **Install Command**: `cd .. && pnpm install`
- **Build Command**: `pnpm run build`
- **Output Directory**: `dist`
- **Environment Variables**: `VITE_API_URL=https://your-render-backend.onrender.com`

### Render (Backend)
- **Root Directory**: `.` (repo root)
- **Build Command**: `pnpm install && pnpm --filter @workspace/backend run build`
- **Start Command**: `node backend/dist/index.mjs`
- **Environment Variables**: `MONGODB_URI`, `SESSION_SECRET`, `PORT`, `NODE_ENV=production`

## Security Features
- bcrypt password hashing (12 rounds)
- JWT tokens (7 day expiry)
- Rate limiting (200 req/15min)
- Protected routes via middleware
- Input validation with Zod on all endpoints

## Message Auto-Delete
Messages with status "read" are soft-deleted (deletedAt set) after 8 hours via cleanup on each messages fetch.
