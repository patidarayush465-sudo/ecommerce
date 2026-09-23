import { Suspense } from "react";

import AdminCategoriesPage from "./page.client";

export default function AdminCategoriesRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCategoriesPage />
    </Suspense>
  );
}
