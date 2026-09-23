"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  createSubCategorySchema,
  updateSubCategorySchema,
} from "@/validations/subcategory.validation";

type Category = { id: string; name: string; isActive: boolean };
type Subcategory = {
  id: string;
  name: string;
  description?: string;
  category: { id: string; name: string };
  isActive: boolean;
};
type Pagination = { page: number; limit: number; total: number; totalPages: number };
type FormValues = { name: string; description: string; category: string; isActive: boolean };
type ApiBody = { message?: string; data?: Subcategory; errors?: Array<{ message?: string }> };
type SubcategoryListBody = {
  message?: string;
  errors?: Array<{ message?: string }>;
  data?: { subcategories: Subcategory[]; pagination: Pagination };
};
type CategoryListBody = {
  message?: string;
  errors?: Array<{ message?: string }>;
  data?: { categories: Category[]; pagination: Pagination };
};

const LIMIT = 10;
const CATEGORY_LIMIT = 100;
const blankForm: FormValues = { name: "", description: "", category: "", isActive: true };

function getErrorMessage(status: number, body: ApiBody | SubcategoryListBody | CategoryListBody) {
  if (status === 400) return body.errors?.[0]?.message ?? body.message ?? "Please check the subcategory details.";
  if (status === 401) return "Your admin session has expired. Redirecting to login...";
  if (status === 403) return "You are not authorized to manage subcategories.";
  if (status === 404) return "The selected category or subcategory was not found.";
  if (status === 409) return "A subcategory with this name already exists in this category.";
  if (status >= 500) return "Something went wrong on the server. Please try again.";
  return body.message ?? "Unable to complete the request.";
}

