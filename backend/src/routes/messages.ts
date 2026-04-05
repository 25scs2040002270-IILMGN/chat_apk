import { Router, type IRouter } from "express";
import { User, Conversation, Message, nextId } from "../lib/mongo";
import { authenticate } from "../middlewares/authenticate";
import { getIO, isUserOnline } from "../lib/socket";

const router: IRouter = Router();

const MESSAGE_AUTO_DELETE_HOURS = 8;

function formatUserPublic(user: InstanceType<typeof User>) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    isOnline: isUserOnline(user.id),
    lastSeen: user.lastSeen?.toISOString() ?? null,
  };
}

function formatMessage(msg: InstanceType<typeof Message>, sender: InstanceType<typeof User>) {
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
  const conv = await Conversation.findOne({
    id: conversationId,
    "participants.userId": userId,
  });
  return !!conv;
}

async function cleanupExpiredMessages(conversationId: number): Promise<void> {
  const cutoff = new Date(Date.now() - MESSAGE_AUTO_DELETE_HOURS * 60 * 60 * 1000);
  await Message.updateMany(
    {
      conversationId,
      status: "read",
      readAt: { $ne: null, $lt: cutoff },
      deletedAt: null,
    },
    { $set: { deletedAt: new Date() } }
  );
}

// GET messages
router.get(
  "/conversations/:conversationId/messages",
  authenticate,
  async (req, res): Promise<void> => {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    const isMember = await checkParticipant(conversationId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a participant of this conversation" });
      return;
    }

    await cleanupExpiredMessages(conversationId);

    const beforeId = req.query.before ? parseInt(req.query.before as string, 10) : null;
    const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 100);

    const query: Record<string, any> = { conversationId, deletedAt: null };
    if (beforeId) query.id = { $lt: beforeId };

    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit);
    messages.reverse();

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const senders = await User.find({ id: { $in: senderIds } });
    const senderMap = new Map(senders.map((u) => [u.id, u]));

    const result = messages.map((m) => {
      const sender = senderMap.get(m.senderId)!;
      return formatMessage(m, sender);
    });

    // Mark received messages as delivered
    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: req.userId! },
        status: "sent",
        deletedAt: null,
      },
      { $set: { status: "delivered" } }
    );

    res.json(result);
  }
);

// POST send message
router.post(
  "/conversations/:conversationId/messages",
  authenticate,
  async (req, res): Promise<void> => {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    const isMember = await checkParticipant(conversationId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a participant of this conversation" });
      return;
    }

    const { content, mediaUrl, mediaType } = req.body ?? {};
    if (!content && !mediaUrl) {
      res.status(400).json({ error: "Message must have content or media" });
      return;
    }

    const id = await nextId("messages");
    const msg = await Message.create({
      id,
      conversationId,
      senderId: req.userId!,
      content: content ?? null,
      mediaUrl: mediaUrl ?? null,
      mediaType: mediaType ?? null,
      status: "sent",
    });

    const sender = await User.findOne({ id: req.userId! });
    const formattedMsg = formatMessage(msg, sender!);

    const io = getIO();
    io.to(`conversation:${conversationId}`).emit("message:new", formattedMsg);

    const conv = await Conversation.findOne({ id: conversationId });
    if (conv) {
      for (const p of conv.participants) {
        if (p.userId !== req.userId) {
          io.to(`user:${p.userId}`).emit("message:new", formattedMsg);
        }
      }
    }

    res.status(201).json(formattedMsg);
  }
);

// POST mark single message as read
router.post(
  "/conversations/:conversationId/messages/:messageId/read",
  authenticate,
  async (req, res): Promise<void> => {
    const conversationId = parseInt(req.params.conversationId, 10);
    const messageId = parseInt(req.params.messageId, 10);

    const isMember = await checkParticipant(conversationId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a participant" });
      return;
    }

    const msg = await Message.findOneAndUpdate(
      { id: messageId, conversationId },
      { $set: { status: "read", readAt: new Date() } },
      { new: true }
    );

    if (!msg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    await Conversation.updateOne(
      { id: conversationId, "participants.userId": req.userId! },
      { $set: { "participants.$.lastReadMessageId": messageId } }
    );

    const sender = await User.findOne({ id: msg.senderId });
    const formatted = formatMessage(msg, sender!);

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

// POST mark all messages as read
router.post(
  "/conversations/:conversationId/read-all",
  authenticate,
  async (req, res): Promise<void> => {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    const isMember = await checkParticipant(conversationId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a participant" });
      return;
    }

    const updatedMessages = await Message.find({
      conversationId,
      senderId: { $ne: req.userId! },
      status: { $ne: "read" },
      deletedAt: null,
    });

    if (updatedMessages.length > 0) {
      const ids = updatedMessages.map((m) => m.id);
      await Message.updateMany(
        { id: { $in: ids } },
        { $set: { status: "read", readAt: new Date() } }
      );

      const lastMsgId = Math.max(...ids);
      await Conversation.updateOne(
        { id: conversationId, "participants.userId": req.userId! },
        { $set: { "participants.$.lastReadMessageId": lastMsgId } }
      );

      const io = getIO();
      for (const msg of updatedMessages) {
        io.to(`user:${msg.senderId}`).emit("message:status", {
          messageId: msg.id,
          status: "read",
          readAt: new Date().toISOString(),
        });
      }
    }

    res.json({ success: true });
  }
);

export default router;
