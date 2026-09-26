import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { deleteFromCloudinary, uploadToCloudinary } from "@/lib/cloudinary";
import Category from "@/models/Category";
import Product from "@/models/Product";
import SubCategory from "@/models/SubCategory";
import mongoose from "mongoose";
import {
  calculateSellingPrice,
  getProductPricing,
  validateProductPricing,
} from "@/services/pricing.service";
import { createProductSchema } from "@/validations/product.validation";

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_FOLDER = "ecommerce/products";
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_SORT_FIELDS = new Set(["sellingPrice", "createdAt", "name"]);
const ALLOWED_SORT_ORDERS = new Set(["asc", "desc"]);
const ALLOWED_CREATE_FIELDS = new Set([
  "name",
  "description",
  "mrp",
  "discountPercent",
  "sellingPrice",
  "stock",
  "category",
  "subcategory",
  "isActive",
  "images",
]);

type PopulatedReference = {
  _id: { toString(): string };
  name: string;
};

type ProductRecord = {
  _id: { toString(): string };
  name: string;
  description: string;
  price?: number;
  mrp?: number;
  discountPercent?: number;
  sellingPrice?: number;
  stock: number;
  images: Array<{ url: string; publicId: string }>;
  category?: PopulatedReference | null;
  subcategory?: PopulatedReference | null;
  isActive: boolean;
};

function serializeProduct(product: ProductRecord) {
  const category = product.category && typeof product.category === "object" ? {
    id: product.category._id.toString(),
    name: product.category.name,
  } : null;
  const subcategory = product.subcategory && typeof product.subcategory === "object" ? {
    id: product.subcategory._id.toString(),
    name: product.subcategory.name,
  } : null;

  try {
    const pricing = getProductPricing(product);

    return {
      id: product._id.toString(),
      name: product.name,
      description: product.description,
      mrp: pricing.mrp,
      discountPercent: pricing.discountPercent,
      sellingPrice: pricing.sellingPrice,
      price: pricing.sellingPrice,
      stock: product.stock,
      images: product.images,
      category,
      subcategory,
      isActive: product.isActive,
      pricingValid: true,
    };
  } catch {
    return {
      id: product._id.toString(),
      name: product.name,
      description: product.description,
      mrp: product.mrp ?? null,
      discountPercent: product.discountPercent ?? null,
      sellingPrice: product.sellingPrice ?? product.price ?? null,
      price: product.price ?? product.sellingPrice ?? null,
      stock: product.stock,
      images: product.images,
      category,
      subcategory,
      isActive: product.isActive,
      pricingValid: false,
      pricingError: "Invalid stored pricing",
    };
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function parseBoolean(value: string | null) {
  if (value === null) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function parseNumber(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getImageFiles(formData: FormData) {
  return formData
    .getAll("images")
    .filter((value): value is File => value instanceof File);
}

function getUnknownFormField(formData: FormData, allowedFields: Set<string>) {
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field)) {
      return field;
    }
  }

  return null;
}

function getInvalidImageMessage(image: File) {
  if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
    return "Only JPEG, PNG, and WEBP images are allowed";
  }

  if (image.size > MAX_IMAGE_SIZE) {
    return "Each image must not exceed 5 MB";
  }

  return null;
}

async function uploadImages(
  images: File[],
  uploadedPublicIds: string[],
) {
  const uploadedImages: Array<{ url: string; publicId: string }> = [];

  for (const image of images) {
    const result = await uploadToCloudinary(
      Buffer.from(await image.arrayBuffer()),
      PRODUCT_IMAGE_FOLDER,
    );
    uploadedPublicIds.push(result.public_id);
    uploadedImages.push({
      url: result.secure_url,
      publicId: result.public_id,
    });
  }

  return uploadedImages;
}

async function cleanupCloudinaryImages(publicIds: string[]) {
  await Promise.all(
    publicIds.map(async (publicId) => {
      try {
        await deleteFromCloudinary(publicId);
      } catch (error: unknown) {
        console.error("Cloudinary cleanup failed", error);
      }
    }),
  );
}

async function validateProductRelationship(categoryId: string, subcategoryId: string) {
  const category = await Category.findById(categoryId).select("_id");

  if (!category) {
    return { error: "Category not found", status: 404 } as const;
  }

  const subcategory = await SubCategory.findById(subcategoryId).select(
    "_id category",
  );

  if (!subcategory) {
    return { error: "Subcategory not found", status: 404 } as const;
  }

  if (subcategory.category.toString() !== categoryId) {
    return {
      error: "Subcategory does not belong to the selected category",
      status: 400,
    } as const;
  }

  return { category, subcategory } as const;
}

