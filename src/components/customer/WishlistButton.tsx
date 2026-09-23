"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type WishlistButtonProps = {
  productId: string;
  variant?: "default" | "image";
  initialIsWishlisted?: boolean;
  skipInitialCheck?: boolean;
  onWishlistChange?: (isWishlisted: boolean) => void;
};

export default function WishlistButton({ productId, variant = "default", initialIsWishlisted = false, skipInitialCheck = false, onWishlistChange }: WishlistButtonProps) {
  const router = useRouter();
  const [isWishlisted, setIsWishlisted] = useState(initialIsWishlisted);
  const [isLoading, setIsLoading] = useState(!skipInitialCheck);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (skipInitialCheck) return;
    const controller = new AbortController();
    async function loadStatus() {
      try {
        const response = await fetch(`/api/customer/wishlist/check/${productId}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as { isWishlisted?: boolean };
        if (response.status === 401) { router.replace("/login"); return; }
        if (response.ok) setIsWishlisted(Boolean(body.isWishlisted));
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setErrorMessage("Unable to load wishlist status.");
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    }
    void loadStatus();
    return () => controller.abort();
  }, [productId, router, skipInitialCheck]);

  async function toggleWishlist() {
    if (isSaving || isLoading) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      const response = await fetch(isWishlisted ? `/api/customer/wishlist/${productId}` : "/api/customer/wishlist", {
        method: isWishlisted ? "DELETE" : "POST",
        headers: isWishlisted ? undefined : { "Content-Type": "application/json" },
        body: isWishlisted ? undefined : JSON.stringify({ productId }),
      });
      const body = (await response.json()) as { message?: string };
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) { setErrorMessage(body.message ?? "Unable to update wishlist."); return; }
      const nextValue = !isWishlisted;
      setIsWishlisted(nextValue);
      onWishlistChange?.(nextValue);
    } catch { setErrorMessage("Unable to update wishlist. Please try again."); }
    finally { setIsSaving(false); }
  }

  return (
    <div className={variant === "image" ? "absolute right-2.5 top-2.5 z-10" : undefined}>
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggleWishlist(); }} disabled={isLoading || isSaving} aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"} title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"} className={variant === "image" ? `flex h-10 w-10 items-center justify-center rounded-full border bg-zinc-950/85 text-2xl leading-none shadow-lg backdrop-blur-sm transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60 ${isWishlisted ? "border-amber-300 text-amber-300" : "border-zinc-600 text-zinc-100"}` : `rounded-lg border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${isWishlisted ? "border-amber-300 bg-amber-300 text-zinc-950" : "border-zinc-700 text-amber-200 hover:border-amber-300"}`}>
        {variant === "image" ? (isWishlisted ? "♥" : "♡") : isSaving ? "Saving..." : isWishlisted ? "♥ Remove from Wishlist" : "♡ Add to Wishlist"}
      </button>
      {errorMessage && <p className="mt-2 text-xs text-red-300" role="alert">{errorMessage}</p>}
    </div>
  );
}