import { Suspense } from "react";

import ResetPasswordClient from "./page.client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-400">Loading...</div>}>
      <ResetPasswordClient />
    </Suspense>
  );
}