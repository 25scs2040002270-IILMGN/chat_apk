import mongoose, { Schema, Document, Model } from "mongoose";
import { logger } from "./logger";

// ─── Connection ──────────────────────────────────────────────────────────────

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri, { dbName: "krichat" });
  logger.info("Connected to MongoDB Atlas");
}

// ─── Auto-increment helper ───────────────────────────────────────────────────

interface CounterDoc extends Document {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>({ _id: String, seq: { type: Number, default: 0 } });
const Counter: Model<CounterDoc> =
  mongoose.models.Counter || mongoose.model<CounterDoc>("Counter", counterSchema);

export async function nextId(name: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc!.seq;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface IUser extends Document {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeen: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema);

// ─── Conversation ─────────────────────────────────────────────────────────────

interface IParticipant {
  userId: number;
  joinedAt: Date;
  lastReadMessageId: number | null;
}

export interface IConversation extends Document {
  id: number;
  name: string | null;
  isGroup: boolean;
  avatarUrl: string | null;
  createdBy: number;
  participants: IParticipant[];
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, default: null },
    isGroup: { type: Boolean, default: false },
    avatarUrl: { type: String, default: null },
    createdBy: { type: Number, required: true },
    participants: [
      {
        userId: Number,
        joinedAt: { type: Date, default: Date.now },
        lastReadMessageId: { type: Number, default: null },
      },
    ],
  },
  { timestamps: true }
);

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", conversationSchema);

// ─── Message ──────────────────────────────────────────────────────────────────

export interface IMessage extends Document {
  id: number;
  conversationId: number;
  senderId: number;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  status: "sent" | "delivered" | "read";
  createdAt: Date;
  readAt: Date | null;
  deletedAt: Date | null;
}

const messageSchema = new Schema<IMessage>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    conversationId: { type: Number, required: true, index: true },
    senderId: { type: Number, required: true },
    content: { type: String, default: null },
    mediaUrl: { type: String, default: null },
    mediaType: { type: String, default: null },
    status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
    readAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);
