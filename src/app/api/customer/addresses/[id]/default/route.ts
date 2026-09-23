import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import Address from "@/models/Address";
import { UserRole } from "@/models/User";

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

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }

  return authUser.userId;
}

function serializeAddress(address: AddressRecord) {
  return {
    id: address._id.toString(),
    fullName: address.fullName,
    mobile: address.mobile,
    addressLine: address.addressLine,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    country: address.country,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}

function handleAddressError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  console.error("Default address update failed", error);

  return NextResponse.json(
    { success: false, message: "Internal server error" },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid address ID" },
        { status: 400 },
      );
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const address = await Address.findOne({ _id: id, user: userId });

    if (!address) {
      return NextResponse.json(
        { success: false, message: "Address not found" },
        { status: 404 },
      );
    }

    await Address.updateMany(
      { user: userId, _id: { $ne: id } },
      { $set: { isDefault: false } },
    );
    address.isDefault = true;
    await address.save();

    return NextResponse.json({
      success: true,
      message: "Default address updated successfully",
      data: serializeAddress(address),
    });
  } catch (error: unknown) {
    return handleAddressError(error);
  }
}