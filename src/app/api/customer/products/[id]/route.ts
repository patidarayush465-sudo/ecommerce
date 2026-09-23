import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import "@/models/Category";
import Product from "@/models/Product";
import "@/models/SubCategory";
import { getProductPricing } from "@/services/pricing.service";

type PopulatedReference = {
  _id: { toString(): string };
  name: string;
};

type CustomerProduct = {
  _id: { toString(): string };
  name: string;
  description: string;
  price?: number;
  mrp?: number;
  discountPercent?: number;
  sellingPrice?: number;
  stock: number;
  images: Array<{ url: string; publicId: string }>;
  category: PopulatedReference;
  subcategory: PopulatedReference;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== "CUSTOMER") {
    throw new AuthorizationError("Customer access required");
  }
}

function serializeProduct(product: CustomerProduct) {
  const pricing = getProductPricing(product);
  return {
    _id: product._id.toString(),
    name: product.name,
    description: product.description,
    mrp: pricing.mrp,
    discountPercent: pricing.discountPercent,
    sellingPrice: pricing.sellingPrice,
    price: pricing.sellingPrice,
    stock: product.stock,
    images: product.images,
    category: {
      _id: product.category._id.toString(),
      name: product.category.name,
    },
    subcategory: {
      _id: product.subcategory._id.toString(),
      name: product.subcategory.name,
    },
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

async function connectDatabase() {
  const { connectToDatabase } = await import("@/lib/mongodb");
  await connectToDatabase();
}

function handleProductError(error: unknown, logMessage: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  console.error(logMessage, error);

  return NextResponse.json(
    { success: false, message: "Internal server error" },
    { status: 500 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    authenticateCustomer(request);

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID" },
        { status: 400 },
      );
    }

    await connectDatabase();

    const product = await Product.findOne({
      _id: id,
      isActive: true,
    })
      .populate([
        { path: "category", select: "_id name" },
        { path: "subcategory", select: "_id name" },
      ])
      .lean();

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product fetched successfully",
      data: serializeProduct(product),
    });
  } catch (error: unknown) {
    return handleProductError(error, "Customer product fetch failed");
  }
}
