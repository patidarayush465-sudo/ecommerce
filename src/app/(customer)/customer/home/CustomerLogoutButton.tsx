"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CustomerLogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/customer/logout", {
        method: "POST",
      });
      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        setErrorMessage(body.message ?? "Unable to log out. Please try again.");
        return;
      }

      router.replace("/login");
    } catch {
      setErrorMessage("Unable to log out. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={isLoggingOut}
        aria-busy={isLoggingOut}
        className="rounded-lg border border-amber-300 px-6 py-3 font-semibold text-amber-200 transition-colors hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
      {errorMessage && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}