import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      <AdminSidebar />
      <main className="admin-panel min-w-0 flex-1 bg-slate-100 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  );
}
