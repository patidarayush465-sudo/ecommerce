import { NextResponse } from "next/server";

import {
  deleteFromCloudinary,
  uploadToCloudinary,
} from "@/lib/cloudinary";
import { AuthenticationError, getAuthUser } from "@/lib/auth";
import User, { UserRole } from "@/models/User";
import { customerProfileUpdateSchema } from "@/validations/profile.validation";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function profileData(user: {
  _id: { toString(): string };
  name: string;
  email: string;
  role: UserRole;
  isEmailVerified: boolean;
  profileImage?: { url?: string; publicId?: string };
  dateOfBirth?: Date;
  mobile?: string;
}) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    profileImage: user.profileImage,
    dateOfBirth: user.dateOfBirth,
    mobile: user.mobile,
  };
}

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== UserRole.CUSTOMER) {
    return {
      response: NextResponse.json(
        {
          success: false,
          message: "Customer access required",
        },
        { status: 403 },
      ),
    };
  }

  return { userId: authUser.userId };
}

async function findCustomer(userId: string) {
  const { connectToDatabase } = await import("@/lib/mongodb");
  await connectToDatabase();
  return User.findOne({ _id: userId, role: UserRole.CUSTOMER });
}

export async function GET(request: Request) {
  try {
    const authResult = authenticateCustomer(request);

    if ("response" in authResult) {
      return authResult.response;
    }

    const user = await findCustomer(authResult.userId);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Profile fetched successfully",
      data: profileData(user),
    });
  } catch (error: unknown) {
    return handleProfileError(error, "Profile fetch failed");
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = authenticateCustomer(request);

    if ("response" in authResult) {
      return authResult.response;
    }

    const body: unknown = await request.json();
    const validationResult = customerProfileUpdateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid profile data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    if (Object.keys(validationResult.data).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "At least one profile field is required",
        },
        { status: 400 },
      );
    }

    const user = await findCustomer(authResult.userId);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404 },
      );
    }

    const { name, dateOfBirth, mobile } = validationResult.data;

    if (name !== undefined) {
      user.name = name;
    }

    if (dateOfBirth !== undefined) {
      user.dateOfBirth = new Date(dateOfBirth);
    }

    if (mobile !== undefined) {
      user.mobile = mobile;
    }

    await user.save();

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      data: profileData(user),
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

    return handleProfileError(error, "Profile update failed");
  }
}

export async function PUT(request: Request) {
  let uploadedPublicId: string | undefined;

  try {
    const authResult = authenticateCustomer(request);

    if ("response" in authResult) {
      return authResult.response;
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          message: "Image is required",
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return NextResponse.json(
        {
          success: false,
          message: "Only JPEG, PNG, and WEBP images are allowed",
        },
        { status: 400 },
      );
    }

    if (image.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          message: "Image size must not exceed 5 MB",
        },
        { status: 400 },
      );
    }

    const user = await findCustomer(authResult.userId);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404 },
      );
    }

    const uploadResult = await uploadToCloudinary(
      Buffer.from(await image.arrayBuffer()),
      "ecommerce/profile",
    );
    uploadedPublicId = uploadResult.public_id;

    const oldPublicId = user.profileImage?.publicId;
    user.profileImage = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
    };
    await user.save();

    if (oldPublicId && oldPublicId !== uploadResult.public_id) {
      try {
        await deleteFromCloudinary(oldPublicId);
      } catch (error: unknown) {
        console.error("Old Cloudinary profile image deletion failed", error);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Profile image updated successfully",
      data: {
        profileImage: user.profileImage,
      },
    });
  } catch (error: unknown) {
    if (uploadedPublicId) {
      try {
        await deleteFromCloudinary(uploadedPublicId);
      } catch (cleanupError: unknown) {
        console.error("Cloudinary upload cleanup failed", cleanupError);
      }
    }

    return handleProfileError(error, "Profile image update failed");
  }
}

function handleProfileError(error: unknown, logMessage: string) {
  if (error instanceof AuthenticationError) {
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