import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import Category from "@/models/Category";
import { createCategorySchema } from "@/validations/category.validation";

type CategoryRecord = {
  _id: { toString(): string };
  name: string;
  description?: string;
  isActive: boolean;
};

type DatabaseError = {
  code?: number;
};

function serializeCategory(category: CategoryRecord) {
  return {
    id: category._id.toString(),
    name: category.name,
    description: category.description,
    isActive: category.isActive,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function connectDatabase() {
  const { connectToDatabase } = await import("@/lib/mongodb");
  await connectToDatabase();
}

function handleCategoryError(error: unknown, logMessage: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: error.status },
    );
  }

  console.error(logMessage, error);

  return NextResponse.json(
    {
      success: false,
      message: "Internal server error",
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    getAdminUser(request);

    const body: unknown = await request.json();
    const validationResult = createCategorySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid category data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    await connectDatabase();

    const { name, description } = validationResult.data;
    const existingCategory = await Category.findOne({ name }).collation({
      locale: "en",
      strength: 2,
    });

    if (existingCategory) {
      return NextResponse.json(
        {
          success: false,
          message: "Category already exists",
        },
        { status: 409 },
      );
    }

    const category = await Category.create({ name, description });

    return NextResponse.json(
      {
        success: true,
        message: "Category created successfully",
        data: serializeCategory(category),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request body",
        },
        { status: 400 },
      );
    }

    if ((error as DatabaseError).code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "Category already exists",
        },
        { status: 409 },
      );
    }

    return handleCategoryError(error, "Category creation failed");
  }
}

export async function GET(request: Request) {
  try {
    getAdminUser(request);

    const searchParams = new URL(request.url).searchParams;
    const requestedPage = Number(searchParams.get("page") ?? "1");
    const requestedLimit = Number(searchParams.get("limit") ?? "10");
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 10;
    const search = searchParams.get("search")?.trim() ?? "";
    const query = search
      ? { name: { $regex: escapeRegex(search), $options: "i" } }
      : {};
    const skip = (page - 1) * limit;

    await connectDatabase();

    const [categories, total] = await Promise.all([
      Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Category.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      message: "Categories fetched successfully",
      data: {
        categories: categories.map(serializeCategory),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: unknown) {
    return handleCategoryError(error, "Category listing failed");
  }
}
