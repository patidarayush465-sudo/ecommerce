import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import Category from "@/models/Category";
import SubCategory from "@/models/SubCategory";
import { updateSubCategorySchema } from "@/validations/subcategory.validation";

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

async function getSubCategoryId(params: Promise<{ id: string }>) {
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

    const subCategoryId = await getSubCategoryId(params);

    if (!subCategoryId) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid subcategory ID",
        },
        { status: 400 },
      );
    }

    await connectDatabase();

    const subCategory = await SubCategory.findById(subCategoryId)
      .populate({ path: "category", select: "_id name" })
      .lean();

    if (!subCategory) {
      return NextResponse.json(
        {
          success: false,
          message: "Subcategory not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subcategory fetched successfully",
      data: serializeSubCategory(subCategory),
    });
  } catch (error: unknown) {
    return handleSubCategoryError(error, "Subcategory fetch failed");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    getAdminUser(request);

    const subCategoryId = await getSubCategoryId(params);

    if (!subCategoryId) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid subcategory ID",
        },
        { status: 400 },
      );
    }

    const body: unknown = await request.json();
    const validationResult = updateSubCategorySchema.safeParse(body);

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

    if (Object.keys(validationResult.data).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "At least one subcategory field is required",
        },
        { status: 400 },
      );
    }

    await connectDatabase();

    const currentSubCategory = await SubCategory.findById(subCategoryId).select(
      "name category",
    );

    if (!currentSubCategory) {
      return NextResponse.json(
        {
          success: false,
          message: "Subcategory not found",
        },
        { status: 404 },
      );
    }

    const { name, category } = validationResult.data;
    const targetCategoryId = category ?? currentSubCategory.category.toString();

    if (category !== undefined) {
      const parentCategory = await Category.findById(category).select("_id");

      if (!parentCategory) {
        return NextResponse.json(
          {
            success: false,
            message: "Category not found",
          },
          { status: 404 },
        );
      }
    }

    if (name !== undefined || category !== undefined) {
      const duplicateSubCategory = await SubCategory.findOne({
        _id: { $ne: subCategoryId },
        name: name ?? currentSubCategory.name,
        category: targetCategoryId,
      }).collation({
        locale: "en",
        strength: 2,
      });

      if (duplicateSubCategory) {
        return NextResponse.json(
          {
            success: false,
            message: "Subcategory already exists in this category",
          },
          { status: 409 },
        );
      }
    }

    const updatedSubCategory = await SubCategory.findByIdAndUpdate(
      subCategoryId,
      { $set: validationResult.data },
      { returnDocument: "after", runValidators: true },
    )
      .populate({ path: "category", select: "_id name" })
      .lean();

    if (!updatedSubCategory) {
      return NextResponse.json(
        {
          success: false,
          message: "Subcategory not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subcategory updated successfully",
      data: serializeSubCategory(updatedSubCategory),
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
          message: "Subcategory already exists in this category",
        },
        { status: 409 },
      );
    }

    return handleSubCategoryError(error, "Subcategory update failed");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    getAdminUser(request);

    const subCategoryId = await getSubCategoryId(params);

    if (!subCategoryId) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid subcategory ID",
        },
        { status: 400 },
      );
    }

    await connectDatabase();
    const subCategory = await SubCategory.findByIdAndDelete(subCategoryId);

    if (!subCategory) {
      return NextResponse.json(
        {
          success: false,
          message: "Subcategory not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subcategory deleted successfully",
    });
  } catch (error: unknown) {
    return handleSubCategoryError(error, "Subcategory deletion failed");
  }
}
