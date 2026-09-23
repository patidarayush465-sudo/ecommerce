import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import Address from "@/models/Address";
import { UserRole } from "@/models/User";
import { updateAddressSchema } from "@/validations/address.validation";

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

async function getAddressId(params: Promise<{ id: string }>) {
  const { id } = await params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  return id;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const addressId = await getAddressId(params);

    if (!addressId) {
      return NextResponse.json(
        { success: false, message: "Invalid address ID" },
        { status: 400 },
      );
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const address = await Address.findOne({ _id: addressId, user: userId });

    if (!address) {
      return NextResponse.json(
        { success: false, message: "Address not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Address fetched successfully",
      data: serializeAddress(address),
    });
  } catch (error: unknown) {
    return handleAddressError(error, "Address fetch failed");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const addressId = await getAddressId(params);

    if (!addressId) {
      return NextResponse.json(
        { success: false, message: "Invalid address ID" },
        { status: 400 },
      );
    }

    const body: unknown = await request.json();
    const validationResult = updateAddressSchema.safeParse(body);

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

    const updateData = { ...validationResult.data };

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one address field is required" },
        { status: 400 },
      );
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const address = await Address.findOne({ _id: addressId, user: userId });

    if (!address) {
      return NextResponse.json(
        { success: false, message: "Address not found" },
        { status: 404 },
      );
    }

    if (updateData.isDefault === true) {
      await Address.updateMany(
        { user: userId, _id: { $ne: addressId } },
        { $set: { isDefault: false } },
      );
    } else if (updateData.isDefault === false && address.isDefault) {
      updateData.isDefault = true;
    }

    Object.assign(address, updateData);
    await address.save();

    return NextResponse.json({
      success: true,
      message: "Address updated successfully",
      data: serializeAddress(address),
    });
  } catch (error: unknown) {
    return handleAddressError(error, "Address update failed");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const addressId = await getAddressId(params);

    if (!addressId) {
      return NextResponse.json(
        { success: false, message: "Invalid address ID" },
        { status: 400 },
      );
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const address = await Address.findOne({ _id: addressId, user: userId });

    if (!address) {
      return NextResponse.json(
        { success: false, message: "Address not found" },
        { status: 404 },
      );
    }

    const wasDefault = address.isDefault;
    await address.deleteOne();

    if (wasDefault) {
      const newestRemainingAddress = await Address.findOne({ user: userId }).sort({
        createdAt: -1,
      });

      if (newestRemainingAddress) {
        newestRemainingAddress.isDefault = true;
        await newestRemainingAddress.save();
      }
    }

    return NextResponse.json({
      success: true,
      message: "Address deleted successfully",
      data: { id: addressId },
    });
  } catch (error: unknown) {
    return handleAddressError(error, "Address deletion failed");
  }
}