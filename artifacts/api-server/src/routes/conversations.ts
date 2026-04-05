import { Router, type IRouter } from "express";
import { User, Conversation, Message, nextId } from "../lib/mongo";
import { authenticate } from "../middlewares/authenticate";
import { getIO, isUserOnline } from "../lib/socket";

const router: IRouter = Router();

function formatUserPublic(user: InstanceType<typeof User>) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    isOnline: isUserOnline(user.id),
    lastSeen: user.lastSeen?.toISOString() ?? null,
  };
}

async function getConversationWithMeta(conversationId: number, currentUserId: number) {
  const conv = await Conversation.findOne({ id: conversationId });
  if (!conv) return null;

  // Load all participant users
  const participantUserIds = conv.participants.map((p) => p.userId);
  const participantUsers = await User.find({ id: { $in: participantUserIds } });
  const userMap = new Map(participantUsers.map((u) => [u.id, u]));

  const participants = participantUsers.map(formatUserPublic);

  const myParticipant = conv.participants.find((p) => p.userId === currentUserId);
  const lastReadMessageId = myParticipant?.lastReadMessageId ?? null;

  // Last message
  const lastMessageDoc = await Message.findOne({
    conversationId,
    deletedAt: null,
  }).sort({ createdAt: -1 });

  let lastMessage = null;
  if (lastMessageDoc) {
    const sender = userMap.get(lastMessageDoc.senderId);
    if (sender) {
      lastMessage = {
        id: lastMessageDoc.id,
        conversationId: lastMessageDoc.conversationId,
        senderId: lastMessageDoc.senderId,
        content: lastMessageDoc.content ?? null,
        mediaUrl: lastMessageDoc.mediaUrl ?? null,
        mediaType: lastMessageDoc.mediaType ?? null,
        status: lastMessageDoc.status,
        createdAt: lastMessageDoc.createdAt.toISOString(),
        readAt: lastMessageDoc.readAt?.toISOString() ?? null,
        sender: formatUserPublic(sender),
      };
    }
  }

  // Unread count
  const unreadQuery: Record<string, any> = {
    conversationId,
    senderId: { $ne: currentUserId },
    deletedAt: null,
  };
  if (lastReadMessageId) {
    unreadQuery.id = { $gt: lastReadMessageId };
  }
  const unreadCount = await Message.countDocuments(unreadQuery);

  return {
    id: conv.id,
    name: conv.name ?? null,
    isGroup: conv.isGroup,
    avatarUrl: conv.avatarUrl ?? null,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    participants,
    lastMessage,
    unreadCount,
  };
}

router.get("/conversations", authenticate, async (req, res): Promise<void> => {
  const myConvs = await Conversation.find({ "participants.userId": req.userId! });

  const results = await Promise.all(
    myConvs.map((c) => getConversationWithMeta(c.id, req.userId!))
  );

  const sorted = results
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a!.lastMessage?.createdAt ?? a!.updatedAt;
      const bTime = b!.lastMessage?.createdAt ?? b!.updatedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  res.json(sorted);
});

router.post("/conversations", authenticate, async (req, res): Promise<void> => {
  const { participantIds, name, isGroup } = req.body ?? {};

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    res.status(400).json({ error: "participantIds must be a non-empty array" });
    return;
  }

  const allParticipantIds: number[] = Array.from(
    new Set([req.userId!, ...participantIds.map(Number)])
  );

  // Deduplication for 1:1 chats
  if (!isGroup && allParticipantIds.length === 2) {
    const [otherId] = allParticipantIds.filter((id) => id !== req.userId);
    const existing = await Conversation.findOne({
      isGroup: false,
      "participants.userId": { $all: [req.userId!, otherId] },
      $expr: { $eq: [{ $size: "$participants" }, 2] },
    });

    if (existing) {
      const meta = await getConversationWithMeta(existing.id, req.userId!);
      res.status(201).json(meta);
      return;
    }
  }

  const id = await nextId("conversations");
  const conv = await Conversation.create({
    id,
    name: name ?? null,
    isGroup: isGroup ?? false,
    createdBy: req.userId!,
    participants: allParticipantIds.map((uid) => ({
      userId: uid,
      joinedAt: new Date(),
      lastReadMessageId: null,
    })),
  });

  const meta = await getConversationWithMeta(conv.id, req.userId!);

  const io = getIO();
  for (const uid of allParticipantIds) {
    io.to(`user:${uid}`).emit("conversation:new", meta);
  }

  res.status(201).json(meta);
});

router.get("/conversations/:conversationId", authenticate, async (req, res): Promise<void> => {
  const conversationId = parseInt(req.params.conversationId, 10);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const conv = await Conversation.findOne({
    id: conversationId,
    "participants.userId": req.userId!,
  });

  if (!conv) {
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
