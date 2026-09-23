"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type WishlistItem = {
  productId: string;
  name: string;
  description: string;
  images: Array<{ url: string; publicId: string }>;
  mrp?: number;
  discountPercent?: number;
  sellingPrice: number;
  stock: number;
  isActive: boolean;
};
type WishlistResponse = { message?: string; data?: WishlistItem[] };
type CartResponse = { message?: string };

function formatPrice(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value); }

export default function CustomerWishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cartMessage, setCartMessage] = useState<{ id: string; message: string; error?: boolean } | null>(null);

  const loadWishlist = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/customer/wishlist", { cache: "no-store", signal });
      const body = (await response.json()) as WishlistResponse;
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) { setErrorMessage(body.message ?? "Unable to load wishlist."); return; }
      setItems(body.data ?? []);
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setErrorMessage("Unable to load wishlist. Please try again.");
    } finally { if (!signal?.aborted) setIsLoading(false); }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadWishlist(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadWishlist]);

  async function removeItem(productId: string) {
    if (busyId) return;
    setBusyId(productId);
    try {
      const response = await fetch(`/api/customer/wishlist/${productId}`, { method: "DELETE" });
      const body = (await response.json()) as { message?: string };
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) { setErrorMessage(body.message ?? "Unable to remove product."); return; }
      setItems((current) => current.filter((item) => item.productId !== productId));
    } catch { setErrorMessage("Unable to remove product. Please try again."); }
    finally { setBusyId(null); }
  }

  async function addToCart(item: WishlistItem) {
    if (busyId || !item.isActive || item.stock <= 0) return;
    setBusyId(item.productId);
    setCartMessage(null);
    try {
      const response = await fetch("/api/customer/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: item.productId, quantity: 1 }) });
      const body = (await response.json()) as CartResponse;
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) { setCartMessage({ id: item.productId, message: body.message ?? "Unable to add to cart.", error: true }); return; }
      setCartMessage({ id: item.productId, message: body.message ?? "Added to cart" });
    } catch { setCartMessage({ id: item.productId, message: "Unable to add to cart. Please try again.", error: true }); }
    finally { setBusyId(null); }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/customer/home" className="text-sm text-zinc-400 hover:text-amber-300">Back to customer home</Link>
        <header className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-6"><div><p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">Customer account</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Your Wishlist</h1></div><Link href="/products" className="text-sm font-semibold text-amber-300 hover:text-amber-200">Continue Shopping</Link></header>
        {errorMessage && <p className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{errorMessage}</p>}
        {isLoading ? <p className="mt-10 text-zinc-400" role="status">Loading wishlist...</p> : items.length === 0 ? <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center"><h2 className="text-2xl font-semibold">Your wishlist is empty</h2><p className="mt-3 text-sm text-zinc-400">Save products you love and find them here later.</p><Link href="/products" className="mt-7 inline-flex rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-200">Continue Shopping</Link></section> : <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <article key={item.productId} className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"><Link href={`/products/${item.productId}`} className="aspect-[4/3] bg-zinc-800">{item.images[0]?.url ? <div role="img" aria-label={item.name} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${item.images[0].url}")` }} /> : <div className="flex h-full items-center justify-center text-sm text-zinc-500">No image</div>}</Link><div className="flex flex-1 flex-col p-5"><Link href={`/products/${item.productId}`} className="line-clamp-2 text-lg font-semibold hover:text-amber-300">{item.name}</Link><p className="mt-3 line-clamp-2 text-sm text-zinc-400">{item.description}</p><p className="mt-4 text-xs text-zinc-500">MRP {typeof item.mrp === "number" ? formatPrice(item.mrp) : "Not available"}</p><p className="text-xl font-semibold text-amber-300">{formatPrice(item.sellingPrice)}</p>{item.discountPercent ? <p className="mt-1 text-xs text-emerald-300">{item.discountPercent}% OFF</p> : null}<p className={`mt-2 text-sm font-semibold ${!item.isActive ? "text-red-300" : item.stock > 0 ? "text-emerald-300" : "text-zinc-400"}`}>{!item.isActive ? "Currently unavailable" : item.stock > 0 ? `${item.stock} in stock` : "Out of Stock"}</p><div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2"><button type="button" disabled={Boolean(busyId) || !item.isActive || item.stock <= 0} onClick={() => void addToCart(item)} className="rounded-lg bg-amber-300 px-3 py-2.5 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50">{busyId === item.productId ? "Adding..." : item.stock <= 0 ? "Out of Stock" : !item.isActive ? "Unavailable" : "Add to Cart"}</button><button type="button" disabled={Boolean(busyId)} onClick={() => void removeItem(item.productId)} className="rounded-lg border border-zinc-700 px-3 py-2.5 text-sm font-semibold text-zinc-100 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-50">{busyId === item.productId ? "Working..." : "Remove"}</button></div>{cartMessage?.id === item.productId && <p className={`mt-3 text-sm ${cartMessage.error ? "text-red-300" : "text-emerald-300"}`} role={cartMessage.error ? "alert" : "status"}>{cartMessage.message}</p>}</div></article>)}</section>}
      </div>
    </main>
  );
}