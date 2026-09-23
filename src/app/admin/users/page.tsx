"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type UserRole = "CUSTOMER" | "ADMIN";
type UserRecord = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  isEmailVerified: boolean;
  profileImage: string;
  createdAt: string;
};
type UsersResponse = {
  data?: {
    users: UserRecord[];
    stats: { totalUsers: number; customers: number; admins: number; verifiedCustomers: number };
    pagination: { page: number; limit: number; total: number; totalPages: number };
  };
  message?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function formatRole(role: UserRole) {
  return role === "ADMIN" ? "Admin" : "Customer";
}

function AdminUsersContent() {
  const router = useRouter();
  const query = useSearchParams();
  const page = Math.max(1, Number(query.get("page") ?? "1"));
  const searchParam = query.get("search") ?? "";
  const role = query.get("role") ?? "";
  const verification = query.get("isEmailVerified") ?? "";
  const [search, setSearch] = useState(searchParam);
  const [data, setData] = useState<UsersResponse["data"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() === searchParam) return;
      const params = new URLSearchParams(query.toString());
      if (search.trim()) params.set("search", search.trim()); else params.delete("search");
      params.delete("page");
      router.replace(`/admin/users?${params}`, { scroll: false });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [query, router, search, searchParam]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadUsers() {
      setLoading(true); setError("");
      const params = new URLSearchParams({ page: String(page), limit: "10", sortBy: "createdAt", sortOrder: "desc" });
      if (searchParam) params.set("search", searchParam);
      if (role) params.set("role", role);
      if (verification) params.set("isEmailVerified", verification);
      try {
        const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as UsersResponse;
        if (response.status === 401 || response.status === 403) { router.replace("/admin/login"); return; }
        if (!response.ok || !body.data) throw new Error(body.message ?? "Unable to load users.");
        setData(body.data);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Unable to load users.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void loadUsers();
    return () => controller.abort();
  }, [page, role, router, searchParam, verification, refreshKey]);

  function updateFilters(nextRole: string, nextVerification: string) {
    const params = new URLSearchParams();
    if (searchParam) params.set("search", searchParam);
    if (nextRole) params.set("role", nextRole);
    if (nextVerification) params.set("isEmailVerified", nextVerification);
    router.replace(`/admin/users${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  function changePage(nextPage: number) {
    const params = new URLSearchParams(query.toString());
    if (nextPage > 1) params.set("page", String(nextPage)); else params.delete("page");
    router.replace(`/admin/users?${params}`, { scroll: false });
  }

  return <section className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Administration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Users</h1><p className="mt-2 text-sm text-slate-600">Manage registered users</p></div><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-cyan-500 hover:text-cyan-700 disabled:opacity-60">{loading ? "Refreshing..." : "Refresh"}</button></header>
    {data && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Total Users", data.stats.totalUsers], ["Customers", data.stats.customers], ["Admins", data.stats.admins], ["Verified Customers", data.stats.verifiedCustomers]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p></div>)}</div>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr]"><div><label htmlFor="user-search" className="text-sm font-medium text-slate-700">Search by name, email or mobile</label><input id="user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-950 outline-none focus:border-cyan-500" /></div><div><label htmlFor="user-role" className="text-sm font-medium text-slate-700">Role</label><select id="user-role" value={role} onChange={(event) => updateFilters(event.target.value, verification)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="">All</option><option value="CUSTOMER">Customer</option><option value="ADMIN">Admin</option></select></div><div><label htmlFor="user-verification" className="text-sm font-medium text-slate-700">Email verification</label><select id="user-verification" value={verification} onChange={(event) => updateFilters(role, event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="">All</option><option value="true">Verified</option><option value="false">Unverified</option></select></div></div></div>
    {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}<button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="ml-3 font-semibold underline">Retry</button></div>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{loading && !data ? <div className="space-y-3 p-6" role="status">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div> : !data || data.users.length === 0 ? <div className="p-12 text-center"><h2 className="text-lg font-semibold text-slate-900">No users found</h2><p className="mt-2 text-sm text-slate-500">Try adjusting your search or filters.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Mobile</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Email Status</th><th className="px-5 py-3">Joined</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{data.users.map((user) => <tr key={user.id}><td className="px-5 py-4"><div className="flex items-center gap-3">{user.profileImage ? <img src={user.profileImage} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-100 font-semibold text-cyan-700">{user.name.charAt(0).toUpperCase()}</span>}<span className="font-semibold text-slate-950">{user.name}</span></div></td><td className="px-5 py-4 text-slate-600">{user.email}</td><td className="px-5 py-4 text-slate-600">{user.mobile || "—"}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{formatRole(user.role)}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.isEmailVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{user.isEmailVerified ? "Verified" : "Unverified"}</span></td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDate(user.createdAt)}</td><td className="px-5 py-4"><div className="flex flex-wrap justify-end gap-2"><Link href={`/admin/users/${user.id}`} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 hover:border-cyan-500 hover:bg-cyan-50">Details</Link><Link href={`/admin/users/${user.id}?tab=addresses`} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 hover:border-cyan-500 hover:bg-cyan-50">Addresses</Link><Link href={`/admin/users/${user.id}?tab=orders`} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 hover:border-cyan-500 hover:bg-cyan-50">Orders</Link></div></td></tr>)}</tbody></table></div>}{data && <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-500">Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</span><div className="flex gap-2"><button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1 || loading} className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" onClick={() => changePage(page + 1)} disabled={page >= data.pagination.totalPages || loading} className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div>}</div>
  </section>;
}

export default function AdminUsersPage() {
  return <Suspense fallback={<section className="mx-auto max-w-7xl"><div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" role="status">Loading users...</div></section>}><AdminUsersContent /></Suspense>;
}
