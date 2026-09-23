import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Review from "@/models/Review";
import { UserRole } from "@/models/User";
import { updateReviewSchema } from "@/validations/review.validation";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
  return authUser.userId;
}

function handleReviewError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("Customer review mutation failed", error);
  return NextResponse.json({ success: false, message: "Unable to update review" }, { status: 500 });
}

async function getReview(reviewId: string) {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) return null;
  await connectToDatabase();
  return Review.findById(reviewId);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const userId = authenticateCustomer(request);
    const { reviewId } = await params;
    const body: unknown = await request.json();
    const validationResult = updateReviewSchema.safeParse(body);
    if (!validationResult.success) return NextResponse.json({ success: false, message: "Invalid review data", errors: validationResult.error.issues }, { status: 400 });
    const review = await getReview(reviewId);
    if (!review) return NextResponse.json({ success: false, message: "Review not found" }, { status: 404 });
    if (review.user.toString() !== userId) return NextResponse.json({ success: false, message: "You are not allowed to edit this review" }, { status: 403 });
    review.rating = validationResult.data.rating;
    review.review = validationResult.data.review;
    await review.save();
    return NextResponse.json({ success: true, message: "Review updated successfully" });
  } catch (error: unknown) { return handleReviewError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const userId = authenticateCustomer(request);
    const { reviewId } = await params;
    const review = await getReview(reviewId);
    if (!review) return NextResponse.json({ success: false, message: "Review not found" }, { status: 404 });
    if (review.user.toString() !== userId) return NextResponse.json({ success: false, message: "You are not allowed to delete this review" }, { status: 403 });
    await Review.deleteOne({ _id: review._id });
    return NextResponse.json({ success: true, message: "Review deleted successfully" });
  } catch (error: unknown) { return handleReviewError(error); }
}