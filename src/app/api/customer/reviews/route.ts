import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Order, { OrderStatus } from "@/models/Order";
import Review from "@/models/Review";
import { UserRole } from "@/models/User";
import { createReviewSchema } from "@/validations/review.validation";

type ReviewOrder = {
  orderStatus: OrderStatus;
  items: Array<{ product: { toString(): string } }>;
};

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }
  return authUser.userId;
}

function handleReviewError(error: unknown, message: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  if ((error as { code?: number }).code === 11000) {
    return NextResponse.json({ success: false, message: "You have already reviewed this product for this order" }, { status: 409 });
  }
  console.error(message, error);
  return NextResponse.json({ success: false, message: "Unable to process review" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body: unknown = await request.json();
    const validationResult = createReviewSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ success: false, message: "Invalid review data", errors: validationResult.error.issues }, { status: 400 });
    }

    const { productId, orderId, rating, review } = validationResult.data;
    await connectToDatabase();
    const order = await Order.findOne({ _id: orderId, user: userId }).select("orderStatus items.product").lean() as ReviewOrder | null;
    if (!order) return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    if (order.orderStatus !== OrderStatus.DELIVERED) {
      return NextResponse.json({ success: false, message: "Reviews are available after delivery" }, { status: 403 });
    }
    if (!order.items.some((item) => item.product.toString() === productId)) {
      return NextResponse.json({ success: false, message: "This product was not part of the order" }, { status: 403 });
    }

    const existingReview = await Review.findOne({ user: userId, product: productId, order: orderId }).select("_id").lean();
    if (existingReview) {
      return NextResponse.json({ success: false, message: "You have already reviewed this product for this order." }, { status: 409 });
    }

    const createdReview = await Review.create({ user: userId, product: productId, order: orderId, rating, review, isActive: true });
    return NextResponse.json({ success: true, message: "Review submitted successfully", data: { id: createdReview._id.toString() } }, { status: 201 });
  } catch (error: unknown) {
    return handleReviewError(error, "Customer review creation failed");
  }
}