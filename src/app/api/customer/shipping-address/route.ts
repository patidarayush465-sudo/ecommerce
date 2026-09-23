import mongoose from "mongoose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import Address from "@/models/Address";
import { UserRole } from "@/models/User";

const SHIPPING_ADDRESS_COOKIE = "customer_shipping_address";
const SHIPPING_ADDRESS_MAX_AGE_SECONDS = 24 * 60 * 60;

const selectShippingAddressSchema = z
  .object({
    addressId: z.string().refine(
      (value) => mongoose.Types.ObjectId.isValid(value),
      "Must be a valid MongoDB ObjectId",
    ),
  })
  .strict();

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

function handleShippingAddressError(error: unknown, logMessage: string) {
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

function setShippingAddressCookie(response: NextResponse, addressId: string) {
  response.cookies.set(SHIPPING_ADDRESS_COOKIE, addressId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SHIPPING_ADDRESS_MAX_AGE_SECONDS,
  });
}

export async function GET(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const { connectToDatabase } = await import("@/lib/mongodb");

    await connectToDatabase();

    const cookieStore = await cookies();
    const selectedAddressId = cookieStore.get(SHIPPING_ADDRESS_COOKIE)?.value;
    const validSelectedAddressId = selectedAddressId &&
      mongoose.Types.ObjectId.isValid(selectedAddressId)
      ? selectedAddressId
      : null;
    let address = validSelectedAddressId
      ? await Address.findOne({ _id: validSelectedAddressId, user: userId })
      : null;

    if (!address) {
      address = await Address.findOne({ user: userId, isDefault: true });
    }

    if (!address) {
      return NextResponse.json(
        { success: false, message: "Please add a shipping address first" },
        { status: 404 },
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Shipping address fetched successfully",
      data: serializeAddress(address),
    });
    setShippingAddressCookie(response, address._id.toString());
    return response;
  } catch (error: unknown) {
    return handleShippingAddressError(error, "Shipping address fetch failed");
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body: unknown = await request.json();
    const validationResult = selectShippingAddressSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid shipping address data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const address = await Address.findOne({
      _id: validationResult.data.addressId,
      user: userId,
    });

    if (!address) {
      return NextResponse.json(
        { success: false, message: "Address not found" },
        { status: 404 },
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Shipping address selected successfully",
      data: serializeAddress(address),
    });
    setShippingAddressCookie(response, address._id.toString());
    return response;
  } catch (error: unknown) {
    return handleShippingAddressError(error, "Shipping address selection failed");
  }
}