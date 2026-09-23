import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import User, { UserRole } from "@/models/User";

// Temporary diagnostic endpoint; remove it after the MongoDB diagnosis is complete.
export async function GET(request: Request) {
  const diagnosticSecret = process.env.ADMIN_DIAGNOSTIC_SECRET;
  const providedSecret = request.headers.get("x-admin-diagnostic-secret");

  if (!diagnosticSecret || providedSecret !== diagnosticSecret) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const connection = await connectToDatabase();
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminUser = adminEmail
      ? await User.findOne({ email: adminEmail }).select(
          "role isEmailVerified",
        )
      : null;
    const isAdmin = adminUser?.role === UserRole.ADMIN;

    return NextResponse.json({
      environment: "production",
      databaseName: connection.connection.db?.databaseName ?? null,
      adminUserExists: isAdmin,
      adminRole: isAdmin ? UserRole.ADMIN : null,
      adminEmailVerified: isAdmin ? Boolean(adminUser.isEmailVerified) : null,
    });
  } catch {
    return NextResponse.json(
      { message: "Diagnostic unavailable" },
      { status: 500 },
    );
  }
}