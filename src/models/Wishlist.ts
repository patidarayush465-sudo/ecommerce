import mongoose, { Schema } from "mongoose";

const WishlistSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
  },
  { timestamps: true },
);

WishlistSchema.index({ user: 1, product: 1 }, { unique: true });

const Wishlist = mongoose.models.Wishlist || mongoose.model("Wishlist", WishlistSchema);

export default Wishlist;