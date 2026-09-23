import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import Category from "@/models/Category";
import { updateCategorySchema } from "@/validations/category.validation";

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

async function getCategoryId(params: Promise<{ id: string }>) {
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
    getAdminUser(request);

    const categoryId = await getCategoryId(params);

    if (!categoryId) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid category ID",
        },
        { status: 400 },
      );
    }

    await connectDatabase();
    const category = await Category.findById(categoryId);

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message: "Category not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Category fetched successfully",
      data: serializeCategory(category),
    });
  } catch (error: unknown) {
    return handleCategoryError(error, "Category fetch failed");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    getAdminUser(request);

    const categoryId = await getCategoryId(params);

    if (!categoryId) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid category ID",
        },
        { status: 400 },
      );
    }

    const body: unknown = await request.json();
    const validationResult = updateCategorySchema.safeParse(body);

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

    if (Object.keys(validationResult.data).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "At least one category field is required",
        },
        { status: 400 },
      );
    }

    await connectDatabase();

    const { name } = validationResult.data;

    if (name !== undefined) {
      const duplicateCategory = await Category.findOne({
        name,
        _id: { $ne: categoryId },
      }).collation({
        locale: "en",
        strength: 2,
      });

      if (duplicateCategory) {
        return NextResponse.json(
          {
            success: false,
            message: "Category already exists",
          },
          { status: 409 },
        );
      }
    }

    const category = await Category.findByIdAndUpdate(
      categoryId,
      { $set: validationResult.data },
      { returnDocument: "after", runValidators: true },
    );

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message: "Category not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Category updated successfully",
      data: serializeCategory(category),
    });
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

    return handleCategoryError(error, "Category update failed");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    getAdminUser(request);

    const categoryId = await getCategoryId(params);

    if (!categoryId) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid category ID",
        },
        { status: 400 },
      );
    }

    await connectDatabase();
    const category = await Category.findByIdAndDelete(categoryId);

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message: "Category not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error: unknown) {
    return handleCategoryError(error, "Category deletion failed");
  }
}
