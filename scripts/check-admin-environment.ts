import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function checkAdminEnvironment(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  console.log("environment: local");
  console.log(`ADMIN_EMAIL exists: ${adminEmail ? "yes" : "no"}`);

  if (!adminEmail || !process.env.MONGODB_URI?.trim()) {
    console.log("database name: unavailable");
    console.log("ADMIN user exists: not checked");
    console.log("admin role: not checked");
    console.log("admin isEmailVerified: not checked");
    return;
  }

  // Node's standalone ESM resolver needs the explicit .ts extension here.
  // @ts-expect-error The Node diagnostic command resolves the TypeScript extension at runtime.
  const { connectToDatabase } = await import("../src/lib/mongodb.ts");
  // @ts-expect-error The Node diagnostic command resolves the TypeScript extension at runtime.
  const { default: User } = await import("../src/models/User.ts");

  const connection = await connectToDatabase();
  const databaseName = connection.connection.db?.databaseName;
  const adminUser = await User.findOne({ email: adminEmail }).select(
    "role isEmailVerified",
  );

  console.log(`database name: ${databaseName ?? "unavailable"}`);
  console.log(`ADMIN user exists: ${adminUser ? "yes" : "no"}`);
  console.log(`admin role: ${adminUser?.role ?? "not found"}`);
  console.log(
    `admin isEmailVerified: ${adminUser ? (adminUser.isEmailVerified ? "true" : "false") : "not found"}`,
  );
}

checkAdminEnvironment()
  .catch(() => {
    console.error(
      "Admin environment check failed. Verify the local environment configuration.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });