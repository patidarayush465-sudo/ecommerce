import { Suspense } from "react";

import AdminSubcategoriesPage from "./page.client";

export default function AdminSubcategoriesRoute() {
  return (
    <Suspense fallback={null}>
      <AdminSubcategoriesPage />
    </Suspense>
  );
}
