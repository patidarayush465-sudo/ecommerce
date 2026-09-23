"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import WishlistButton from "@/components/customer/WishlistButton";

type ProductImage = {
  url: string;
  publicId: string;
};

type ProductReference = {
  _id: string;
  name: string;
};

type CustomerProduct = {
  _id: string;
  name: string;
  description: string;
  price: number;
  mrp: number;
  discountPercent: number;
  sellingPrice: number;
  stock: number;
  images: ProductImage[];
  category: ProductReference;
  subcategory: ProductReference;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProductResponse = {
  message?: string;
  data?: CustomerProduct;
};

type CartResponse = {
  message?: string;
};
type ProductReview = {
  id: string;
  orderId: string;
  reviewerName: string;
  rating: number;
  review: string;
  createdAt: string;
  isMine: boolean;
};
type EligibleOrder = {
  id: string;
  orderNumber: string;
  review: { id: string; rating: number; review: string; createdAt: string } | null;
};
type ReviewsResponse = {
  message?: string;
  data?: {
    reviews: ProductReview[];
    summary: { averageRating: number; totalReviews: number; ratingBreakdown: Record<string, number> };
    eligibleOrders: EligibleOrder[];
  };
  pagination?: { page: number; limit: number; total: number; totalPages: number };
};

const REVIEW_PAGE_SIZE = 10;

function isCompleteProduct(value: CustomerProduct | undefined): value is CustomerProduct {
  return Boolean(
    value &&
      typeof value.name === "string" &&
      typeof value.description === "string" &&
      typeof value.sellingPrice === "number" &&
      typeof value.mrp === "number" &&
      typeof value.discountPercent === "number" &&
      typeof value.stock === "number" &&
      Array.isArray(value.images) &&
      value.category &&
      typeof value.category.name === "string" &&
      value.subcategory &&
      typeof value.subcategory.name === "string",
  );
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(date);
}

function getErrorMessage(status: number, responseBody?: ProductResponse) {
  if (status === 403) return "You are not authorized to view this product.";
  if (status === 404) return "Product not found";
  if (status >= 500) return "The server is unavailable. Please try again later.";
  return responseBody?.message ?? "Unable to load this product. Please try again.";
}

function DetailSkeleton() {
  return (
    <div className="mt-8 grid animate-pulse gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <div className="aspect-square rounded-xl bg-zinc-900" />
      <div className="space-y-5">
        <div className="h-5 w-1/3 rounded bg-zinc-900" />
        <div className="h-10 w-4/5 rounded bg-zinc-900" />
        <div className="h-24 rounded bg-zinc-900" />
        <div className="h-8 w-1/3 rounded bg-zinc-900" />
        <div className="h-20 rounded bg-zinc-900" />
      </div>
    </div>
  );
}

export default function CustomerProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params.id;
  const [product, setProduct] = useState<CustomerProduct | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isAddedToCart, setIsAddedToCart] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState<NonNullable<ReviewsResponse["data"]>["summary"] | null>(null);
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsPage, setReviewsPage] = useState(0);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(0);
  const [isLoadingMoreReviews, setIsLoadingMoreReviews] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [loadMoreReviewError, setLoadMoreReviewError] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    if (!productId) return;

    const controller = new AbortController();

    async function loadProduct() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(`/api/customer/products/${productId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const responseBody = (await response.json()) as ProductResponse;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          setErrorMessage(getErrorMessage(response.status, responseBody));
          setProduct(null);
          return;
        }

        if (!isCompleteProduct(responseBody.data)) {
          setErrorMessage("This product data is incomplete. Please try again later.");
          setProduct(null);
          return;
        }

        setProduct(responseBody.data);
        setSelectedImageIndex(0);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage("Unable to connect to the server. Please try again.");
        setProduct(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadProduct();
    return () => controller.abort();
  }, [productId, retryKey, router]);

  const loadReviews = useCallback(async (page = 1, signal?: AbortSignal) => {
    if (page === 1) setReviewsLoading(true);
    else setIsLoadingMoreReviews(true);
    if (page > 1) setLoadMoreReviewError("");
    try {
      const response = await fetch(`/api/customer/products/${productId}/reviews?page=${page}&limit=${REVIEW_PAGE_SIZE}`, { cache: "no-store", signal });
      const body = (await response.json()) as ReviewsResponse;
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok || !body.data) {
        if (page === 1) setReviewError(body.message ?? "Unable to load reviews.");
        else setLoadMoreReviewError(body.message ?? "Unable to load more reviews.");
        return;
      }
      setReviews((currentReviews) => page === 1 ? body.data!.reviews : [...currentReviews, ...body.data!.reviews]);
      setReviewsPage(body.pagination?.page ?? page);
      setReviewsTotalPages(body.pagination?.totalPages ?? 0);
      setReviewSummary(body.data.summary);
      setEligibleOrders(body.data.eligibleOrders);
      if (page === 1) setReviewError("");
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (page === 1) setReviewError("Unable to load reviews. Please try again.");
      else setLoadMoreReviewError("Unable to load more reviews. Please try again.");
    } finally {
      if (!signal?.aborted) {
        if (page === 1) setReviewsLoading(false);
        else setIsLoadingMoreReviews(false);
      }
    }
  }, [productId, router]);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadReviews(1, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadReviews, productId]);

  function openReviewForm(orderId: string, existingReview?: ProductReview | EligibleOrder["review"]) {
    setSelectedOrderId(orderId);
    setEditingReviewId(existingReview && "id" in existingReview ? existingReview.id : null);
    setRating(existingReview?.rating ?? 5);
    setReviewText(existingReview?.review ?? "");
    setReviewFeedback("");
    setReviewFormOpen(true);
  }

  async function submitReview() {
    if (reviewText.trim().length < 3 || reviewText.trim().length > 1000) {
      setReviewFeedback("Review must be between 3 and 1000 characters.");
      return;
    }
    if (!editingReviewId && !selectedOrderId) {
      setReviewFeedback("Select a delivered order first.");
      return;
    }
    setIsSubmittingReview(true);
    setReviewFeedback("");
    try {
      const response = await fetch(editingReviewId ? `/api/customer/reviews/${editingReviewId}` : "/api/customer/reviews", {
        method: editingReviewId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingReviewId ? { rating, review: reviewText } : { productId, orderId: selectedOrderId, rating, review: reviewText }),
      });
      const body = (await response.json()) as { message?: string };
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) { setReviewFeedback(body.message ?? "Unable to save review."); return; }
      setReviewFeedback(editingReviewId ? "Review updated successfully." : "Review submitted successfully.");
      setReviewFormOpen(false);
      setEditingReviewId(null);
      setReviewText("");
      setReviewsPage(0);
      setReviewsTotalPages(0);
      await loadReviews(1);
    } catch { setReviewFeedback("Unable to save review. Please try again."); }
    finally { setIsSubmittingReview(false); }
  }

  async function deleteReview(reviewId: string) {
    if (!window.confirm("Delete this review?")) return;
    try {
      const response = await fetch(`/api/customer/reviews/${reviewId}`, { method: "DELETE" });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) { setReviewError(body.message ?? "Unable to delete review."); return; }
      setReviewFormOpen(false);
      setEditingReviewId(null);
      setSelectedOrderId("");
      setRating(5);
      setReviewText("");
      setReviewFeedback("");
      setReviewsPage(0);
      setReviewsTotalPages(0);
      await loadReviews(1);
    } catch { setReviewError("Unable to delete review. Please try again."); }
  }

  function retry() {
    setRetryKey((currentKey) => currentKey + 1);
  }

  async function addToCart(): Promise<boolean> {
    if (!product || isAddingToCart || product.stock <= 0) return false;

    setIsAddingToCart(true);
    setCartFeedback(null);

    try {
      const response = await fetch("/api/customer/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product._id, quantity: 1 }),
      });
      const responseBody = (await response.json()) as CartResponse;

      if (response.status === 401) {
        router.replace("/login");
        return false;
      }

      if (!response.ok) {
        setCartFeedback({
          type: "error",
          message:
            response.status >= 500
              ? "The server is unavailable. Please try again later."
              : responseBody.message ?? "Unable to add this product to your cart.",
        });
        return false;
      }

      setIsAddedToCart(true);
      setCartFeedback({ type: "success", message: "Added to cart" });
      return true;
    } catch {
      setCartFeedback({
        type: "error",
        message: "Unable to connect to the server. Please try again.",
      });
      return false;
    } finally {
      setIsAddingToCart(false);
    }
  }

  async function buyNow() {
    if (!product || product.stock <= 0) return;

    const added = await addToCart();
    if (added) router.push("/customer/checkout");
  }

  const selectedImage = product?.images[selectedImageIndex];

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/products" className="text-sm text-zinc-400 transition hover:text-amber-300">
          Back to Products
        </Link>

        {isLoading ? (
          <DetailSkeleton />
        ) : errorMessage ? (
          <section className="mt-12 rounded-xl border border-red-400/30 bg-red-400/10 px-5 py-6 text-red-200" role="alert">
            <h1 className="text-xl font-semibold">{errorMessage}</h1>
            {errorMessage !== "Product not found" && (
              <button type="button" onClick={retry} className="mt-5 rounded-lg border border-red-300/40 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-300/10">
                Retry
              </button>
            )}
          </section>
        ) : product ? (
          <>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <section aria-label="Product images">
              <div className="aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                {selectedImage ? (
                  <div role="img" aria-label={`${product.name} image ${selectedImageIndex + 1}`} className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${selectedImage.url}")` }} />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-500">No image available</div>
                )}
              </div>
              {product.images.length > 0 && (
                <div className="mt-4 flex gap-3 overflow-x-auto pb-1" aria-label="Product image gallery">
                  {product.images.map((image, index) => (
                    <button
                      key={image.publicId || image.url}
                      type="button"
                      onClick={() => setSelectedImageIndex(index)}
                      aria-label={`Show product image ${index + 1}`}
                      aria-pressed={selectedImageIndex === index}
                      className={`h-20 w-20 shrink-0 rounded-lg border-2 bg-zinc-900 bg-contain bg-center bg-no-repeat transition ${selectedImageIndex === index ? "border-amber-300" : "border-zinc-800 hover:border-zinc-500"}`}
                      style={{ backgroundImage: `url("${image.url}")` }}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">
                {product.category.name}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{product.name}</h1>
              <p className="mt-5 text-base leading-7 text-zinc-400">{product.description}</p>

              <div className="mt-7 border-y border-zinc-800 py-5">
                <p className="text-3xl font-semibold text-amber-300">{formatPrice(product.sellingPrice)}</p>
                {product.discountPercent > 0 && <p className="mt-1 text-sm text-zinc-500">MRP {formatPrice(product.mrp)} · {product.discountPercent}% OFF</p>}
              </div>

              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Category</dt>
                  <dd className="mt-1 font-medium text-zinc-200">{product.category.name}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Subcategory</dt>
                  <dd className="mt-1 font-medium text-zinc-200">{product.subcategory.name}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Availability</dt>
                  <dd className={`mt-1 font-medium ${product.stock > 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                  </dd>
                </div>
                {typeof product.isActive === "boolean" && (
                  <div>
                    <dt className="text-zinc-500">Status</dt>
                    <dd className={`mt-1 font-medium ${product.isActive ? "text-emerald-300" : "text-red-300"}`}>
                      {product.isActive ? "Active" : "Inactive"}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    if (product.stock <= 0) return;
                    if (isAddedToCart) {
                      router.push("/customer/cart");
                      return;
                    }
                    void addToCart();
                  }}
                  disabled={isAddingToCart || product.stock <= 0}
                  className="w-full rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {product.stock <= 0
                    ? "Out of Stock"
                    : isAddingToCart
                      ? "Adding..."
                      : isAddedToCart
                        ? "Go to Cart"
                        : "Add to Cart"}
                </button>
                <button
                  type="button"
                  onClick={() => void buyNow()}
                  disabled={isAddingToCart || product.stock <= 0}
                  className="w-full rounded-lg border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Buy Now
                </button>
              </div>
              <div className="mt-3">
                <WishlistButton productId={product._id} />
              </div>
              {cartFeedback && (
                <p
                  className={`mt-3 text-sm ${cartFeedback.type === "success" ? "text-emerald-300" : "text-red-300"}`}
                  role={cartFeedback.type === "error" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {cartFeedback.message}
                </p>
              )}

              {formatDate(product.createdAt) && (
                <p className="mt-8 text-xs text-zinc-600">Listed {formatDate(product.createdAt)}</p>
              )}
            </section>
          </div>
          <section id="reviews" className="mt-12 border-t border-zinc-800 pt-8" aria-labelledby="reviews-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">Customer feedback</p>
                <h2 id="reviews-heading" className="mt-2 text-2xl font-semibold">Reviews</h2>
                {reviewSummary && <p className="mt-2 text-sm text-zinc-300">⭐ {reviewSummary.averageRating.toFixed(1)} <span className="text-zinc-500">{reviewSummary.totalReviews} Reviews</span></p>}
              </div>
              {eligibleOrders.some((order) => !order.review) && !reviewFormOpen && (
                <button type="button" onClick={() => openReviewForm(eligibleOrders.find((order) => !order.review)?.id ?? "")} className="rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-200">
                  Rate &amp; Review
                </button>
              )}
            </div>
            {reviewSummary && <div className="mt-5 grid max-w-xl gap-2 text-sm text-zinc-300 sm:grid-cols-2">
              {[5, 4, 3, 2, 1].map((level) => <div key={level} className="flex items-center gap-2"><span className="w-10">{level} ⭐</span><div className="h-2 flex-1 rounded-full bg-zinc-800"><div className="h-2 rounded-full bg-amber-300" style={{ width: `${reviewSummary.totalReviews ? ((reviewSummary.ratingBreakdown[String(level)] ?? 0) / reviewSummary.totalReviews) * 100 : 0}%` }} /></div><span className="w-8 text-right text-zinc-500">{reviewSummary.ratingBreakdown[String(level)] ?? 0}</span></div>)}
            </div>}
            {reviewFormOpen && <div className="mt-6 max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="font-semibold">{editingReviewId ? "Edit Review" : "Rate & Review"}</h3>
              {!editingReviewId && <label className="mt-4 block text-sm text-zinc-300">Delivered order<select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100">{eligibleOrders.filter((order) => !order.review).map((order) => <option key={order.id} value={order.id}>{order.orderNumber}</option>)}</select></label>}
              <div className="mt-4"><p className="text-sm text-zinc-300">Rating</p><div className="mt-2 flex gap-2">{[1, 2, 3, 4, 5].map((level) => <button key={level} type="button" onClick={() => setRating(level)} aria-label={`${level} stars`} className={`text-2xl ${rating >= level ? "text-amber-300" : "text-zinc-700"}`}>★</button>)}</div></div>
              <label className="mt-4 block text-sm text-zinc-300">Review<textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} maxLength={1000} rows={4} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" /></label>
              {reviewFeedback && <p className="mt-3 text-sm text-red-300" role="alert">{reviewFeedback}</p>}
              <div className="mt-4 flex gap-3"><button type="button" onClick={() => setReviewFormOpen(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm">Cancel</button><button type="button" disabled={isSubmittingReview} onClick={() => void submitReview()} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">{isSubmittingReview ? "Saving..." : "Submit Review"}</button></div>
            </div>}
            {reviewsLoading ? <p className="mt-6 text-sm text-zinc-500" role="status">Loading reviews...</p> : reviewError ? <p className="mt-6 text-sm text-red-300" role="alert">{reviewError}</p> : reviews.length === 0 ? <p className="mt-6 text-sm text-zinc-500">No reviews yet.</p> : <div className="mt-6 space-y-4">{reviews.map((item) => <article key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{item.reviewerName}</p><p className="text-sm text-amber-300">{"★".repeat(item.rating)}<span className="text-zinc-700">{"★".repeat(5 - item.rating)}</span></p></div><time className="text-xs text-zinc-500">{formatDate(item.createdAt)}</time></div><p className="mt-3 text-sm leading-6 text-zinc-300">{item.review}</p>{item.isMine && <div className="mt-4 flex gap-3"><button type="button" onClick={() => openReviewForm(item.orderId, item)} className="text-sm font-semibold text-amber-300">Edit Review</button><button type="button" onClick={() => void deleteReview(item.id)} className="text-sm font-semibold text-red-300">Delete Review</button></div>}</article>)}</div>}
            {loadMoreReviewError && <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-red-300" role="alert"><span>{loadMoreReviewError}</span><button type="button" onClick={() => void loadReviews(reviewsPage + 1)} className="font-semibold text-amber-300 hover:text-amber-200">Retry</button></div>}
            {!reviewsLoading && reviews.length > 0 && reviewsPage < reviewsTotalPages && <button type="button" disabled={isLoadingMoreReviews} onClick={() => void loadReviews(reviewsPage + 1)} className="mt-6 w-full rounded-lg border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50">{isLoadingMoreReviews ? "Loading more reviews..." : "Load More Reviews"}</button>}
          </section>
          </>
        ) : null}
      </div>
    </main>
  );
}