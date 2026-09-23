import mongoose, { Schema } from "mongoose";

export enum UserRole {
  ADMIN = "ADMIN",
  CUSTOMER = "CUSTOMER",
}

const ProfileImageSchema = new Schema(
  {
    url: {
      type: String,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const FcmTokenSchema = new Schema(
  {
    token: { type: String, required: true, trim: true },
    deviceType: { type: String, required: true, enum: ["web", "android", "ios"] },
    lastActiveAt: { type: Date, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.CUSTOMER,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      required: false,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      required: false,
      select: false,
    },
    passwordResetToken: {
      type: String,
      required: false,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      required: false,
      select: false,
    },
    profileImage: {
      type: ProfileImageSchema,
      required: false,
    },
    dateOfBirth: {
      type: Date,
      required: false,
    },
    mobile: {
      type: String,
      required: false,
      trim: true,
    },
    fcmTokens: {
      type: [FcmTokenSchema],
      default: [],
    },
  },
  {
    timestamps: true, 
  },
);

const cachedUserModel = mongoose.models.User;
const hasPasswordResetPaths = cachedUserModel
  ? Boolean(cachedUserModel.schema.path("passwordResetToken")) &&
    Boolean(cachedUserModel.schema.path("passwordResetExpires"))
  : false;
const hasFcmTokensPath = cachedUserModel
  ? Boolean(cachedUserModel.schema.path("fcmTokens"))
  : false;

if (cachedUserModel && (!hasPasswordResetPaths || !hasFcmTokensPath)) {
  delete mongoose.models.User;
}

const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
