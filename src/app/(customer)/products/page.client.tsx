"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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
  discountPercent?: number;
  sellingPrice: number;
  stock: number;
  images: ProductImage[];
  category: ProductReference;
  subcategory: ProductReference;
};

type ProductsResponse = {
  message?: string;
  data?: CustomerProduct[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type CartResponse = {
  message?: string;
};
type WishlistResponse = { data?: Array<{ productId: string }> };

type SortOrder = "asc" | "desc";

const PAGE_SIZE = 10;

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function getDisplayDiscountPercent(product: CustomerProduct) {
  if (typeof product.discountPercent === "number") {
    return Math.max(0, Math.round(product.discountPercent));
  }

  if (
    Number.isFinite(product.mrp) &&
    product.mrp > 0 &&
    Number.isFinite(product.sellingPrice) &&
    product.sellingPrice < product.mrp
  ) {
    return Math.max(
      0,
      Math.round(((product.mrp - product.sellingPrice) / product.mrp) * 100),
    );
  }

  return 0;
}

function getErrorMessage(status: number, responseBody?: ProductsResponse) {
  if (status === 403) return "You are not authorized to view products.";
  if (status >= 500) return "The server is unavailable. Please try again later.";
  return responseBody?.message ?? "Unable to load products. Please try again.";
}

function ProductSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="aspect-[4/3] bg-zinc-800" />
      <div className="space-y-3 p-5">
        <div className="h-5 w-3/4 rounded bg-zinc-800" />
        <div className="h-4 w-full rounded bg-zinc-800" />
        <div className="h-4 w-1/2 rounded bg-zinc-800" />
        <div className="h-10 w-full rounded bg-zinc-800" />
      </div>
    </div>
  );
}

