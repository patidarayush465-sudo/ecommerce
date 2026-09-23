"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { loadRazorpayScript } from "@/lib/razorpay-client";
import type {
  RazorpayCheckoutOptions,
  RazorpayPaymentFailureResponse,
  RazorpayPaymentResponse,
} from "@/types/razorpay";

type ProductImage = {
  url?: string;
};

type CartProduct = {
  _id: string;
  name: string;
  price: number;
  images?: ProductImage[];
};

type CartItem = {
  product: CartProduct | null;
  quantity: number;
  price: number;
  subtotal: number;
};

type CartData = {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  deliveryCharge: number;
  totalAmount: number;
};

type Address = {
  id: string;
  fullName: string;
  mobile: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

type CartResponse = {
  message?: string;
  cart?: CartData;
};

type AddressResponse = {
  message?: string;
  data?: Address;
};

type CustomerProfile = {
  name: string;
  email: string;
  mobile?: string;
};

type ProfileResponse = {
  message?: string;
  data?: CustomerProfile;
};

type CreateOrderResponse = {
  message?: string;
  data?: { id: string; orderNumber: string };
};

type CreateRazorpayOrderResponse = {
  message?: string;
  data?: {
    razorpayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
    orderId: string;
    orderNumber: string;
  };
};

type VerifyPaymentResponse = {
  success?: boolean;
  message?: string;
  orderId?: string;
  paymentStatus?: string;
  orderStatus?: string;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function getServiceError(status: number, message: string) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You are not authorized to access checkout.";
  if (status >= 500) return "The server is unavailable. Please try again later.";
  return message;
}

function getRazorpayError(status: number, message: string) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You are not authorized to start online payment.";
  if (status === 503) return message;
  if (status >= 500) return "Razorpay order creation failed. Please try again later.";
  return message;
}

function CheckoutSkeleton() {
  return (
    <div className="mt-8 grid animate-pulse gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <div className="h-52 rounded-xl border border-zinc-800 bg-zinc-900" />
        <div className="h-72 rounded-xl border border-zinc-800 bg-zinc-900" />
      </div>
      <div className="h-72 rounded-xl border border-zinc-800 bg-zinc-900" />
    </div>
  );
}

