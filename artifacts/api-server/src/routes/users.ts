import { Router, type IRouter } from "express";
import { eq, or, ilike } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authenticate } from "../middlewares/authenticate";
import { UpdateProfileBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatUserPublic(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen?.toISOString() ?? null,
  };
}

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    isOnline: user.isOnline,
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

  const users = await db
    .select()
    .from(usersTable)
    .where(
      or(
        ilike(usersTable.name, `%${q}%`),
        ilike(usersTable.email, `%${q}%`)
      )
    )
    .limit(20);

  const filtered = users.filter((u) => u.id !== req.userId);
  res.json(filtered.map(formatUserPublic));
});

router.get("/users/:userId", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUserPublic(user));
});

router.patch("/users/:userId/profile", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);

  if (userId !== req.userId) {
    res.status(403).json({ error: "You can only update your own profile" });
    return;
  }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<{ name: string; avatarUrl: string | null }> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if ("avatarUrl" in parsed.data) updates.avatarUrl = parsed.data.avatarUrl ?? null;

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning();

  res.json(formatUser(user));
});

export default router;
