import mongoose, { Schema } from "mongoose";

const ProductImageSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false },
);

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    price: {
      type: Number,
      min: 0,
    },
    mrp: {
      type: Number,
      min: 0,
    },
    discountPercent: {
      type: Number,
      min: 0,
      max: 100,
    },
    sellingPrice: {
      type: Number,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Stock must be an integer",
      },
    },
    images: {
      type: [ProductImageSchema],
      required: true,
      validate: {
        validator: (images: unknown[]) => images.length >= 1,
        message: "At least one product image is required",
      },
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategory: {
      type: Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

const cachedProductModel = mongoose.models.Product as mongoose.Model<unknown> | undefined;
const hasPricingPaths = cachedProductModel
  ? ["mrp", "discountPercent", "sellingPrice"].every((path) =>
      Boolean(cachedProductModel.schema.path(path)),
    )
  : false;

if (cachedProductModel && !hasPricingPaths) {
  delete mongoose.models.Product;
}

const Product =
  (hasPricingPaths ? cachedProductModel : undefined) ??
  mongoose.model("Product", ProductSchema);

const TypedProduct = Product as typeof mongoose.models.Product;

export default TypedProduct;
