import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Order, { OrderStatus } from "@/models/Order";
import Review from "@/models/Review";
import { UserRole } from "@/models/User";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
  return authUser.userId;
}

function handleReviewError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error("Customer product reviews fetch failed", error);
  return NextResponse.json({ success: false, message: "Unable to load reviews" }, { status: 500 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid product ID" }, { status: 400 });
    }
    const searchParams = new URL(request.url).searchParams;
    const page = Number(searchParams.get("page") ?? "1");
    const requestedLimit = Number(searchParams.get("limit") ?? "10");
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return NextResponse.json({ success: false, message: "Invalid pagination parameters" }, { status: 400 });
    }
    const limit = Math.min(requestedLimit, 50);
    await connectToDatabase();
    const productId = new mongoose.Types.ObjectId(id);
    const query = { product: productId, isActive: true };
    const skip = (page - 1) * limit;
    const [reviews, total, breakdown, eligibleOrders, totals, ownReviews] = await Promise.all([
      Review.find(query).populate({ path: "user", select: "name" }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(query),
      Review.aggregate([
        { $match: query },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
      Order.find({ user: userId, orderStatus: OrderStatus.DELIVERED, "items.product": id }).select("_id orderNumber").sort({ createdAt: -1 }).lean(),
      Review.aggregate([{ $match: query }, { $group: { _id: null, average: { $avg: "$rating" } } }]),
      Review.find({ user: userId, product: id }).select("_id order rating review createdAt updatedAt isActive").lean(),
    ]);
    const breakdownMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
    breakdown.forEach((entry) => { breakdownMap[entry._id] = entry.count; });
    const ownReviewIds = new Set(ownReviews.map((review) => review._id.toString()));
    const averageRating = totals[0]?.average ? Math.round(totals[0].average * 10) / 10 : 0;
    return NextResponse.json({
      success: true,
      data: {
        reviews: reviews.map((review) => ({ id: review._id.toString(), orderId: review.order.toString(), reviewerName: (review.user as { name?: string } | null)?.name ?? "Customer", rating: review.rating, review: review.review, createdAt: review.createdAt, updatedAt: review.updatedAt, isMine: ownReviewIds.has(review._id.toString()) })),
        summary: { averageRating, totalReviews: total, ratingBreakdown: breakdownMap },
        eligibleOrders: eligibleOrders.map((order) => {
          const ownReview = ownReviews.find((review) => review.order.toString() === order._id.toString());
          return { id: order._id.toString(), orderNumber: order.orderNumber, review: ownReview ? { id: ownReview._id.toString(), rating: ownReview.rating, review: ownReview.review, createdAt: ownReview.createdAt } : null };
        }),
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    return handleReviewError(error);
  }
}