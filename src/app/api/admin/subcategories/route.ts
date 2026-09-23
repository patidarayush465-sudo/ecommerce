import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import Category from "@/models/Category";
import SubCategory from "@/models/SubCategory";
import { createSubCategorySchema } from "@/validations/subcategory.validation";

type PopulatedCategory = {
  _id: { toString(): string };
  name: string;
};

type SubCategoryRecord = {
  _id: { toString(): string };
  name: string;
  description?: string;
  category: PopulatedCategory;
  isActive: boolean;
};

type DatabaseError = {
  code?: number;
};

function serializeSubCategory(subCategory: SubCategoryRecord) {
  return {
    id: subCategory._id.toString(),
    name: subCategory.name,
    description: subCategory.description,
    category: {
      id: subCategory.category._id.toString(),
      name: subCategory.category.name,
    },
    isActive: subCategory.isActive,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function connectDatabase() {
  const { connectToDatabase } = await import("@/lib/mongodb");
  await connectToDatabase();
}

function handleSubCategoryError(error: unknown, logMessage: string) {
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
    const validationResult = createSubCategorySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid subcategory data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    await connectDatabase();

    const { name, description, category } = validationResult.data;
    const parentCategory = await Category.findById(category).select("_id name");

    if (!parentCategory) {
      return NextResponse.json(
        {
          success: false,
          message: "Category not found",
        },
        { status: 404 },
      );
    }

    const existingSubCategory = await SubCategory.findOne({
      name,
      category,
    }).collation({
      locale: "en",
      strength: 2,
    });

    if (existingSubCategory) {
      return NextResponse.json(
        {
          success: false,
          message: "Subcategory already exists in this category",
        },
        { status: 409 },
      );
    }

    const subCategory = await SubCategory.create({
      name,
      description,
      category,
    });
    await subCategory.populate({ path: "category", select: "_id name" });

    return NextResponse.json(
      {
        success: true,
        message: "Subcategory created successfully",
        data: serializeSubCategory(subCategory),
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
          message: "Subcategory already exists in this category",
        },
        { status: 409 },
      );
    }

    return handleSubCategoryError(error, "Subcategory creation failed");
  }
}

export async function GET(request: Request) {
  try {
    getAdminUser(request);

    const searchParams = new URL(request.url).searchParams;
    const requestedPage = Number(searchParams.get("page") ?? "1");
    const requestedLimit = Number(searchParams.get("limit") ?? "10");
    const page =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 10;
    const search = searchParams.get("search")?.trim() ?? "";
    const categoryId = searchParams.get("category")?.trim() ?? "";

    if (categoryId && !/^[a-f\d]{24}$/i.test(categoryId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid category ID",
        },
        { status: 400 },
      );
    }

    const query: Record<string, unknown> = {};

    if (search) {
      query.name = { $regex: escapeRegex(search), $options: "i" };
    }

    if (categoryId) {
      query.category = categoryId;
    }

    const skip = (page - 1) * limit;

    await connectDatabase();

    const [subCategories, total] = await Promise.all([
      SubCategory.find(query)
        .populate({ path: "category", select: "_id name" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubCategory.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      message: "Subcategories fetched successfully",
      data: {
        subcategories: subCategories.map(serializeSubCategory),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: unknown) {
    return handleSubCategoryError(error, "Subcategory listing failed");
  }
}
