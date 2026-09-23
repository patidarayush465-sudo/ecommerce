import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI ?? "";

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI environment variable");
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

global.mongooseCache = cached;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).catch((error: unknown) => {
      cached.promise = null;
      throw new Error(
        `MongoDB connection failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
