import { Router, type IRouter } from "express";
import { User } from "../lib/mongo";
import { authenticate } from "../middlewares/authenticate";
import { isUserOnline } from "../lib/socket";

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

function formatUser(user: InstanceType<typeof User>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    isOnline: isUserOnline(user.id),
    lastSeen: user.lastSeen?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/users/search", authenticate, async (req, res): Promise<void> => {
  const q = req.query.q as string;
  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: "Query parameter q is required" });
    return;
  }

  const regex = new RegExp(q.trim(), "i");
  const users = await User.find({
    $or: [{ name: regex }, { email: regex }],
    id: { $ne: req.userId! },
  }).limit(20);

  res.json(users.map(formatUserPublic));
});

router.get("/users/:userId", authenticate, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const user = await User.findOne({ id: userId });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUserPublic(user));
});

router.patch("/users/:userId/profile", authenticate, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);

  if (userId !== req.userId) {
    res.status(403).json({ error: "You can only update your own profile" });
    return;
  }

  const { name, avatarUrl } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (name != null) updates.name = name;
  if ("avatarUrl" in (req.body ?? {})) updates.avatarUrl = avatarUrl ?? null;

  const user = await User.findOneAndUpdate(
    { id: userId },
    { $set: updates },
    { new: true }
  );

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

export default router;
