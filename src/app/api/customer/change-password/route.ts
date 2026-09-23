import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import User, { UserRole } from "@/models/User";
import { customerChangePasswordSchema } from "@/validations/auth.validation";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }
  return authUser.userId;
}

function handleChangePasswordError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }
  console.error("Customer password change failed", error);
  return NextResponse.json(
    { success: false, message: "Unable to change password right now." },
    { status: 500 },
  );
}

export async function PATCH(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body: unknown = await request.json();
    const validationResult = customerChangePasswordSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid password data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    await connectToDatabase();
    const user = await User.findOne({
      _id: userId,
      role: UserRole.CUSTOMER,
    }).select("+password +passwordResetToken +passwordResetExpires");

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    const { currentPassword, newPassword } = validationResult.data;
    const currentPasswordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!currentPasswordMatches) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 401 },
      );
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      return NextResponse.json(
        {
          success: false,
          message: "New password must be different from your current password.",
        },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await User.updateOne(
      { _id: userId, role: UserRole.CUSTOMER },
      {
        $set: { password: passwordHash },
        $unset: { passwordResetToken: 1, passwordResetExpires: 1 },
      },
    );

    return NextResponse.json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 },
      );
    }
    return handleChangePasswordError(error);
  }
}