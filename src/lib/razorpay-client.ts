const RAZORPAY_SCRIPT_ID = "razorpay-checkout-script";
const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let scriptLoadPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay Checkout is only available in the browser"));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(RAZORPAY_SCRIPT_ID);

    if (existingScript instanceof HTMLScriptElement) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Unable to load Razorpay Checkout")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = RAZORPAY_SCRIPT_ID;
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay Checkout"));
    document.body.appendChild(script);
  }).catch((error: unknown) => {
    scriptLoadPromise = null;
    throw error;
  });

  return scriptLoadPromise;
}