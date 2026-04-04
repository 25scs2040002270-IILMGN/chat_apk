import { Server as HttpServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import { verifyToken } from "./auth";
import { db } from "@workspace/db";
import { usersTable, messagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface SocketUser {
  userId: number;
  socketId: string;
}

const activeUsers = new Map<number, Set<string>>();

export function getActiveUsers(): Map<number, Set<string>> {
  return activeUsers;
}

export function isUserOnline(userId: number): boolean {
  const sockets = activeUsers.get(userId);
  return !!sockets && sockets.size > 0;
}

export function initSocketServer(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }
    try {
      const payload = verifyToken(token);
      (socket as Socket & { userId: number }).userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = (socket as Socket & { userId: number }).userId;
    logger.info({ userId, socketId: socket.id }, "User connected");

    if (!activeUsers.has(userId)) {
      activeUsers.set(userId, new Set());
    }
    activeUsers.get(userId)!.add(socket.id);

    await db
      .update(usersTable)
      .set({ isOnline: true, lastSeen: new Date() })
      .where(eq(usersTable.id, userId));

    socket.broadcast.emit("user:online", { userId });

    socket.join(`user:${userId}`);

    socket.on("typing:start", (data: { conversationId: number }) => {
      socket.to(`conversation:${data.conversationId}`).emit("typing:start", {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on("typing:stop", (data: { conversationId: number }) => {
      socket.to(`conversation:${data.conversationId}`).emit("typing:stop", {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on("conversation:join", (conversationId: number) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("conversation:leave", (conversationId: number) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("disconnect", async () => {
      logger.info({ userId, socketId: socket.id }, "User disconnected");
      const sockets = activeUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          activeUsers.delete(userId);
          await db
            .update(usersTable)
            .set({ isOnline: false, lastSeen: new Date() })
            .where(eq(usersTable.id, userId));
          socket.broadcast.emit("user:offline", { userId, lastSeen: new Date().toISOString() });
        }
      }
    });
  });

  return io;
}

let _io: IOServer | null = null;

export function setIO(io: IOServer) {
  _io = io;
}

export function getIO(): IOServer {
  if (!_io) throw new Error("Socket.IO not initialized");
  return _io;
}
