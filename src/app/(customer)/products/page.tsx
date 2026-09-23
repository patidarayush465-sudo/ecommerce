import { Suspense } from "react";

import CustomerProductsPage from "./page.client";

export default function CustomerProductsRoute() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-400">Loading products...</div>}>
      <CustomerProductsPage />
    </Suspense>
  );
}