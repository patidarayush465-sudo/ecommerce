import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });
dotenv.config();

const ADMIN_SALT_ROUNDS = 12;

function promptForPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("A TTY is required to enter the new password securely");
  }

  return new Promise((resolve, reject) => {
    let password = "";

    process.stdout.write("Enter new admin password: ");
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.removeListener("data", handleInput);
    };

    const handleInput = (input: Buffer) => {
      const character = input.toString("utf8");

      if (character === "\u0003") {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("Password reset cancelled"));
        return;
      }

      if (character === "\r" || character === "\n") {
        cleanup();
        process.stdout.write("\n");

        if (!password) {
          reject(new Error("Password cannot be empty"));
          return;
        }

        resolve(password);
        return;
      }

      if (character === "\u007f" || character === "\b") {
        password = password.slice(0, -1);
        return;
      }

      password += character;
    };

    process.stdin.on("data", handleInput);
  });
}

async function resetAdminPassword(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL must be configured");
  }

  const mongodbUri = process.env.MONGODB_URI?.trim();

  if (!mongodbUri) {
    throw new Error("MONGODB_URI must be configured");
  }

  // Node's standalone ESM resolver needs the explicit .ts extension here.
  // @ts-expect-error The Node seed command resolves the TypeScript extension at runtime.
  const { default: User, UserRole } = await import("../src/models/User.ts");

  await mongoose.connect(mongodbUri);

  const existingUser = await User.findOne({ email: adminEmail }).select(
    "_id role",
  );

  if (!existingUser) {
    console.log("No user found for the configured admin email.");
    return;
  }

  if (existingUser.role !== UserRole.ADMIN) {
    console.log("The configured email does not belong to an admin user. No changes were made.");
    return;
  }

  const newPassword = await promptForPassword();
  const hashedPassword = await bcrypt.hash(newPassword, ADMIN_SALT_ROUNDS);

  await User.updateOne(
    { _id: existingUser._id },
    { $set: { password: hashedPassword } },
    { timestamps: false },
  );

  console.log("Admin password updated successfully.");
}

resetAdminPassword()
  .catch((error: unknown) => {
    console.error(
      "Admin password reset failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });