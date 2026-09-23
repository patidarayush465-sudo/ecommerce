import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import User, { UserRole } from "@/models/User";

// TEMPORARY: remove this endpoint after the production login diagnosis is complete.
export async function POST(request: Request) {
  const diagnosticSecret = process.env.ADMIN_DIAGNOSTIC_SECRET;
  const providedSecret = request.headers.get("x-admin-diagnostic-secret");

  if (!diagnosticSecret || providedSecret !== diagnosticSecret) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const body: unknown = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      !("password" in body) ||
      typeof body.password !== "string"
    ) {
      return NextResponse.json(
        { userExists: false, roleIsAdmin: false, passwordMatches: false },
        { status: 400 },
      );
    }

    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

    if (!adminEmail) {
      return NextResponse.json(
        { userExists: false, roleIsAdmin: false, passwordMatches: false },
        { status: 500 },
      );
    }

    await connectToDatabase();

    const adminUser = await User.findOne({ email: adminEmail }).select(
      "+password role",
    );

    if (!adminUser) {
      return NextResponse.json(
        { userExists: false, roleIsAdmin: false, passwordMatches: false },
        { status: 404 },
      );
    }

    const roleIsAdmin = adminUser.role === UserRole.ADMIN;

    if (!roleIsAdmin) {
      return NextResponse.json(
        { userExists: true, roleIsAdmin: false, passwordMatches: false },
        { status: 403 },
      );
    }

    const matches = await bcrypt.compare(body.password, adminUser.password);

    return NextResponse.json({
      userExists: true,
      roleIsAdmin: true,
      passwordMatches: matches,
    });
  } catch {
    return NextResponse.json(
      { userExists: false, roleIsAdmin: false, passwordMatches: false },
      { status: 500 },
    );
  }
}