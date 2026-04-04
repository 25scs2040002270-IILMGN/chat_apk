import { Router, type IRouter } from "express";
import { eq, and, lt, desc, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  messagesTable,
  conversationParticipantsTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/authenticate";
import { SendMessageBody } from "@workspace/api-zod";
import { getIO, isUserOnline } from "../lib/socket";

const router: IRouter = Router();

const MESSAGE_AUTO_DELETE_HOURS = 8;

function formatUserPublic(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    isOnline: isUserOnline(user.id),
    lastSeen: user.lastSeen?.toISOString() ?? null,
  };
}

function formatMessage(
  msg: typeof messagesTable.$inferSelect,
  sender: typeof usersTable.$inferSelect
) {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    content: msg.content ?? null,
    mediaUrl: msg.mediaUrl ?? null,
    mediaType: msg.mediaType ?? null,
    status: msg.status,
    createdAt: msg.createdAt.toISOString(),
    readAt: msg.readAt?.toISOString() ?? null,
    sender: formatUserPublic(sender),
  };
}

async function checkParticipant(conversationId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(
      and(
        eq(conversationParticipantsTable.conversationId, conversationId),
        eq(conversationParticipantsTable.userId, userId)
      )
    );
  return !!row;
}

async function cleanupExpiredMessages(conversationId: number): Promise<void> {
  const cutoff = new Date(Date.now() - MESSAGE_AUTO_DELETE_HOURS * 60 * 60 * 1000);
  await db
    .update(messagesTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.status, "read"),
        sql`${messagesTable.readAt} IS NOT NULL`,
        sql`${messagesTable.readAt} < ${cutoff.toISOString()}`,
        sql`${messagesTable.deletedAt} IS NULL`
      )
    );
}

router.get(
  "/conversations/:conversationId/messages",
  authenticate,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;
    const conversationId = parseInt(raw, 10);

    const isMember = await checkParticipant(conversationId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a participant of this conversation" });
      return;
    }

    await cleanupExpiredMessages(conversationId);

    const beforeId = req.query.before ? parseInt(req.query.before as string, 10) : null;
    const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 100);

    const messages = await db
      .select()
      .from(messagesTable)
      .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(
        and(
          eq(messagesTable.conversationId, conversationId),
          sql`${messagesTable.deletedAt} IS NULL`,
          beforeId ? lt(messagesTable.id, beforeId) : sql`TRUE`
        )
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);

    const result = messages.reverse().map((row) =>
      formatMessage(row.messages, row.users)
    );

    await db
      .update(messagesTable)
      .set({ status: "delivered" })
      .where(
        and(
          eq(messagesTable.conversationId, conversationId),
          sql`${messagesTable.senderId} != ${req.userId!}`,
          eq(messagesTable.status, "sent"),
          sql`${messagesTable.deletedAt} IS NULL`
        )
      );

    res.json(result);
  }
);

router.post(
  "/conversations/:conversationId/messages",
  authenticate,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;
    const conversationId = parseInt(raw, 10);

    const isMember = await checkParticipant(conversationId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a participant of this conversation" });
      return;
    }

    const parsed = SendMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { content, mediaUrl, mediaType } = parsed.data;

    if (!content && !mediaUrl) {
      res.status(400).json({ error: "Message must have content or media" });
      return;
    }

    const [msg] = await db
      .insert(messagesTable)
      .values({
        conversationId,
        senderId: req.userId!,
        content: content ?? null,
        mediaUrl: mediaUrl ?? null,
        mediaType: mediaType ?? null,
        status: "sent",
      })
      .returning();

    const [senderRow] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));

    const formattedMsg = formatMessage(msg, senderRow);

    const io = getIO();
    io.to(`conversation:${conversationId}`).emit("message:new", formattedMsg);

    const participants = await db
      .select()
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, conversationId));

    for (const p of participants) {
      if (p.userId !== req.userId) {
        io.to(`user:${p.userId}`).emit("message:new", formattedMsg);
      }
    }

    res.status(201).json(formattedMsg);
  }
);

router.post(
  "/conversations/:conversationId/messages/:messageId/read",
  authenticate,
  async (req, res): Promise<void> => {
    const rawConv = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;
    const rawMsg = Array.isArray(req.params.messageId)
      ? req.params.messageId[0]
      : req.params.messageId;

    const conversationId = parseInt(rawConv, 10);
    const messageId = parseInt(rawMsg, 10);

    const isMember = await checkParticipant(conversationId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a participant" });
      return;
    }

    const [msg] = await db
      .update(messagesTable)
      .set({ status: "read", readAt: new Date() })
      .where(
        and(
          eq(messagesTable.id, messageId),
          eq(messagesTable.conversationId, conversationId)
        )
      )
      .returning();

    if (!msg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    await db
      .update(conversationParticipantsTable)
      .set({ lastReadMessageId: messageId })
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, conversationId),
          eq(conversationParticipantsTable.userId, req.userId!)
        )
      );

    const [sender] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, msg.senderId));

    const formatted = formatMessage(msg, sender);

    const io = getIO();
    io.to(`conversation:${conversationId}`).emit("message:status", {
      messageId: msg.id,
      status: "read",
      readAt: msg.readAt?.toISOString(),
    });
    io.to(`user:${msg.senderId}`).emit("message:status", {
      messageId: msg.id,
      status: "read",
      readAt: msg.readAt?.toISOString(),
    });

    res.json(formatted);
  }
);

router.post(
  "/conversations/:conversationId/read-all",
  authenticate,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;
    const conversationId = parseInt(raw, 10);

    const isMember = await checkParticipant(conversationId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a participant" });
      return;
    }

    const updatedMessages = await db
      .update(messagesTable)
      .set({ status: "read", readAt: new Date() })
      .where(
        and(
          eq(messagesTable.conversationId, conversationId),
          sql`${messagesTable.senderId} != ${req.userId!}`,
          sql`${messagesTable.status} != 'read'`,
          sql`${messagesTable.deletedAt} IS NULL`
        )
      )
      .returning();

    if (updatedMessages.length > 0) {
      const lastMsgId = Math.max(...updatedMessages.map((m) => m.id));
      await db
        .update(conversationParticipantsTable)
        .set({ lastReadMessageId: lastMsgId })
        .where(
          and(
            eq(conversationParticipantsTable.conversationId, conversationId),
            eq(conversationParticipantsTable.userId, req.userId!)
          )
        );

      const io = getIO();
      for (const msg of updatedMessages) {
        io.to(`user:${msg.senderId}`).emit("message:status", {
          messageId: msg.id,
          status: "read",
          readAt: msg.readAt?.toISOString(),
        });
      }
    }

    res.json({ success: true });
  }
);

export default router;
