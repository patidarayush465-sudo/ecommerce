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

const ALLOWED_SORT_FIELDS = new Set(["sellingPrice", "createdAt", "name"]);
const ALLOWED_SORT_ORDERS = new Set(["asc", "desc"]);

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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export async function GET(request: Request) {
  try {
    authenticateCustomer(request);

    const searchParams = new URL(request.url).searchParams;
    const pageValue = searchParams.get("page") ?? "1";
    const limitValue = searchParams.get("limit") ?? "10";
    const page = Number(pageValue);
    const requestedLimit = Number(limitValue);
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : null;
    const search = searchParams.get("search")?.trim() ?? "";
    const category = searchParams.get("category")?.trim() ?? "";
    const subcategory = searchParams.get("subcategory")?.trim() ?? "";
    const sortBy = searchParams.get("sortBy") ?? "createdAt";
    const sortOrder = searchParams.get("sortOrder") ?? "desc";

    if (!Number.isInteger(page) || page < 1 || limit === null) {
      return NextResponse.json(
        { success: false, message: "Invalid pagination parameters" },
        { status: 400 },
      );
    }

    if (!ALLOWED_SORT_FIELDS.has(sortBy) || !ALLOWED_SORT_ORDERS.has(sortOrder)) {
      return NextResponse.json(
        { success: false, message: "Invalid sorting parameters" },
        { status: 400 },
      );
    }

    if (
      (category && !mongoose.Types.ObjectId.isValid(category)) ||
      (subcategory && !mongoose.Types.ObjectId.isValid(subcategory))
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid category or subcategory ID" },
        { status: 400 },
      );
    }

    const query: Record<string, unknown> = { isActive: true };

    if (search) {
      const searchRegex = { $regex: escapeRegex(search), $options: "i" };
      query.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    if (category) {
      query.category = category;
    }

    if (subcategory) {
      query.subcategory = subcategory;
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const skip = (page - 1) * limit;

    await connectDatabase();

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate([
          { path: "category", select: "_id name" },
          { path: "subcategory", select: "_id name" },
        ])
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      message: "Products fetched successfully",
      data: products.map(serializeProduct),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return handleProductError(error, "Customer product listing failed");
  }
}