async function parseCreateFormData(formData: FormData) {
  const mrp = parseNumber(formData.get("mrp")?.toString() ?? null);
  const discountPercent = parseNumber(formData.get("discountPercent")?.toString() ?? null);
  const sellingPrice = parseNumber(formData.get("sellingPrice")?.toString() ?? null);
  const stock = parseNumber(formData.get("stock")?.toString() ?? null);
  const isActive = parseBoolean(formData.get("isActive")?.toString() ?? null);

  if (mrp === null || discountPercent === null || sellingPrice === null || stock === null || isActive === null) {
    return { error: "MRP, discount, selling price, stock, and isActive must have valid values" } as const;
  }

  const input: Record<string, unknown> = {
    name: formData.get("name")?.toString(),
    description: formData.get("description")?.toString(),
    mrp,
    discountPercent,
    sellingPrice,
    stock,
    category: formData.get("category")?.toString(),
    subcategory: formData.get("subcategory")?.toString(),
  };

  if (isActive !== undefined) {
    input.isActive = isActive;
  }

  const validationResult = createProductSchema.safeParse(input);

  if (!validationResult.success) {
    return { errors: validationResult.error.issues } as const;
  }

  try {
    validateProductPricing(
      validationResult.data.mrp,
      validationResult.data.discountPercent,
      validationResult.data.sellingPrice,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid product pricing" } as const;
  }

  return { data: validationResult.data } as const;
}

export async function POST(request: Request) {
  const uploadedPublicIds: string[] = [];
  let createdProductId: string | undefined;

  try {
    getAdminUser(request);

    const formData = await request.formData();
    const unknownField = getUnknownFormField(formData, ALLOWED_CREATE_FIELDS);

    if (unknownField) {
      return NextResponse.json(
        {
          success: false,
          message: `Unknown product field: ${unknownField}`,
        },
        { status: 400 },
      );
    }

    const images = getImageFiles(formData);

    if (images.length < 1 || images.length > MAX_IMAGES) {
      return NextResponse.json(
        {
          success: false,
          message: "A product must have between 1 and 5 images",
        },
        { status: 400 },
      );
    }

    for (const image of images) {
      const imageError = getInvalidImageMessage(image);

      if (imageError) {
        return NextResponse.json(
          { success: false, message: imageError },
          { status: 400 },
        );
      }
    }

    const parsedForm = await parseCreateFormData(formData);

    if ("error" in parsedForm) {
      return NextResponse.json(
        { success: false, message: parsedForm.error },
        { status: 400 },
      );
    }

    if ("errors" in parsedForm) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid product data",
          errors: parsedForm.errors,
        },
        { status: 400 },
      );
    }

    await connectDatabase();

    const relationship = await validateProductRelationship(
      parsedForm.data.category,
      parsedForm.data.subcategory,
    );

    if ("error" in relationship) {
      return NextResponse.json(
        { success: false, message: relationship.error },
        { status: relationship.status },
      );
    }

    const productImages = await uploadImages(images, uploadedPublicIds);
    const product = await Product.create({
      ...parsedForm.data,
      price: calculateSellingPrice(parsedForm.data.mrp, parsedForm.data.discountPercent),
      images: productImages,
    });
    createdProductId = product._id.toString();

    await product.populate([
      { path: "category", select: "_id name" },
      { path: "subcategory", select: "_id name" },
    ]);

    return NextResponse.json(
      {
        success: true,
        message: "Product created successfully",
        data: serializeProduct(product),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (createdProductId) {
      try {
        await Product.deleteOne({ _id: createdProductId });
      } catch (cleanupError: unknown) {
        console.error("Product database cleanup failed", cleanupError);
      }
    }

    await cleanupCloudinaryImages(uploadedPublicIds);

    return handleProductError(error, "Product creation failed");
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
    const category = searchParams.get("category")?.trim() ?? "";
    const subcategory = searchParams.get("subcategory")?.trim() ?? "";
    const sortBy = searchParams.get("sortBy") ?? "createdAt";
    const sortOrder = searchParams.get("sortOrder") ?? "desc";

    if (!ALLOWED_SORT_FIELDS.has(sortBy) || !ALLOWED_SORT_ORDERS.has(sortOrder)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid sorting parameters",
        },
        { status: 400 },
      );
    }

    if (
      (category && !mongoose.Types.ObjectId.isValid(category)) ||
      (subcategory && !mongoose.Types.ObjectId.isValid(subcategory))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid category or subcategory ID",
        },
        { status: 400 },
      );
    }

    const query: Record<string, unknown> = {};

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

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

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
    return handleProductError(error, "Product listing failed");
  }
}
