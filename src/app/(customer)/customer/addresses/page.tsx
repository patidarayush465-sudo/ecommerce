import { Suspense } from "react";

import CustomerAddressesPage from "./page.client";

export default function CustomerAddressesRoute() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-400">Loading addresses...</div>}>
      <CustomerAddressesPage />
    </Suspense>
  );
}