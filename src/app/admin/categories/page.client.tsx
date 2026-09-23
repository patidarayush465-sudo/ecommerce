"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createCategorySchema, updateCategorySchema } from "@/validations/category.validation";

type Category = { id: string; name: string; description?: string; isActive: boolean; createdAt?: string };
type Pagination = { page: number; limit: number; total: number; totalPages: number };
type FormValues = { name: string; description: string; isActive: boolean };
type ApiBody = { message?: string; data?: Category; errors?: Array<{ message?: string }> };
type ListBody = { message?: string; errors?: Array<{ message?: string }>; data?: { categories: Category[]; pagination: Pagination } };

const LIMIT = 10;
const blankForm: FormValues = { name: "", description: "", isActive: true };

function messageFor(status: number, body: ApiBody | ListBody) {
  if (status === 400) return body.errors?.[0]?.message ?? body.message ?? "Please check the category details.";
  if (status === 403) return "You are not authorized to manage categories.";
  if (status === 409) return "A category with this name already exists.";
  if (status >= 500) return "Something went wrong on the server. Please try again.";
  return body.message ?? "Unable to complete the request.";
}

function dateLabel(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

export default function AdminCategoriesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const searchParam = params.get("search") ?? "";
  const parsedPage = Number(params.get("page") ?? "1");
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page, limit: LIMIT, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  function login() { router.replace("/admin/login"); }
  function setUrl(nextSearch: string, nextPage: number) {
    const query = new URLSearchParams();
    if (nextSearch) query.set("search", nextSearch);
    if (nextPage > 1) query.set("page", String(nextPage));
    router.replace(`/admin/categories${query.toString() ? `?${query}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (searchParam) query.set("search", searchParam);
      try {
        const response = await fetch(`/api/admin/categories?${query}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as ListBody;
        if (response.status === 401) { router.replace("/admin/login"); return; }
        if (!response.ok) { setError(messageFor(response.status, body)); return; }
        setCategories(body.data?.categories ?? []);
        setPagination(body.data?.pagination ?? { page, limit: LIMIT, total: 0, totalPages: 0 });
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Network error. Please try again.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [page, router, searchParam]);

  async function refresh() {
    const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (searchParam) query.set("search", searchParam);
    const response = await fetch(`/api/admin/categories?${query}`, { cache: "no-store" });
    const body = (await response.json()) as ListBody;
    if (response.status === 401) { login(); return; }
    if (!response.ok) { setError(messageFor(response.status, body)); return; }
    setCategories(body.data?.categories ?? []);
    if (body.data?.pagination) setPagination(body.data.pagination);
  }

  function openCreate() { setEditingId(null); setForm(blankForm); setModalError(""); setModalOpen(true); }
  async function openEdit(id: string) {
    setEditingId(id); setModalError(""); setModalOpen(true); setSaving(true);
    try {
      const response = await fetch(`/api/admin/categories/${id}`, { cache: "no-store" });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) { login(); return; }
      if (!response.ok || !body.data) { setModalError(messageFor(response.status, body)); return; }
      setForm({ name: body.data.name, description: body.data.description ?? "", isActive: body.data.isActive });
    } catch { setModalError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setModalError("");
    const values = { name: form.name, description: form.description, isActive: form.isActive };
    const result = editingId ? updateCategorySchema.safeParse(values) : createCategorySchema.safeParse({ name: values.name, description: values.description });
    if (!result.success) { setModalError(result.error.issues[0]?.message ?? "Please check the category details."); return; }
    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/admin/categories/${editingId}` : "/api/admin/categories", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? values : { name: values.name, description: values.description }),
      });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) { login(); return; }
      if (!response.ok) { setModalError(messageFor(response.status, body)); return; }
      if (!editingId && !values.isActive && body.data?.id) {
        const statusResponse = await fetch(`/api/admin/categories/${body.data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: false }) });
        if (statusResponse.status === 401) { login(); return; }
        if (!statusResponse.ok) { const statusBody = (await statusResponse.json()) as ApiBody; setModalError(messageFor(statusResponse.status, statusBody)); return; }
      }
      setEditingId(null); setModalOpen(false); await refresh();
    } catch { setModalError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Delete the category "${category.name}"?`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, { method: "DELETE" });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) { login(); return; }
      if (!response.ok) { setError(messageFor(response.status, body)); return; }
      await refresh();
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  return <section className="mx-auto max-w-6xl">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Catalog</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Categories</h1><p className="mt-2 text-sm text-slate-600">Organize the products in your store.</p></div><button type="button" onClick={openCreate} disabled={saving} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Add Category</button></div>
    <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-4"><label htmlFor="category-search" className="block text-sm font-medium text-slate-700">Search categories</label><input id="category-search" value={searchParam} onChange={(event) => setUrl(event.target.value.trim(), 1)} placeholder="Search by name" className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-500" /></div>
      {error && <p className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
      {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading categories...</div> : categories.length === 0 ? <div className="p-10 text-center"><h2 className="text-lg font-semibold text-slate-900">No categories found</h2><p className="mt-2 text-sm text-slate-500">Create a category to organize your catalog.</p><button type="button" onClick={openCreate} className="mt-5 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950">Add Category</button></div> : <><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{categories.map((category) => <tr key={category.id}><td className="px-5 py-4 font-semibold text-slate-950">{category.name}</td><td className="px-5 py-4">{category.description || "-"}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${category.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{category.isActive ? "Active" : "Inactive"}</span></td><td className="px-5 py-4 text-slate-500">{dateLabel(category.createdAt)}</td><td className="px-5 py-4 text-right"><button type="button" onClick={() => void openEdit(category.id)} disabled={saving} className="mr-3 font-semibold text-cyan-700 disabled:opacity-50">Edit</button><button type="button" onClick={() => void remove(category)} disabled={saving} className="font-semibold text-rose-600 disabled:opacity-50">Delete</button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500"><span>Page {page}{pagination.totalPages ? ` of ${pagination.totalPages}` : ""}</span><div className="flex gap-2"><button type="button" onClick={() => setUrl(searchParam, page - 1)} disabled={page === 1 || saving} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Previous</button><button type="button" onClick={() => setUrl(searchParam, page + 1)} disabled={page >= pagination.totalPages || saving} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Next</button></div></div></>}
    </div>
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4" role="dialog" aria-modal="true" aria-labelledby="category-modal-title"><div className="w-full max-w-lg rounded-xl bg-white p-6"><div className="flex justify-between"><h2 id="category-modal-title" className="text-xl font-semibold">{editingId ? "Edit Category" : "Add Category"}</h2><button type="button" onClick={() => { if (!saving) { setEditingId(null); setForm(blankForm); setModalOpen(false); } }} aria-label="Close dialog">&times;</button></div><form onSubmit={submit} className="mt-6 space-y-5" noValidate><div><label htmlFor="category-name" className="mb-2 block text-sm font-medium">Name</label><input id="category-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-950" required /></div><div><label htmlFor="category-description" className="mb-2 block text-sm font-medium">Description</label><textarea id="category-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-950" /></div><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Active category</label>{modalError && <p className="text-sm text-rose-700" role="alert">{modalError}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={() => { if (!saving) { setEditingId(null); setForm(blankForm); setModalOpen(false); } }} disabled={saving} className="rounded-lg border px-4 py-2.5">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-slate-950 px-4 py-2.5 font-semibold text-white">{saving ? "Saving..." : "Save"}</button></div></form></div></div>}
  </section>;
}
