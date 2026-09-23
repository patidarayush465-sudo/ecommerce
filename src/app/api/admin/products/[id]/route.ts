import mongoose from "mongoose";
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
import {
  calculateSellingPrice,
  getProductPricing,
  validateProductPricing,
} from "@/services/pricing.service";
import {
  updateProductSchema,
  type UpdateProductInput,
} from "@/validations/product.validation";

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_FOLDER = "ecommerce/products";
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_UPDATE_FIELDS = new Set([
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
  "keepImagePublicIds",
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
  category: PopulatedReference;
  subcategory: PopulatedReference;
  isActive: boolean;
};

type ProductImage = {
  url: string;
  publicId: string;
};

type DatabaseError = {
  code?: number;
};

type ParsedUpdate = {
  data: UpdateProductInput;
  images: File[];
  keepImagePublicIds?: string[];
};

function serializeProduct(product: ProductRecord) {
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
    category: {
      id: product.category._id.toString(),
      name: product.category.name,
    },
    subcategory: {
      id: product.subcategory._id.toString(),
      name: product.subcategory.name,
    },
    isActive: product.isActive,
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

async function getProductId(params: Promise<{ id: string }>) {
  const { id } = await params;

  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function getImageError(image: File) {
  if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
    return "Only JPEG, PNG, and WEBP images are allowed";
  }

  if (image.size > MAX_IMAGE_SIZE) {
    return "Each image must not exceed 5 MB";
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

async function parseUpdateRequest(request: Request): Promise<
  | { data: ParsedUpdate }
  | { errors: unknown[] }
  | { error: string }
> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const body: unknown = await request.json();
    const validationResult = updateProductSchema.safeParse(body);

    if (!validationResult.success) {
      return { errors: validationResult.error.issues };
    }

    return {
      data: {
        data: validationResult.data,
        images: [],
      },
    };
  }

  const formData = await request.formData();

  for (const field of new Set(formData.keys())) {
    if (!ALLOWED_UPDATE_FIELDS.has(field)) {
      return { error: `Unknown product field: ${field}` };
    }
  }

  const mrp = parseNumber(formData.get("mrp")?.toString() ?? null);
  const discountPercent = parseNumber(formData.get("discountPercent")?.toString() ?? null);
  const sellingPrice = parseNumber(formData.get("sellingPrice")?.toString() ?? null);
  const stock = parseNumber(formData.get("stock")?.toString() ?? null);
  const isActive = parseBoolean(formData.get("isActive")?.toString() ?? null);

  if (mrp === null || discountPercent === null || sellingPrice === null || stock === null || isActive === null) {
    return { error: "MRP, discount, selling price, stock, and isActive must have valid values" };
  }

  const input: Record<string, unknown> = {};
  const stringFields = [
    "name",
    "description",
    "category",
    "subcategory",
  ] as const;

  for (const field of stringFields) {
    const value = formData.get(field);

    if (value !== null) {
      input[field] = value.toString();
    }
  }

  if (mrp !== undefined) {
    input.mrp = mrp;
  }

  if (discountPercent !== undefined) {
    input.discountPercent = discountPercent;
  }

  if (sellingPrice !== undefined) {
    input.sellingPrice = sellingPrice;
  }

  if (stock !== undefined) {
    input.stock = stock;
  }

  if (isActive !== undefined) {
    input.isActive = isActive;
  }

  const validationResult = updateProductSchema.safeParse(input);

  if (!validationResult.success) {
    return { errors: validationResult.error.issues };
  }

  const images = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File);

  for (const image of images) {
    const imageError = getImageError(image);

    if (imageError) {
      return { error: imageError };
    }
  }

  if (images.length > MAX_IMAGES) {
    return { error: "A product can have a maximum of 5 images" };
  }

  const keepImagePublicIdsValue = formData.get("keepImagePublicIds");
  let keepImagePublicIds: string[] | undefined;

  if (keepImagePublicIdsValue !== null) {
    try {
      const parsed = JSON.parse(keepImagePublicIdsValue.toString());

      if (
        !Array.isArray(parsed) ||
        parsed.some((publicId) => typeof publicId !== "string")
      ) {
        return { error: "keepImagePublicIds must be a JSON array of strings" };
      }

      keepImagePublicIds = parsed;
    } catch {
      return { error: "keepImagePublicIds must be valid JSON" };
    }
  }

  return {
    data: {
      data: validationResult.data,
      images,
      keepImagePublicIds,
    },
  };
}

async function uploadImages(images: File[], uploadedPublicIds: string[]) {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    getAdminUser(request);

    const productId = await getProductId(params);

    if (!productId) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID" },
        { status: 400 },
      );
    }

    await connectDatabase();

    const product = await Product.findById(productId)
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
    return handleProductError(error, "Product fetch failed");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const uploadedPublicIds: string[] = [];
  let databaseUpdated = false;

  try {
    getAdminUser(request);

    const productId = await getProductId(params);

    if (!productId) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID" },
        { status: 400 },
      );
    }

    const parsedRequest = await parseUpdateRequest(request);

    if ("error" in parsedRequest) {
      return NextResponse.json(
        { success: false, message: parsedRequest.error },
        { status: 400 },
      );
    }

    if ("errors" in parsedRequest) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid product data",
          errors: parsedRequest.errors,
        },
        { status: 400 },
      );
    }

    const { data, images, keepImagePublicIds } = parsedRequest.data;

    if (Object.keys(data).length === 0 && images.length === 0 && keepImagePublicIds === undefined) {
      return NextResponse.json(
        { success: false, message: "At least one product field is required" },
        { status: 400 },
      );
    }

    await connectDatabase();

    const currentProduct = await Product.findById(productId);

    if (!currentProduct) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 },
      );
    }

    const currentPricing = getProductPricing(currentProduct);
    const nextMrp = data.mrp ?? currentPricing.mrp;
    const nextDiscountPercent = data.discountPercent ?? currentPricing.discountPercent;
    const nextSellingPrice = calculateSellingPrice(nextMrp, nextDiscountPercent);

    try {
      if (data.sellingPrice !== undefined && data.sellingPrice !== nextSellingPrice) {
        validateProductPricing(nextMrp, nextDiscountPercent, data.sellingPrice);
      }
      validateProductPricing(nextMrp, nextDiscountPercent, nextSellingPrice);
    } catch (error) {
      return NextResponse.json(
        { success: false, message: error instanceof Error ? error.message : "Invalid product pricing" },
        { status: 400 },
      );
    }

    const targetCategoryId = data.category ?? currentProduct.category.toString();
    const targetSubcategoryId =
      data.subcategory ?? currentProduct.subcategory.toString();

    if (data.category !== undefined || data.subcategory !== undefined) {
      const relationship = await validateProductRelationship(
        targetCategoryId,
        targetSubcategoryId,
      );

      if ("error" in relationship) {
        return NextResponse.json(
          { success: false, message: relationship.error },
          { status: relationship.status },
        );
      }
    }

    const currentImages = currentProduct.images as unknown as ProductImage[];
    let nextImages = currentImages.map((image) => ({
      url: image.url,
      publicId: image.publicId,
    }));
    const oldPublicIds = nextImages.map((image) => image.publicId);
    const shouldUpdateImages =
      images.length > 0 || keepImagePublicIds !== undefined;

    if (shouldUpdateImages) {
      const retainedImages =
        keepImagePublicIds === undefined
          ? nextImages
          : nextImages.filter((image) =>
              keepImagePublicIds.includes(image.publicId),
            );

      if (
        keepImagePublicIds !== undefined &&
        retainedImages.length !== keepImagePublicIds.length
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "One or more existing image public IDs were not found",
          },
          { status: 400 },
        );
      }

      const uploadedImages = await uploadImages(images, uploadedPublicIds);
      nextImages = [...retainedImages, ...uploadedImages];

      if (nextImages.length < 1 || nextImages.length > MAX_IMAGES) {
        await cleanupCloudinaryImages(uploadedPublicIds);
        return NextResponse.json(
          { success: false, message: "A product must have between 1 and 5 images" },
          { status: 400 },
        );
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        $set: {
          ...data,
          mrp: nextMrp,
          discountPercent: nextDiscountPercent,
          sellingPrice: nextSellingPrice,
          price: nextSellingPrice,
          ...(shouldUpdateImages ? { images: nextImages } : {}),
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .populate([
        { path: "category", select: "_id name" },
        { path: "subcategory", select: "_id name" },
      ])
      .lean();

    if (!updatedProduct) {
      await cleanupCloudinaryImages(uploadedPublicIds);
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 },
      );
    }
    databaseUpdated = true;

    if (shouldUpdateImages) {
      const newPublicIds = new Set(nextImages.map((image) => image.publicId));
      await cleanupCloudinaryImages(
        oldPublicIds.filter((publicId) => !newPublicIds.has(publicId)),
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product updated successfully",
      data: serializeProduct(updatedProduct),
    });
  } catch (error: unknown) {
    if (!databaseUpdated) {
      await cleanupCloudinaryImages(uploadedPublicIds);
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 },
      );
    }

    if ((error as DatabaseError).code === 11000) {
      return NextResponse.json(
        { success: false, message: "Product update conflict" },
        { status: 409 },
      );
    }

    return handleProductError(error, "Product update failed");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    getAdminUser(request);

    const productId = await getProductId(params);

    if (!productId) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID" },
        { status: 400 },
      );
    }

    await connectDatabase();

    const product = await Product.findById(productId).lean();

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 },
      );
    }

    for (const image of product.images) {
      await deleteFromCloudinary(image.publicId);
    }

    await Product.deleteOne({ _id: productId });

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error: unknown) {
    return handleProductError(error, "Product deletion failed");
  }
}
