import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Address from "@/models/Address";
import User from "@/models/User";

type AddressRecord = {
  _id: { toString(): string };
  fullName: string;
  mobile: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }

  console.error("Admin user addresses fetch failed", error);
  return NextResponse.json({ success: false, message: "Unable to load addresses" }, { status: 500 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    getAdminUser(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }

    await connectToDatabase();
    const userExists = await User.exists({ _id: id });
    if (!userExists) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const addresses = await Address.find({ user: id })
      .select("_id fullName mobile addressLine city state pincode country isDefault createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: addresses.map((address) => {
        const record = address as unknown as AddressRecord;
        return {
          _id: record._id.toString(),
          fullName: record.fullName,
          mobile: record.mobile,
          addressLine: record.addressLine,
          city: record.city,
          state: record.state,
          pincode: record.pincode,
          country: record.country,
          isDefault: record.isDefault,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      }),
    });
  } catch (error: unknown) {
    return handleError(error);
  }
}