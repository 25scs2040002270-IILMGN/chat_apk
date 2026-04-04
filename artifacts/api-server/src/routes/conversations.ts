import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, count, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/authenticate";
import { CreateConversationBody } from "@workspace/api-zod";
import { getIO, isUserOnline } from "../lib/socket";

const router: IRouter = Router();

function formatUserPublic(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    isOnline: isUserOnline(user.id),
    lastSeen: user.lastSeen?.toISOString() ?? null,
  };
}

async function getConversationWithMeta(conversationId: number, currentUserId: number) {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId));

  if (!conv) return null;

  const participantRows = await db
    .select()
    .from(conversationParticipantsTable)
    .innerJoin(usersTable, eq(conversationParticipantsTable.userId, usersTable.id))
    .where(eq(conversationParticipantsTable.conversationId, conversationId));

  const participants = participantRows.map((r) => formatUserPublic(r.users));

  const myParticipant = participantRows.find(
    (r) => r.conversation_participants.userId === currentUserId
  );
  const lastReadMessageId = myParticipant?.conversation_participants.lastReadMessageId ?? null;

  const lastMessages = await db
    .select()
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        sql`${messagesTable.deletedAt} IS NULL`
      )
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  const lastMessage = lastMessages[0]
    ? {
        id: lastMessages[0].messages.id,
        conversationId: lastMessages[0].messages.conversationId,
        senderId: lastMessages[0].messages.senderId,
        content: lastMessages[0].messages.content ?? null,
        mediaUrl: lastMessages[0].messages.mediaUrl ?? null,
        mediaType: lastMessages[0].messages.mediaType ?? null,
        status: lastMessages[0].messages.status,
        createdAt: lastMessages[0].messages.createdAt.toISOString(),
        readAt: lastMessages[0].messages.readAt?.toISOString() ?? null,
        sender: formatUserPublic(lastMessages[0].users),
      }
    : null;

  const [unreadResult] = await db
    .select({ count: count() })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        sql`${messagesTable.senderId} != ${currentUserId}`,
        sql`${messagesTable.deletedAt} IS NULL`,
        lastReadMessageId
          ? sql`${messagesTable.id} > ${lastReadMessageId}`
          : sql`TRUE`
      )
    );

  return {
    id: conv.id,
    name: conv.name ?? null,
    isGroup: conv.isGroup,
    avatarUrl: conv.avatarUrl ?? null,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    participants,
    lastMessage,
    unreadCount: unreadResult?.count ?? 0,
  };
}

router.get("/conversations", authenticate, async (req, res): Promise<void> => {
  const myParticipations = await db
    .select({ conversationId: conversationParticipantsTable.conversationId })
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, req.userId!));

  const convIds = myParticipations.map((p) => p.conversationId);
  if (convIds.length === 0) {
    res.json([]);
    return;
  }

  const convs = await Promise.all(
    convIds.map((id) => getConversationWithMeta(id, req.userId!))
  );

  const result = convs
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a!.lastMessage?.createdAt ?? a!.updatedAt;
      const bTime = b!.lastMessage?.createdAt ?? b!.updatedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  res.json(result);
});

router.post("/conversations", authenticate, async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { participantIds, name, isGroup } = parsed.data;
  const allParticipantIds = Array.from(new Set([req.userId!, ...participantIds]));

  if (!isGroup && allParticipantIds.length === 2) {
    const [otherId] = allParticipantIds.filter((id) => id !== req.userId);

    const existingParticipations = await db
      .select({ conversationId: conversationParticipantsTable.conversationId })
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.userId, req.userId!));

    const myConvIds = existingParticipations.map((p) => p.conversationId);

    if (myConvIds.length > 0) {
      const otherParticipations = await db
        .select({ conversationId: conversationParticipantsTable.conversationId })
        .from(conversationParticipantsTable)
        .innerJoin(
          conversationsTable,
          eq(conversationParticipantsTable.conversationId, conversationsTable.id)
        )
        .where(
          and(
            eq(conversationParticipantsTable.userId, otherId),
            inArray(conversationParticipantsTable.conversationId, myConvIds),
            eq(conversationsTable.isGroup, false)
          )
        );

      if (otherParticipations.length > 0) {
        const existing = await getConversationWithMeta(
          otherParticipations[0].conversation_participants.conversationId,
          req.userId!
        );
        res.status(201).json(existing);
        return;
      }
    }
  }

  const [conv] = await db
    .insert(conversationsTable)
    .values({
      name: name ?? null,
      isGroup: isGroup ?? false,
      createdBy: req.userId!,
    })
    .returning();

  await db.insert(conversationParticipantsTable).values(
    allParticipantIds.map((uid) => ({
      conversationId: conv.id,
      userId: uid,
    }))
  );

  const meta = await getConversationWithMeta(conv.id, req.userId!);

  const io = getIO();
  for (const uid of allParticipantIds) {
    io.to(`user:${uid}`).emit("conversation:new", meta);
  }

  res.status(201).json(meta);
});

router.get("/conversations/:conversationId", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  const [myParticipation] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(
      and(
        eq(conversationParticipantsTable.conversationId, conversationId),
        eq(conversationParticipantsTable.userId, req.userId!)
      )
    );

  if (!myParticipation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const meta = await getConversationWithMeta(conversationId, req.userId!);
  if (!meta) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(meta);
});

export default router;
