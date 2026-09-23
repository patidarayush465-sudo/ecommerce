import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import User, { UserRole } from "@/models/User";

const SORT_FIELDS = new Set(["createdAt", "updatedAt", "name", "email"]);
const ROLES = new Set(Object.values(UserRole));

type SafeUser = {
  _id: { toString(): string };
  name: string;
  email: string;
  mobile?: string;
  role: UserRole;
  isEmailVerified: boolean;
  profileImage?: { url?: string };
  createdAt: Date;
  updatedAt: Date;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeUser(user: SafeUser) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    mobile: user.mobile ?? "",
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    profileImage: user.profileImage?.url ?? "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function handleUsersError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }

  console.error("Admin users fetch failed", error);
  return NextResponse.json({ success: false, message: "Unable to load users" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    getAdminUser(request);
    const searchParams = new URL(request.url).searchParams;
    const page = Number(searchParams.get("page") ?? "1");
    const requestedLimit = Number(searchParams.get("limit") ?? "10");
    const sortBy = searchParams.get("sortBy") ?? "createdAt";
    const sortOrder = searchParams.get("sortOrder") ?? "desc";
    const search = searchParams.get("search")?.trim() ?? "";
    const role = searchParams.get("role")?.trim() ?? "";
    const verification = searchParams.get("isEmailVerified")?.trim() ?? "";

    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return NextResponse.json({ success: false, message: "Page and limit must be positive integers" }, { status: 400 });
    }
    if (!SORT_FIELDS.has(sortBy) || (sortOrder !== "asc" && sortOrder !== "desc")) {
      return NextResponse.json({ success: false, message: "Invalid sorting parameters" }, { status: 400 });
    }
    if (role && !ROLES.has(role as UserRole)) {
      return NextResponse.json({ success: false, message: "Invalid role filter" }, { status: 400 });
    }
    if (verification && verification !== "true" && verification !== "false") {
      return NextResponse.json({ success: false, message: "Invalid email verification filter" }, { status: 400 });
    }

    await connectToDatabase();
    const limit = Math.min(requestedLimit, 50);
    const query: Record<string, unknown> = { role: UserRole.CUSTOMER };
    if (verification) query.isEmailVerified = verification === "true";
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");
      query.$or = [{ name: searchRegex }, { email: searchRegex }, { mobile: searchRegex }];
    }

    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const safeProjection = "_id name email mobile role isEmailVerified profileImage createdAt updatedAt";
    const [users, total, totalUsers, customers, admins, verifiedCustomers] = await Promise.all([
      User.find(query).select(safeProjection).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(query),
      User.countDocuments(),
      User.countDocuments({ role: UserRole.CUSTOMER }),
      User.countDocuments({ role: UserRole.ADMIN }),
      User.countDocuments({ role: UserRole.CUSTOMER, isEmailVerified: true }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users: (users as SafeUser[]).map(serializeUser),
        stats: { totalUsers, customers, admins, verifiedCustomers },
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error: unknown) {
    return handleUsersError(error);
  }
}
