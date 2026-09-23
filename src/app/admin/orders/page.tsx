import { Suspense } from "react";

import AdminOrdersPage from "./page.client";

export default function AdminOrdersRoute() {
  return (
    <Suspense fallback={null}>
      <AdminOrdersPage />
    </Suspense>
  );
}
