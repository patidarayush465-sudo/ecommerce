import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });
dotenv.config();

const ADMIN_SALT_ROUNDS = 12;

async function createAdmin(): Promise<void> {
  const adminName = process.env.ADMIN_NAME?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminName || !adminEmail || !adminPassword) {
    throw new Error(
      "ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be configured",
    );
  }

  const mongodbUri = process.env.MONGODB_URI?.trim();

  if (!mongodbUri) {
    throw new Error("MONGODB_URI must be configured");
  }

  // Node's standalone ESM resolver needs the explicit .ts extension here.
  // @ts-expect-error The Node seed command resolves the TypeScript extension at runtime.
  const { default: User, UserRole } = await import("../src/models/User.ts");

  await mongoose.connect(mongodbUri);

  const existingAdmin = await User.findOne({
    email: adminEmail,
    role: UserRole.ADMIN,
  }).select("_id");

  if (existingAdmin) {
    console.log("Admin already exists. No admin was created.");
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, ADMIN_SALT_ROUNDS);

  await User.create({
    name: adminName,
    email: adminEmail,
    password: hashedPassword,
    role: UserRole.ADMIN,
    isEmailVerified: true,
  });

  console.log("Admin user created successfully.");
}

createAdmin()
  .catch((error: unknown) => {
    console.error(
      "Admin creation failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
