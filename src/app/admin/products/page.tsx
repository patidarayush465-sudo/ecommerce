import { Suspense } from "react";

import AdminProductsPage from "./page.client";

export default function AdminProductsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminProductsPage />
    </Suspense>
  );
}
