import mongoose, { Schema } from "mongoose";

const SubCategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
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

SubCategorySchema.index(
  { name: 1, category: 1 },
  {
    unique: true,
    collation: {
      locale: "en",
      strength: 2,
    },
  },
);

const SubCategory =
  mongoose.models.SubCategory ||
  mongoose.model("SubCategory", SubCategorySchema);

export default SubCategory;
