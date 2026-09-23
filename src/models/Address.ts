import mongoose, { Schema } from "mongoose";

const AddressSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    mobile: {
      type: String,
      required: true,
      match: /^[6-9]\d{9}$/,
    },
    addressLine: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 300,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    state: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    pincode: {
      type: String,
      required: true,
      match: /^\d{6}$/,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
      default: "India",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const Address =
  mongoose.models.Address || mongoose.model("Address", AddressSchema);

export default Address;