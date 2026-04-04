# ChatApp — Real-Time Chat Application

## Overview

A production-ready WhatsApp-like real-time chat application with full authentication, one-to-one messaging, online status, typing indicators, message receipts, and media sharing.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/chat-app)
- **Backend**: Express 5 + Socket.IO (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: JWT + bcrypt
- **Real-time**: Socket.IO WebSockets
- **File Uploads**: multer (local storage at /uploads)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Architecture

### Database Schema (lib/db/src/schema/)
- `users` — user profiles, online status, last seen
- `conversations` — 1:1 and group chats
- `conversation_participants` — many-to-many users/conversations, tracks last read message
- `messages` — messages with status (sent/delivered/read), auto-delete after 8h when read

### Backend Routes (artifacts/api-server/src/routes/)
- `auth.ts` — /api/auth/register, /api/auth/login, /api/auth/me
- `users.ts` — /api/users/search, /api/users/:id, /api/users/:id/profile
- `conversations.ts` — /api/conversations (CRUD)
- `messages.ts` — /api/conversations/:id/messages (CRUD + read receipts)
- `media.ts` — /api/media/upload (multipart form, stored in /uploads)

### Socket.IO Events (artifacts/api-server/src/lib/socket.ts)
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

### Frontend Pages (artifacts/chat-app/src/)
- `/login` — JWT login form
- `/register` — registration form
- `/` — main chat interface (sidebar + chat window)
- `/profile` — profile settings

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Security Features
- bcrypt password hashing (12 rounds)
- JWT tokens (7 day expiry)
- Rate limiting (200 req/15min)
- Protected routes via middleware
- Input validation with Zod on all endpoints

## Message Auto-Delete
Messages with status "read" are soft-deleted (deletedAt set) after 8 hours via cleanup on each messages fetch.

## Test Users
- alice@example.com / password123
- bob@example.com / password123