export default function AdminSubcategoriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const categoryFilter = searchParams.get("category") ?? "";
  const parsedPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page, limit: LIMIT, total: 0, totalPages: 0 });
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(blankForm);

  function goToLogin() { router.replace("/admin/login"); }

  function updateUrl(nextSearch: string, nextCategory: string, nextPage: number) {
    const query = new URLSearchParams();
    if (nextSearch) query.set("search", nextSearch);
    if (nextCategory) query.set("category", nextCategory);
    if (nextPage > 1) query.set("page", String(nextPage));
    router.replace(`/admin/subcategories${query.toString() ? `?${query}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      setCategoriesLoading(true);
      try {
        const response = await fetch(`/api/admin/categories?page=1&limit=${CATEGORY_LIMIT}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as CategoryListBody;
        if (response.status === 401) { router.replace("/admin/login"); return; }
        if (!response.ok) { setError(getErrorMessage(response.status, body)); return; }
        setCategories(body.data?.categories ?? []);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Network error while loading categories.");
      } finally {
        if (!controller.signal.aborted) setCategoriesLoading(false);
      }
    }
    void loadCategories();
    return () => controller.abort();
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSubcategories() {
      setLoading(true);
      setError("");
      const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) query.set("search", search);
      if (categoryFilter) query.set("category", categoryFilter);
      try {
        const response = await fetch(`/api/admin/subcategories?${query}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as SubcategoryListBody;
        if (response.status === 401) { router.replace("/admin/login"); return; }
        if (!response.ok) { setError(getErrorMessage(response.status, body)); return; }
        setSubcategories(body.data?.subcategories ?? []);
        setPagination(body.data?.pagination ?? { page, limit: LIMIT, total: 0, totalPages: 0 });
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Network error while loading subcategories.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadSubcategories();
    return () => controller.abort();
  }, [categoryFilter, page, router, search]);

  async function refresh() {
    const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) query.set("search", search);
    if (categoryFilter) query.set("category", categoryFilter);
    const response = await fetch(`/api/admin/subcategories?${query}`, { cache: "no-store" });
    const body = (await response.json()) as SubcategoryListBody;
    if (response.status === 401) { goToLogin(); return; }
    if (!response.ok) { setError(getErrorMessage(response.status, body)); return; }
    setSubcategories(body.data?.subcategories ?? []);
    if (body.data?.pagination) setPagination(body.data.pagination);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...blankForm, category: categoryFilter });
    setModalError("");
    setModalOpen(true);
  }

  async function openEdit(id: string) {
    setEditingId(id);
    setModalError("");
    setModalOpen(true);
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/subcategories/${id}`, { cache: "no-store" });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) { goToLogin(); return; }
      if (!response.ok || !body.data) { setModalError(getErrorMessage(response.status, body)); return; }
      setForm({ name: body.data.name, description: body.data.description ?? "", category: body.data.category.id, isActive: body.data.isActive });
    } catch { setModalError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError("");
    const values = { name: form.name, description: form.description, category: form.category, isActive: form.isActive };
    const result = editingId
      ? updateSubCategorySchema.safeParse(values)
      : createSubCategorySchema.safeParse({ name: values.name, description: values.description, category: values.category });
    if (!result.success) { setModalError(result.error.issues[0]?.message ?? "Please check the subcategory details."); return; }
    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/admin/subcategories/${editingId}` : "/api/admin/subcategories", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? values : { name: values.name, description: values.description, category: values.category }),
      });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) { goToLogin(); return; }
      if (!response.ok) { setModalError(getErrorMessage(response.status, body)); return; }
      if (!editingId && !values.isActive && body.data?.id) {
        const statusResponse = await fetch(`/api/admin/subcategories/${body.data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: false }) });
        if (statusResponse.status === 401) { goToLogin(); return; }
        if (!statusResponse.ok) { const statusBody = (await statusResponse.json()) as ApiBody; setModalError(getErrorMessage(statusResponse.status, statusBody)); return; }
      }
      setEditingId(null);
      setModalOpen(false);
      await refresh();
    } catch { setModalError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  async function remove(subcategory: Subcategory) {
    if (!window.confirm(`Delete the subcategory "${subcategory.name}"?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/subcategories/${subcategory.id}`, { method: "DELETE" });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) { goToLogin(); return; }
      if (!response.ok) { setError(getErrorMessage(response.status, body)); return; }
      await refresh();
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  function closeModal() {
    if (!saving) { setModalOpen(false); setEditingId(null); setForm(blankForm); }
  }

  return <section className="mx-auto max-w-6xl">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Catalog</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Subcategories</h1><p className="mt-2 text-sm text-slate-600">Organize products beneath their parent categories.</p></div><button type="button" onClick={openCreate} disabled={saving || categoriesLoading} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Add Subcategory</button></div>
    <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-end"><div className="flex-1"><label htmlFor="subcategory-search" className="block text-sm font-medium text-slate-700">Search subcategories</label><input id="subcategory-search" value={search} onChange={(event) => updateUrl(event.target.value.trim(), categoryFilter, 1)} placeholder="Search by name" className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-500" /></div><div className="sm:w-64"><label htmlFor="category-filter" className="block text-sm font-medium text-slate-700">Parent category</label><select id="category-filter" value={categoryFilter} onChange={(event) => updateUrl(search, event.target.value, 1)} disabled={categoriesLoading} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none focus:border-cyan-500"><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>{(search || categoryFilter) && <button type="button" onClick={() => updateUrl("", "", 1)} className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear</button>}</div>
      {error && <p className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
      {loading ? <div className="p-10 text-center text-sm text-slate-500" aria-live="polite">Loading subcategories...</div> : subcategories.length === 0 ? <div className="p-10 text-center"><h2 className="text-lg font-semibold text-slate-900">No subcategories found</h2><p className="mt-2 text-sm text-slate-500">Create a subcategory to organize your catalog.</p><button type="button" onClick={openCreate} disabled={categoriesLoading} className="mt-5 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">Add Subcategory</button></div> : <><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Parent Category</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{subcategories.map((subcategory) => <tr key={subcategory.id}><td className="px-5 py-4 font-semibold text-slate-950">{subcategory.name}</td><td className="px-5 py-4">{subcategory.description || "-"}</td><td className="px-5 py-4">{subcategory.category.name}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${subcategory.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{subcategory.isActive ? "Active" : "Inactive"}</span></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => void openEdit(subcategory.id)} disabled={saving} className="mr-3 font-semibold text-cyan-700 disabled:opacity-50">Edit</button><button type="button" onClick={() => void remove(subcategory)} disabled={saving} className="font-semibold text-rose-600 disabled:opacity-50">Delete</button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500"><span>Page {page}{pagination.totalPages ? ` of ${pagination.totalPages}` : ""}</span><div className="flex gap-2"><button type="button" onClick={() => updateUrl(search, categoryFilter, page - 1)} disabled={page === 1 || saving} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Previous</button><button type="button" onClick={() => updateUrl(search, categoryFilter, page + 1)} disabled={page >= pagination.totalPages || saving} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Next</button></div></div></>}
    </div>
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4" role="dialog" aria-modal="true" aria-labelledby="subcategory-modal-title"><div className="w-full max-w-lg rounded-xl bg-white p-6"><div className="flex justify-between"><h2 id="subcategory-modal-title" className="text-xl font-semibold">{editingId ? "Edit Subcategory" : "Add Subcategory"}</h2><button type="button" onClick={closeModal} disabled={saving} aria-label="Close dialog">&times;</button></div><form onSubmit={submit} className="mt-6 space-y-5" noValidate><div><label htmlFor="subcategory-name" className="mb-2 block text-sm font-medium">Name</label><input id="subcategory-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-950" required /></div><div><label htmlFor="subcategory-description" className="mb-2 block text-sm font-medium">Description</label><textarea id="subcategory-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-950" /></div><div><label htmlFor="subcategory-category" className="mb-2 block text-sm font-medium">Parent category</label><select id="subcategory-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} disabled={categoriesLoading || saving} className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-950" required><option value="">Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} disabled={saving} />Active subcategory</label>{modalError && <p className="text-sm text-rose-700" role="alert">{modalError}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={closeModal} disabled={saving} className="rounded-lg border px-4 py-2.5">Cancel</button><button type="submit" disabled={saving || categoriesLoading} className="rounded-lg bg-slate-950 px-4 py-2.5 font-semibold text-white">{saving ? "Saving..." : "Save"}</button></div></form></div></div>}
  </section>;
}
