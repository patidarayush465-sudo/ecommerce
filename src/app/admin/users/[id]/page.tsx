"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type UserDetail = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: "CUSTOMER" | "ADMIN";
  isEmailVerified: boolean;
  profileImage: string;
  dateOfBirth: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserResponse = { data?: UserDetail; message?: string };
type Address = { _id: string; fullName: string; mobile: string; addressLine: string; city: string; state: string; pincode: string; country: string; isDefault: boolean };
type Order = { _id: string; orderNumber: string; totalItems: number; totalAmount: number; paymentMethod: string; paymentStatus: string; orderStatus: string; createdAt: string; items: Array<{ productName: string; quantity: number; price: number }> };
type AddressesResponse = { data?: Address[]; message?: string };
type OrdersResponse = { data?: Order[]; pagination?: { page: number; limit: number; total: number; totalPages: number }; message?: string };
type Tab = "details" | "addresses" | "orders";

function getTab(value: string | null): Tab {
  return value === "addresses" || value === "orders" ? value : "details";
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value))
    : "Not provided";
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function statusClass(status: string) {
  return status === "CANCELLED" || status === "FAILED" ? "bg-rose-50 text-rose-700" : status === "PAID" || status === "DELIVERED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const query = useSearchParams();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(() => getTab(query.get("tab")));
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPagination, setOrdersPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadUser() {
      try {
        const response = await fetch(`/api/admin/users/${params.id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as UserResponse;
        if (response.status === 401 || response.status === 403) {
          router.replace("/admin/login");
          return;
        }
        if (!response.ok || !body.data) {
          throw new Error(body.message ?? "Unable to load user.");
        }
        setUser(body.data);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Unable to load user.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadUser();
    return () => controller.abort();
  }, [params.id, router]);

  useEffect(() => {
    if (tab === "details") return;
    const controller = new AbortController();
    async function loadTab() {
      setTabLoading(true); setTabError("");
      const endpoint = tab === "addresses" ? `/api/admin/users/${params.id}/addresses` : `/api/admin/users/${params.id}/orders?page=${ordersPage}&limit=10`;
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = tab === "addresses" ? await response.json() as AddressesResponse : await response.json() as OrdersResponse;
        if (response.status === 401 || response.status === 403) { router.replace("/admin/login"); return; }
        if (!response.ok) throw new Error(body.message ?? "Unable to load this tab.");
        if (tab === "addresses") setAddresses((body as AddressesResponse).data ?? []);
        else { const ordersBody = body as OrdersResponse; setOrders(ordersBody.data ?? []); setOrdersPagination(ordersBody.pagination ?? { page: ordersPage, limit: 10, total: 0, totalPages: 0 }); }
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setTabError(caught instanceof Error ? caught.message : "Unable to load this tab.");
      } finally { if (!controller.signal.aborted) setTabLoading(false); }
    }
    void loadTab();
    return () => controller.abort();
  }, [ordersPage, params.id, router, tab]);

  if (loading) {
    return (
      <section className="mx-auto max-w-4xl">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" role="status">
          Loading user...
        </div>
      </section>
    );
  }

  if (error || !user) {
    return (
      <section className="mx-auto max-w-4xl">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <h1 className="text-xl font-semibold">User unavailable</h1>
          <p className="mt-2 text-sm">{error || "User not found."}</p>
          <Link href="/admin/users" className="mt-5 inline-block font-semibold underline">
            Back to users
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/admin/users" className="text-sm font-semibold text-cyan-700 hover:text-cyan-900">
          Back to users
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">User details</h1>
      </div>
      <div className="border-b border-slate-200">
        <div className="flex overflow-x-auto" role="tablist" aria-label="User information">
          {([["details", "Details"], ["addresses", "Addresses"], ["orders", "Orders"]] as Array<[Tab, string]>).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition first:pl-0 ${tab === value ? "border-cyan-600 text-cyan-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"}`}>{label}</button>)}
        </div>
      </div>
      {tab === "details" && <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-start gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center">
          {user.profileImage ? (
            <img src={user.profileImage} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-cyan-100 text-3xl font-semibold text-cyan-700">
              {user.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">{user.name}</h2>
            <p className="mt-1 text-slate-500">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {user.role === "ADMIN" ? "Admin" : "Customer"}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.isEmailVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {user.isEmailVerified ? "Email verified" : "Email unverified"}
              </span>
            </div>
          </div>
        </div>
        <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <div><dt className="text-sm font-medium text-slate-500">Email</dt><dd className="mt-1 text-slate-900">{user.email}</dd></div>
          <div><dt className="text-sm font-medium text-slate-500">Mobile</dt><dd className="mt-1 text-slate-900">{user.mobile || "Not provided"}</dd></div>
          <div><dt className="text-sm font-medium text-slate-500">Role</dt><dd className="mt-1 text-slate-900">{user.role === "ADMIN" ? "Admin" : "Customer"}</dd></div>
          <div><dt className="text-sm font-medium text-slate-500">Date of birth</dt><dd className="mt-1 text-slate-900">{formatDate(user.dateOfBirth)}</dd></div>
          <div><dt className="text-sm font-medium text-slate-500">Account created</dt><dd className="mt-1 text-slate-900">{formatDate(user.createdAt)}</dd></div>
          <div><dt className="text-sm font-medium text-slate-500">Last updated</dt><dd className="mt-1 text-slate-900">{formatDate(user.updatedAt)}</dd></div>
        </dl>
      </div>}
      {tab !== "details" && <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {tabLoading ? <p className="py-8 text-center text-sm text-slate-500" role="status">Loading {tab}...</p> : tabError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{tabError}</p> : tab === "addresses" ? addresses.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No addresses found</p> : <div className="grid gap-4 sm:grid-cols-2">{addresses.map((address) => <article key={address._id} className="rounded-lg border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-slate-950">{address.fullName}</h2>{address.isDefault && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Default</span>}</div><dl className="mt-4 space-y-2 text-sm text-slate-600"><div><dt className="inline font-medium text-slate-500">Mobile: </dt><dd className="inline">{address.mobile}</dd></div><div><dt className="inline font-medium text-slate-500">Address: </dt><dd className="inline">{address.addressLine}</dd></div><div><dt className="inline font-medium text-slate-500">City: </dt><dd className="inline">{address.city}</dd></div><div><dt className="inline font-medium text-slate-500">State: </dt><dd className="inline">{address.state}</dd></div><div><dt className="inline font-medium text-slate-500">Pincode: </dt><dd className="inline">{address.pincode}</dd></div><div><dt className="inline font-medium text-slate-500">Country: </dt><dd className="inline">{address.country}</dd></div></dl></article>)}</div> : orders.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No orders found</p> : <><div className="space-y-3">{orders.map((order) => <Link key={order._id} href={`/admin/orders/${order._id}`} className="block rounded-lg border border-slate-200 p-4 transition hover:border-cyan-400 hover:bg-cyan-50/30"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-950">{order.orderNumber}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(order.createdAt)} · {order.totalItems} {order.totalItems === 1 ? "Item" : "Items"}</p></div><p className="text-lg font-semibold text-slate-950">{formatAmount(order.totalAmount)}</p></div><div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{order.paymentMethod}</span><span className={`rounded-full px-2.5 py-1 ${statusClass(order.paymentStatus)}`}>{order.paymentStatus}</span><span className={`rounded-full px-2.5 py-1 ${statusClass(order.orderStatus)}`}>{order.orderStatus}</span></div></Link>)}</div>{ordersPagination.totalPages > 1 && <div className="mt-6 flex items-center justify-between gap-3 text-sm"><button type="button" onClick={() => setOrdersPage((page) => page - 1)} disabled={ordersPage <= 1 || tabLoading} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-50">Previous</button><span className="text-slate-500">Page {ordersPagination.page} of {ordersPagination.totalPages}</span><button type="button" onClick={() => setOrdersPage((page) => page + 1)} disabled={ordersPage >= ordersPagination.totalPages || tabLoading} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-50">Next</button></div>}</>}
      </div>}
    </section>
  );
}
