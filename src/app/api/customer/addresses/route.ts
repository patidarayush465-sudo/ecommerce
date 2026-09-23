import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import Address from "@/models/Address";
import { UserRole } from "@/models/User";
import { createAddressSchema } from "@/validations/address.validation";

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

function handleAddressError(error: unknown, logMessage: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  console.error(logMessage, error);

  return NextResponse.json(
    { success: false, message: "Internal server error" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const { connectToDatabase } = await import("@/lib/mongodb");

    await connectToDatabase();

    const addresses = await Address.find({ user: userId })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      message: "Addresses fetched successfully",
      data: addresses.map(serializeAddress),
    });
  } catch (error: unknown) {
    return handleAddressError(error, "Address listing failed");
  }
}

export async function POST(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body: unknown = await request.json();
    const validationResult = createAddressSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid address data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const addressCount = await Address.countDocuments({ user: userId });
    const shouldBeDefault = addressCount === 0 || validationResult.data.isDefault;

    if (shouldBeDefault) {
      await Address.updateMany({ user: userId }, { $set: { isDefault: false } });
    }

    const address = await Address.create({
      ...validationResult.data,
      user: userId,
      isDefault: shouldBeDefault,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Address created successfully",
        data: serializeAddress(address),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleAddressError(error, "Address creation failed");
  }
}