export default function CustomerCheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartData | null>(null);
  const [shippingAddress, setShippingAddress] = useState<Address | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cartError, setCartError] = useState("");
  const [shippingError, setShippingError] = useState("");
  const [placeOrderMessage, setPlaceOrderMessage] = useState("");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "ONLINE">("ONLINE");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCheckout() {
      setIsLoading(true);
      setCartError("");
      setShippingError("");

      try {
        const [cartResponse, shippingResponse] = await Promise.all([
          fetch("/api/customer/cart", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/customer/shipping-address", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        const cartBody = (await cartResponse.json()) as CartResponse;
        const shippingBody = (await shippingResponse.json()) as AddressResponse;

        if (cartResponse.status === 401 || shippingResponse.status === 401) {
          router.replace("/login");
          return;
        }

        if (!cartResponse.ok || !cartBody.cart) {
          setCartError(
            cartResponse.status >= 500
              ? "Unable to load your cart."
              : getServiceError(cartResponse.status, cartBody.message ?? "Unable to load your cart."),
          );
        } else {
          setCart(cartBody.cart);
        }

        if (shippingResponse.ok && shippingBody.data) {
          setShippingAddress(shippingBody.data);
        } else if (shippingResponse.status !== 404) {
          setShippingError(
            shippingResponse.status >= 500
              ? "Unable to load your shipping address."
              : getServiceError(shippingResponse.status, shippingBody.message ?? "Unable to load your shipping address."),
          );
        }

        const profileResponse = await fetch("/api/customer/profile", {
          cache: "no-store",
          signal: controller.signal,
        });
        const profileBody = (await profileResponse.json()) as ProfileResponse;

        if (profileResponse.ok && profileBody.data) {
          setCustomerProfile(profileBody.data);
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCartError("Unable to load your cart.");
        setShippingError("Unable to load your shipping address.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadCheckout();
    return () => controller.abort();
  }, [router]);

  function handleRazorpayPaymentFailure(response: RazorpayPaymentFailureResponse) {
    console.warn("Razorpay payment failed", {
      code: response.error?.code,
      reason: response.error?.reason,
    });
    setIsOpeningCheckout(false);
    setPlaceOrderMessage("Payment was not completed. No payment was confirmed.");
  }

  async function openRazorpayCheckout(
    applicationOrderId: string,
    orderNumber: string,
  ) {
    setIsOpeningCheckout(true);
    let checkoutOpened = false;

    try {
      const razorpayOrderResponse = await fetch(
        "/api/customer/payment/razorpay/create-order",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: applicationOrderId }),
        },
      );
      const razorpayOrderBody =
        (await razorpayOrderResponse.json()) as CreateRazorpayOrderResponse;

      console.info("Razorpay create-order API response", {
        status: razorpayOrderResponse.status,
        ok: razorpayOrderResponse.ok,
        body: razorpayOrderBody,
      });

      if (razorpayOrderResponse.status === 401) {
        router.replace("/login");
        return;
      }

      const razorpayOrder = razorpayOrderBody.data;

      if (!razorpayOrderResponse.ok || !razorpayOrder) {
        setPlaceOrderMessage(
          getRazorpayError(
            razorpayOrderResponse.status,
            razorpayOrderBody.message ?? "Unable to start online payment.",
          ),
        );
        return;
      }

      console.info("Razorpay order received", {
        razorpayOrderId: razorpayOrder.razorpayOrderId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyIdPresent: Boolean(razorpayOrder.keyId),
      });

      try {
        await loadRazorpayScript();
        console.info("Razorpay Checkout script loaded");
      } catch {
        console.error("Razorpay Checkout script failed to load");
        setPlaceOrderMessage("Razorpay Checkout failed to load. Check your connection and try again.");
        return;
      }

      if (!window.Razorpay) {
        console.error("Razorpay Checkout script loaded without window.Razorpay");
        setPlaceOrderMessage("Unable to initialize online payment. Please try again.");
        return;
      }

      console.info("Razorpay Checkout is available", {
        keyIdPresent: Boolean(razorpayOrder.keyId),
      });

      const options: RazorpayCheckoutOptions = {
        key: razorpayOrder.keyId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: "E-commerce Store",
        description: `Payment for order ${orderNumber}`,
        order_id: razorpayOrder.razorpayOrderId,
        prefill: {
          name: customerProfile?.name ?? shippingAddress?.fullName,
          email: customerProfile?.email,
          contact: customerProfile?.mobile ?? shippingAddress?.mobile,
        },
        handler: (response) => {
          void handleRazorpayPaymentResponse(applicationOrderId, response);
        },
        modal: {
          ondismiss: () => {
            setIsOpeningCheckout(false);
            setPlaceOrderMessage("Payment was cancelled. No payment was confirmed.");
          },
        },
      };

      const checkout = new window.Razorpay(options);
      checkout.on("payment.failed", handleRazorpayPaymentFailure);
      checkout.open();
      checkoutOpened = true;
      setPlaceOrderMessage(
        "Complete payment in the Razorpay window. Your order remains pending until server verification.",
      );
    } catch (error: unknown) {
      console.error("Razorpay Checkout initialization failed", error);
      setPlaceOrderMessage("Unable to open online payment. Please try again.");
    } finally {
      if (!checkoutOpened) {
        setIsOpeningCheckout(false);
      }
    }
  }

  async function handleRazorpayPaymentResponse(
    applicationOrderId: string,
    response: RazorpayPaymentResponse,
  ) {
    setIsOpeningCheckout(true);
    console.info("Razorpay payment response received", {
      paymentId: response.razorpay_payment_id,
      razorpayOrderId: response.razorpay_order_id,
    });

    try {
      const verificationResponse = await fetch(
        "/api/customer/payment/razorpay/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: applicationOrderId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          }),
        },
      );
      const verificationBody =
        (await verificationResponse.json()) as VerifyPaymentResponse;

      console.info("Razorpay payment verification response", {
        status: verificationResponse.status,
        ok: verificationResponse.ok,
        success: verificationBody.success,
        paymentStatus: verificationBody.paymentStatus,
        orderStatus: verificationBody.orderStatus,
      });

      if (verificationResponse.status === 401) {
        router.replace("/login");
        return;
      }

      if (
        !verificationResponse.ok ||
        !verificationBody.success ||
        verificationBody.paymentStatus !== "PAID"
      ) {
        setPlaceOrderMessage(
          verificationBody.message ??
            "Payment verification failed. Your order remains pending.",
        );
        return;
      }

      setPlaceOrderMessage("Payment successful. Redirecting to your order...");
      router.push(`/customer/order-success/${applicationOrderId}`);
    } catch (error: unknown) {
      console.error("Razorpay payment verification request failed", error);
      setPlaceOrderMessage(
        "Payment was received, but verification could not be completed. Please check your order status later.",
      );
    } finally {
      setIsOpeningCheckout(false);
    }
  }

  async function handlePlaceOrder() {
    if (!cart?.items.length || !shippingAddress || isCreatingOrder) return;

    setPlaceOrderMessage("");
    setIsCreatingOrder(true);

    try {
      const response = await fetch("/api/customer/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod }),
      });
      const responseBody = (await response.json()) as CreateOrderResponse;

      console.info("Application order API response", {
        status: response.status,
        ok: response.ok,
        body: responseBody,
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !responseBody.data?.id) {
        setPlaceOrderMessage(
          response.status >= 500
            ? "The server is unavailable. Please try again later."
            : responseBody.message ?? "Unable to create your order. Please try again.",
        );
        return;
      }

      console.info("Application order created", {
        orderId: responseBody.data.id,
        orderNumber: responseBody.data.orderNumber,
      });

      if (paymentMethod === "COD") {
        router.push(`/customer/order-success/${responseBody.data.id}`);
        return;
      }

      await openRazorpayCheckout(
        responseBody.data.id,
        responseBody.data.orderNumber,
      );
    } catch {
      setPlaceOrderMessage("Unable to create your order. Please try again.");
    } finally {
      setIsCreatingOrder(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/customer/cart" className="text-sm text-zinc-400 transition hover:text-amber-300">
              Back to cart
            </Link>
            <p className="mt-7 text-sm font-medium uppercase tracking-[0.24em] text-amber-300">Order preparation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Checkout</h1>
          </div>
          <Link href="/customer/home" className="text-sm text-zinc-400 transition hover:text-amber-300">Customer home</Link>
        </header>

        {cartError && <p className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{cartError}</p>}
        {shippingError && <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{shippingError}</p>}

        {isLoading ? (
          <CheckoutSkeleton />
        ) : cart && cart.items.length === 0 ? (
          <section className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">Nothing to check out</p>
            <h2 className="mt-3 text-2xl font-semibold">Your cart is empty</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">Add products before continuing to checkout.</p>
            <Link href="/products" className="mt-7 inline-flex rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200">Continue Shopping</Link>
          </section>
        ) : cart && !cartError ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div className="space-y-6">
              <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-amber-300">Delivery</p>
                    <h2 className="mt-2 text-xl font-semibold">Shipping Address</h2>
                  </div>
                  <Link href="/customer/addresses?returnTo=%2Fcustomer%2Fcheckout" className="text-sm font-semibold text-amber-300 transition hover:text-amber-200">Change Address</Link>
                </div>
                {shippingAddress ? (
                  <address className="mt-5 not-italic text-sm leading-7 text-zinc-300">
                    <p className="font-semibold text-zinc-100">{shippingAddress.fullName}</p>
                    <p>{shippingAddress.mobile}</p>
                    <p>{shippingAddress.addressLine}</p>
                    <p>{shippingAddress.city}, {shippingAddress.state} {shippingAddress.pincode}</p>
                    <p>{shippingAddress.country}</p>
                  </address>
                ) : (
                  <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-4 text-sm text-amber-100">
                    <p>No shipping address selected</p>
                    <Link href="/customer/addresses" className="mt-3 inline-flex rounded-lg bg-amber-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-amber-200">Select Shipping Address</Link>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-amber-300">Review</p>
                <h2 className="mt-2 text-xl font-semibold">Cart items</h2>
                <div className="mt-5 divide-y divide-zinc-800">
                  {cart.items.map((item, index) => {
                    const imageUrl = item.product?.images?.find((image) => image.url)?.url;
                    return (
                      <div key={item.product?._id ?? `item-${index}`} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                          {imageUrl ? <div role="img" aria-label={item.product?.name ?? "Product"} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${imageUrl}")` }} /> : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-zinc-500">No image</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold">{item.product?.name ?? "Unavailable product"}</h3>
                          <p className="mt-1 text-sm text-zinc-400">{formatPrice(item.price)} × {item.quantity}</p>
                        </div>
                        <p className="font-semibold text-amber-300">{formatPrice(item.subtotal)}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:sticky lg:top-6">
              <h2 className="text-xl font-semibold">Order Summary</h2>
              <fieldset className="mt-6 space-y-3 border-b border-zinc-800 pb-5">
                <legend className="text-sm font-semibold text-zinc-200">Payment method</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-700 p-3 text-sm hover:border-amber-300">
                  <input type="radio" name="paymentMethod" value="COD" checked={paymentMethod === "COD"} onChange={() => setPaymentMethod("COD")} className="mt-1 accent-amber-300" />
                  <span><span className="block font-medium text-zinc-100">Cash on Delivery</span><span className="mt-1 block text-xs text-zinc-500">Confirm order now; payment remains pending.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-700 p-3 text-sm hover:border-amber-300">
                  <input type="radio" name="paymentMethod" value="ONLINE" checked={paymentMethod === "ONLINE"} onChange={() => setPaymentMethod("ONLINE")} className="mt-1 accent-amber-300" />
                  <span><span className="block font-medium text-zinc-100">Online Payment</span><span className="mt-1 block text-xs text-zinc-500">Payment integration will be added next.</span></span>
                </label>
              </fieldset>
              <dl className="mt-6 space-y-4 border-y border-zinc-800 py-5 text-sm">
                <div className="flex justify-between gap-4 text-zinc-400"><dt>Total items</dt><dd className="font-medium text-zinc-100">{cart.totalItems}</dd></div>
                <div className="flex justify-between gap-4 text-zinc-400"><dt>Subtotal</dt><dd className="font-medium text-zinc-100">{formatPrice(cart.subtotal)}</dd></div>
                <div className="flex justify-between gap-4 text-zinc-400"><dt>Delivery</dt><dd className="font-medium text-zinc-100">{cart.deliveryCharge ? formatPrice(cart.deliveryCharge) : "FREE"}</dd></div>
                {cart.deliveryCharge > 0 && <p className="text-xs text-amber-200">Add {formatPrice(499 - cart.subtotal)} more for free delivery</p>}
                <div className="flex justify-between gap-4"><dt className="text-zinc-300">Total amount</dt><dd className="text-xl font-semibold text-amber-300">{formatPrice(cart.totalAmount)}</dd></div>
              </dl>
              <button
                type="button"
                disabled={!shippingAddress || isCreatingOrder || isOpeningCheckout}
                onClick={() => void handlePlaceOrder()}
                className="mt-6 w-full rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingOrder
                  ? "Creating Order..."
                  : isOpeningCheckout
                    ? "Opening Payment..."
                    : "Place Order"}
              </button>
              <p className="mt-3 text-center text-xs leading-5 text-zinc-500">Online payments remain pending until server verification.</p>
              {placeOrderMessage && <p className="mt-2 text-center text-xs text-amber-200" role="status">{placeOrderMessage}</p>}
              {!shippingAddress && <p className="mt-3 text-center text-xs text-amber-300">Select a shipping address to continue.</p>}
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}