export default function CustomerProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    searchParams.get("sortBy") === "sellingPrice" && searchParams.get("sortOrder") === "asc"
      ? "asc"
      : "desc",
  );
  const [page, setPage] = useState(() => {
    const parsedPage = Number(searchParams.get("page") ?? "1");
    return Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  });
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [pagination, setPagination] = useState<ProductsResponse["pagination"]>();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(() => new Set());
  const [cartFeedback, setCartFeedback] = useState<{
    productId: string;
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [wishlistedProductIds, setWishlistedProductIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      search: search.trim(),
      sortBy: "sellingPrice",
      sortOrder,
    });

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setErrorMessage("");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });

      try {
        const response = await fetch(`/api/customer/products?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const responseBody = (await response.json()) as ProductsResponse;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          setErrorMessage(getErrorMessage(response.status, responseBody));
          setProducts([]);
          setPagination(undefined);
          return;
        }

        setProducts(responseBody.data ?? []);
        setPagination(responseBody.pagination);
        const wishlistResponse = await fetch("/api/customer/wishlist", { cache: "no-store", signal: controller.signal });
        if (wishlistResponse.status === 401) {
          router.replace("/login");
          return;
        }
        if (wishlistResponse.ok) {
          const wishlistBody = (await wishlistResponse.json()) as WishlistResponse;
          setWishlistedProductIds(new Set((wishlistBody.data ?? []).map((item) => item.productId)));
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage("Unable to connect to the server. Please try again.");
        setProducts([]);
        setPagination(undefined);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [page, pathname, retryKey, router, search, sortOrder]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleSortChange(value: SortOrder) {
    setSortOrder(value);
    setPage(1);
  }

  function retry() {
    setErrorMessage("");
    setRetryKey((currentKey) => currentKey + 1);
  }

  async function addToCart(productId: string, stock: number): Promise<boolean> {
    if (addingProductId || stock <= 0) return false;

    setAddingProductId(productId);
    setCartFeedback(null);

    try {
      const response = await fetch("/api/customer/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const responseBody = (await response.json()) as CartResponse;

      if (response.status === 401) {
        router.replace("/login");
        return false;
      }

      if (!response.ok) {
        setCartFeedback({
          productId,
          type: "error",
          message:
            response.status >= 500
              ? "The server is unavailable. Please try again later."
              : responseBody.message ?? "Unable to add this product to your cart.",
        });
        return false;
      }

      setAddedProductIds((currentIds) => new Set(currentIds).add(productId));

      setCartFeedback({
        productId,
        type: "success",
        message: "Added to cart",
      });
      return true;
    } catch {
      setCartFeedback({
        productId,
        type: "error",
        message: "Unable to connect to the server. Please try again.",
      });
      return false;
    } finally {
      setAddingProductId(null);
    }
  }

  async function buyNow(productId: string, stock: number) {
    if (stock <= 0) return;

    const added = await addToCart(productId, stock);
    if (added) router.push("/customer/checkout");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/customer/home" className="text-sm text-zinc-400 transition hover:text-amber-300">
              Back to customer home
            </Link>
            <p className="mt-7 text-sm font-medium uppercase tracking-[0.24em] text-amber-300">
              Customer store
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Products</h1>
          </div>
          <Link href="/profile" className="text-sm text-zinc-400 transition hover:text-amber-300">
            Profile
          </Link>
        </div>

        <section className="mt-8 flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="product-search" className="mb-2 block text-sm font-medium text-zinc-200">
              Search products
            </label>
            <input
              id="product-search"
              type="search"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search by name or description"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none transition placeholder:text-zinc-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
            />
          </div>
          <div className="sm:w-56">
            <label htmlFor="price-sort" className="mb-2 block text-sm font-medium text-zinc-200">
              Sort by price
            </label>
            <select
              id="price-sort"
              value={sortOrder}
              onChange={(event) => handleSortChange(event.target.value as SortOrder)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
            >
              <option value="asc">Low to high</option>
              <option value="desc">High to low</option>
            </select>
          </div>
        </section>

        {errorMessage && (
          <div className="mt-6 flex flex-col gap-3 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <span>{errorMessage}</span>
            <button type="button" onClick={retry} className="rounded-md border border-red-300/40 px-3 py-2 font-semibold text-red-100 hover:bg-red-300/10">
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <ProductSkeleton key={index} />)}
          </div>
        ) : products.length === 0 ? (
          <p className="mt-12 text-center text-zinc-400" role="status">No products found</p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const imageUrl = product.images[0]?.url;
              const displayDiscountPercent = getDisplayDiscountPercent(product);

              return (
                <article key={product._id} className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition hover:border-amber-300/60">
                  <div className="relative aspect-[4/3] bg-zinc-800">
                    <WishlistButton
                      productId={product._id}
                      variant="image"
                      initialIsWishlisted={wishlistedProductIds.has(product._id)}
                      skipInitialCheck
                      onWishlistChange={(isWishlisted) => {
                        setWishlistedProductIds((currentIds) => {
                          const nextIds = new Set(currentIds);
                          if (isWishlisted) nextIds.add(product._id);
                          else nextIds.delete(product._id);
                          return nextIds;
                        });
                      }}
                    />
                    {imageUrl ? (
                      <div role="img" aria-label={product.name} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${imageUrl}")` }} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-500">No image available</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-300">{product.category.name}</p>
                    <h2 className="mt-2 line-clamp-2 text-lg font-semibold">{product.name}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-400">{product.description}</p>
                    <p className="mt-4 text-xs text-zinc-500">MRP {formatPrice(product.mrp)}</p>
                    <p className="text-xl font-semibold text-amber-300">{formatPrice(product.sellingPrice)}</p>
                    {displayDiscountPercent > 0 && <p className="mt-1 text-xs text-emerald-300">{displayDiscountPercent}% OFF</p>}
                    <p className="mt-1 text-xs text-zinc-500">{product.subcategory.name} · {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</p>
                    <div className={`mt-5 grid gap-2 ${product.stock > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                      <Link
                        href={`/products/${product._id}`}
                        className="rounded-lg border border-zinc-700 px-4 py-3 text-center text-sm font-semibold text-zinc-100 transition hover:border-amber-300 hover:bg-zinc-800"
                      >
                        View Details
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          if (product.stock <= 0) return;
                          if (addedProductIds.has(product._id)) {
                            router.push("/customer/cart");
                            return;
                          }
                          void addToCart(product._id, product.stock);
                        }}
                        disabled={addingProductId !== null || product.stock <= 0}
                        className="rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {product.stock <= 0
                          ? "Out of Stock"
                          : addingProductId === product._id
                          ? "Adding..."
                          : addedProductIds.has(product._id)
                            ? "Go to Cart"
                            : "Add to Cart"}
                      </button>
                      {product.stock > 0 && (
                        <button
                          type="button"
                          onClick={() => void buyNow(product._id, product.stock)}
                          disabled={addingProductId !== null}
                          className="rounded-lg border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Buy Now
                        </button>
                      )}
                    </div>
                    {cartFeedback?.productId === product._id && (
                      <p
                        className={`mt-3 text-sm ${cartFeedback.type === "success" ? "text-emerald-300" : "text-red-300"}`}
                        role={cartFeedback.type === "error" ? "alert" : "status"}
                        aria-live="polite"
                      >
                        {cartFeedback.message}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!isLoading && !errorMessage && pagination && (
          <nav className="mt-10 flex items-center justify-between border-t border-zinc-800 pt-6" aria-label="Product pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
              Previous
            </button>
            <p className="text-sm text-zinc-400">Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</p>
            <button type="button" disabled={pagination.totalPages === 0 || page >= pagination.totalPages} onClick={() => setPage((currentPage) => currentPage + 1)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
              Next
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}