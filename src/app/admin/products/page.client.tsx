"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { z } from "zod";

type Ref = { id: string; name: string };
type Image = { url: string; publicId: string };
type Product = {
  id: string;
  name: string;
  description: string;
  mrp?: number | null;
  price?: number | null;
  discountPercent?: number | null;
  sellingPrice?: number | null;
  stock: number;
  images?: Image[] | null;
  category?: Ref | null;
  subcategory?: Ref | null;
  isActive: boolean;
  pricingValid?: boolean;
  pricingError?: string | null;
};
type Category = { id: string; name: string; isActive: boolean };
type Subcategory = {
  id: string;
  name: string;
  category: Ref;
  isActive: boolean;
};
type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
type FormValues = {
  name: string;
  description: string;
  mrp: string;
  discountPercent: string;
  sellingPrice: string;
  stock: string;
  category: string;
  subcategory: string;
  isActive: boolean;
};
type ApiBody = {
  message?: string;
  data?: Product;
  errors?: Array<{ message?: string }>;
};
type ProductListBody = {
  message?: string;
  data?: Product[];
  pagination?: Pagination;
  errors?: Array<{ message?: string }>;
};
type CategoryListBody = {
  message?: string;
  errors?: Array<{ message?: string }>;
  data?: { categories: Category[] };
};
type SubcategoryListBody = {
  message?: string;
  errors?: Array<{ message?: string }>;
  data?: { subcategories: Subcategory[] };
};

const LIMIT = 10;
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const blankForm: FormValues = {
  name: "",
  description: "",
  mrp: "",
  discountPercent: "0",
  sellingPrice: "",
  stock: "",
  category: "",
  subcategory: "",
  isActive: true,
};
const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(150),
  description: z
    .string()
    .trim()
    .max(2000, "Description must not exceed 2000 characters."),
  mrp: z.coerce.number().finite().positive("MRP must be greater than zero."),
  discountPercent: z.coerce
    .number()
    .finite()
    .min(0)
    .max(100, "Discount must be between 0 and 100."),
  stock: z.coerce
    .number()
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative."),
  category: z.string().regex(/^[0-9a-fA-F]{24}$/, "Select a valid category."),
  subcategory: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Select a valid subcategory."),
  isActive: z.boolean(),
});

function errorMessage(
  status: number,
  body: ApiBody | ProductListBody | CategoryListBody | SubcategoryListBody,
) {
  if (status === 400)
    return (
      body.errors?.[0]?.message ??
      body.message ??
      "Please check the product details."
    );
  if (status === 401)
    return "Your admin session has expired. Redirecting to login...";
  if (status === 403) return "You are not authorized to manage products.";
  if (status === 404)
    return (
      body.message ?? "The requested product or relationship was not found."
    );
  if (status === 409)
    return body.message ?? "The product conflicts with an existing record.";
  if (status >= 500)
    return "Something went wrong on the server. Please try again.";
  return body.message ?? "Unable to complete the request.";
}

function priceLabel(value: number | null | undefined) {
  const normalized = Number.isFinite(value) ? Number(value) : 0;
  return normalized.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
}

function productCategoryName(category?: Ref | null) {
  return category?.name ?? "Uncategorized";
}

function productSubcategoryName(subcategory?: Ref | null) {
  return subcategory?.name ?? "No subcategory";
}

function calculateSellingPrice(mrp: string, discountPercent: string) {
  const mrpValue = Number(mrp);
  const discountValue = Number(discountPercent);

  if (!Number.isFinite(mrpValue) || !Number.isFinite(discountValue)) {
    return "";
  }

  return String(
    Math.round(
      (mrpValue - (mrpValue * discountValue) / 100 + Number.EPSILON) * 100,
    ) / 100,
  );
}

export default function AdminProductsPage() {
  const router = useRouter();
  const query = useSearchParams();
  const search = query.get("search") ?? "";
  const categoryFilter = query.get("category") ?? "";
  const subcategoryFilter = query.get("subcategory") ?? "";
  const sortBy = query.get("sortBy") ?? "createdAt";
  const sortOrder = query.get("sortOrder") === "asc" ? "asc" : "desc";
  const parsedPage = Number(query.get("page") ?? "1");
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page,
    limit: LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(blankForm);
  const [files, setFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<Image[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const availableSubcategories = useMemo(
    () =>
      subcategories.filter(
        (item) => !form.category || item.category.id === form.category,
      ),
    [form.category, subcategories],
  );

  function login() {
    router.replace("/admin/login");
  }
  function updateUrl(values: Record<string, string>, nextPage = 1) {
    const next = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, value);
    });
    if (nextPage > 1) next.set("page", String(nextPage));
    router.replace(`/admin/products${next.toString() ? `?${next}` : ""}`, {
      scroll: false,
    });
  }
  const currentUrl = {
    search,
    category: categoryFilter,
    subcategory: subcategoryFilter,
    sortBy,
    sortOrder,
  };

  useEffect(() => {
    const controller = new AbortController();
    async function loadOptions() {
      setCategoriesLoading(true);
      setSubcategoriesLoading(true);
      try {
        const [categoryResponse, subcategoryResponse] = await Promise.all([
          fetch("/api/admin/categories?page=1&limit=100", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/admin/subcategories?page=1&limit=100", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        const categoryBody =
          (await categoryResponse.json()) as CategoryListBody;
        const subcategoryBody =
          (await subcategoryResponse.json()) as SubcategoryListBody;
        if (
          categoryResponse.status === 401 ||
          subcategoryResponse.status === 401
        ) {
          router.replace("/admin/login");
          return;
        }
        if (!categoryResponse.ok)
          setError(errorMessage(categoryResponse.status, categoryBody));
        else setCategories(categoryBody.data?.categories ?? []);
        if (!subcategoryResponse.ok)
          setError(errorMessage(subcategoryResponse.status, subcategoryBody));
        else setSubcategories(subcategoryBody.data?.subcategories ?? []);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setError("Network error while loading product options.");
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false);
          setSubcategoriesLoading(false);
        }
      }
    }
    void loadOptions();
    return () => controller.abort();
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProducts() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      if (subcategoryFilter) params.set("subcategory", subcategoryFilter);
      try {
        const response = await fetch(`/api/admin/products?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as ProductListBody;
        if (response.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!response.ok) {
          setError(errorMessage(response.status, body));
          return;
        }
        setProducts(body.data ?? []);
        setPagination(
          body.pagination ?? { page, limit: LIMIT, total: 0, totalPages: 0 },
        );
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setError("Network error while loading products.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProducts();
    return () => controller.abort();
  }, [
    categoryFilter,
    page,
    router,
    search,
    sortBy,
    sortOrder,
    subcategoryFilter,
  ]);

  async function refresh() {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
      sortBy,
      sortOrder,
    });
    if (search) params.set("search", search);
    if (categoryFilter) params.set("category", categoryFilter);
    if (subcategoryFilter) params.set("subcategory", subcategoryFilter);
    const response = await fetch(`/api/admin/products?${params}`, {
      cache: "no-store",
    });
    const body = (await response.json()) as ProductListBody;
    if (response.status === 401) {
      login();
      return;
    }
    if (!response.ok) {
      setError(errorMessage(response.status, body));
      return;
    }
    setProducts(body.data ?? []);
    if (body.pagination) setPagination(body.pagination);
  }

  function resetForm() {
    setForm(blankForm);
    setFiles([]);
    setExistingImages([]);
    setEditingId(null);
    setModalError("");
    setModalOpen(false);
  }
  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  async function openEdit(id: string) {
    resetForm();
    setEditingId(id);
    setModalOpen(true);
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/products/${id}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) {
        login();
        return;
      }
      if (!response.ok || !body.data) {
        setModalError(errorMessage(response.status, body));
        return;
      }
      setForm({
        name: body.data.name,
        description: body.data.description,
        mrp: String(body.data.mrp ?? ""),
        discountPercent: String(body.data.discountPercent ?? 0),
        sellingPrice: String(body.data.sellingPrice ?? ""),
        stock: String(body.data.stock),
        category: body.data.category?.id ?? "",
        subcategory: body.data.subcategory?.id ?? "",
        isActive: body.data.isActive,
      });
      setExistingImages(body.data.images ?? []);
    } catch {
      setModalError("Network error while loading the product.");
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await fetch(`/api/admin/products/${id}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) {
        login();
        return;
      }
      if (!response.ok || !body.data) {
        setError(errorMessage(response.status, body));
        return;
      }
      setDetail(body.data);
    } catch {
      setError("Network error while loading the product.");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleFiles(selected: FileList | null) {
    const nextFiles = Array.from(selected ?? []);
    const invalid = nextFiles.find(
      (file) => !imageTypes.includes(file.type) || file.size > 5 * 1024 * 1024,
    );
    if (invalid) {
      setModalError(
        "Images must be JPEG, PNG, or WEBP files no larger than 5 MB.",
      );
      return;
    }
    if (nextFiles.length + existingImages.length > 5) {
      setModalError("A product can have a maximum of 5 images.");
      return;
    }
    setFiles(nextFiles);
    setModalError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError("");
    const result = clientSchema.safeParse({
      ...form,
    });
    if (!result.success) {
      setModalError(
        result.error.issues[0]?.message ?? "Please check the product details.",
      );
      return;
    }
    if (!editingId && files.length < 1) {
      setModalError("Add at least one product image.");
      return;
    }
    if (editingId && existingImages.length + files.length < 1) {
      setModalError("A product must have at least one image.");
      return;
    }
    setSaving(true);
    try {
      const data = new FormData();
      const sellingPrice =
        Math.round(
          (result.data.mrp -
            (result.data.mrp * result.data.discountPercent) / 100 +
            Number.EPSILON) *
            100,
        ) / 100;
      data.set("name", result.data.name);
      data.set("description", result.data.description);
      data.set("mrp", String(result.data.mrp));
      data.set("discountPercent", String(result.data.discountPercent));
      data.set("sellingPrice", String(sellingPrice));
      data.set("stock", String(result.data.stock));
      data.set("category", result.data.category);
      data.set("subcategory", result.data.subcategory);
      data.set("isActive", String(result.data.isActive));
      files.forEach((file) => data.append("images", file));
      if (editingId)
        data.set(
          "keepImagePublicIds",
          JSON.stringify(existingImages.map((image) => image.publicId)),
        );
      const response = await fetch(
        editingId ? `/api/admin/products/${editingId}` : "/api/admin/products",
        { method: editingId ? "PATCH" : "POST", body: data },
      );
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) {
        login();
        return;
      }
      if (!response.ok) {
        setModalError(errorMessage(response.status, body));
        return;
      }
      resetForm();
      await refresh();
    } catch {
      setModalError("Network error while saving the product.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Delete the product "${product.name}"?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) {
        login();
        return;
      }
      if (!response.ok) {
        setError(errorMessage(response.status, body));
        return;
      }
      await refresh();
    } catch {
      setError("Network error while deleting the product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <p className="sr-only">
        Product pricing uses MRP, Discount %, and calculated Selling Price.
      </p>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">
            Catalog
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Products
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage product information, pricing, stock, and images.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={saving || categoriesLoading || subcategoriesLoading}
          className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          Add Product
        </button>
      </div>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label
              htmlFor="product-search"
              className="block text-sm font-medium text-slate-700"
            >
              Search products
            </label>
            <input
              id="product-search"
              value={search}
              onChange={(event) =>
                updateUrl({ ...currentUrl, search: event.target.value.trim() })
              }
              placeholder="Name or description"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label
              htmlFor="product-category"
              className="block text-sm font-medium text-slate-700"
            >
              Category
            </label>
            <select
              id="product-category"
              value={categoryFilter}
              onChange={(event) =>
                updateUrl({
                  ...currentUrl,
                  category: event.target.value,
                  subcategory: "",
                })
              }
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="product-subcategory"
              className="block text-sm font-medium text-slate-700"
            >
              Subcategory
            </label>
            <select
              id="product-subcategory"
              value={subcategoryFilter}
              onChange={(event) =>
                updateUrl({ ...currentUrl, subcategory: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="">All subcategories</option>
              {subcategories
                .filter(
                  (item) =>
                    !categoryFilter || item.category.id === categoryFilter,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="product-sort"
              className="block text-sm font-medium text-slate-700"
            >
              Sort
            </label>
            <select
              id="product-sort"
              value={`${sortBy}:${sortOrder}`}
              onChange={(event) => {
                const [nextSort, nextOrder] = event.target.value.split(":");
                updateUrl({
                  ...currentUrl,
                  sortBy: nextSort,
                  sortOrder: nextOrder,
                });
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="createdAt:desc">Newest</option>
              <option value="createdAt:asc">Oldest</option>
              <option value="sellingPrice:asc">Price: low to high</option>
              <option value="sellingPrice:desc">Price: high to low</option>
              <option value="name:asc">Name A-Z</option>
              <option value="name:desc">Name Z-A</option>
            </select>
          </div>
        </div>
        {error && (
          <p
            className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </p>
        )}
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              No products found
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Create a product to populate your catalog.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
            >
              Add Product
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Subcategory</th>
                    <th className="px-5 py-3">Price / Stock</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={product.images?.[0]?.url ?? ""}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                          <div>
                            <p className="font-semibold text-slate-950">
                              {product.name}
                            </p>
                            <p className="max-w-xs truncate text-xs text-slate-500">
                              {product.description}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {productCategoryName(product.category)}
                      </td>
                      <td className="px-5 py-4">
                        {productSubcategoryName(product.subcategory)}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-950">
                          {priceLabel(product.sellingPrice ?? product.price ?? 0)}
                        </p>
                        {product.pricingValid === false && (
                          <p className="text-xs text-amber-700">
                            {product.pricingError ?? "Invalid stored pricing"}
                          </p>
                        )}
                        {(Number(product.discountPercent) > 0 || product.pricingValid !== false) && (
                          <p className="text-xs text-slate-500">
                            MRP {priceLabel(product.mrp ?? product.price ?? 0)}
                            {Number(product.discountPercent) > 0 ? ` · ${product.discountPercent}% OFF` : ""}
                          </p>
                        )}
                        <p className="text-xs text-slate-500">
                          {product.stock} in stock
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                        >
                          {product.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => void openDetail(product.id)}
                          disabled={saving}
                          className="mr-3 font-semibold text-slate-600 disabled:opacity-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => void openEdit(product.id)}
                          disabled={saving}
                          className="mr-3 font-semibold text-cyan-700 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(product)}
                          disabled={saving}
                          className="font-semibold text-rose-600 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
              <span>
                Page {page}
                {pagination.totalPages ? ` of ${pagination.totalPages}` : ""}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateUrl(currentUrl, page - 1)}
                  disabled={page === 1 || saving}
                  className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => updateUrl(currentUrl, page + 1)}
                  disabled={page >= pagination.totalPages || saving}
                  className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6">
            <div className="flex justify-between">
              <h2 id="product-modal-title" className="text-xl font-semibold">
                {editingId ? "Edit Product" : "Add Product"}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <form
              onSubmit={submit}
              className="mt-6 grid gap-5 sm:grid-cols-2"
              noValidate
            >
              <div>
                <label
                  htmlFor="product-name"
                  className="mb-2 block text-sm font-medium"
                >
                  Name
                </label>
                <input
                  id="product-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5"
                />
              </div>
              <div>
                <label
                  htmlFor="product-mrp"
                  className="mb-2 block text-sm font-medium"
                >
                  MRP
                </label>
                <input
                  id="product-mrp"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.mrp}
                  onChange={(event) => {
                    const mrp = event.target.value;
                    setForm({
                      ...form,
                      mrp,
                      sellingPrice: calculateSellingPrice(
                        mrp,
                        form.discountPercent,
                      ),
                    });
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5"
                />
              </div>
              <div>
                <label
                  htmlFor="product-discount"
                  className="mb-2 block text-sm font-medium"
                >
                  Discount %
                </label>
                <input
                  id="product-discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.discountPercent}
                  onChange={(event) => {
                    const discountPercent = event.target.value;
                    setForm({
                      ...form,
                      discountPercent,
                      sellingPrice: calculateSellingPrice(
                        form.mrp,
                        discountPercent,
                      ),
                    });
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5"
                />
              </div>
              <div>
                <label
                  htmlFor="product-selling-price"
                  className="mb-2 block text-sm font-medium"
                >
                  Selling Price
                </label>
                <input
                  id="product-selling-price"
                  type="number"
                  value={form.sellingPrice}
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-600"
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="product-description"
                  className="mb-2 block text-sm font-medium"
                >
                  Description
                </label>
                <textarea
                  id="product-description"
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5"
                />
              </div>
              <div>
                <label
                  htmlFor="product-stock"
                  className="mb-2 block text-sm font-medium"
                >
                  Stock
                </label>
                <input
                  id="product-stock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(event) =>
                    setForm({ ...form, stock: event.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5"
                />
              </div>
              <div>
                <label
                  htmlFor="product-form-category"
                  className="mb-2 block text-sm font-medium"
                >
                  Category
                </label>
                <select
                  id="product-form-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      category: event.target.value,
                      subcategory: "",
                    })
                  }
                  disabled={categoriesLoading || saving}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5"
                >
                  <option value="">Select category</option>
                  {categories
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="product-form-subcategory"
                  className="mb-2 block text-sm font-medium"
                >
                  Subcategory
                </label>
                <select
                  id="product-form-subcategory"
                  value={form.subcategory}
                  onChange={(event) =>
                    setForm({ ...form, subcategory: event.target.value })
                  }
                  disabled={!form.category || subcategoriesLoading || saving}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5"
                >
                  <option value="">Select subcategory</option>
                  {availableSubcategories
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm({ ...form, isActive: event.target.checked })
                  }
                  disabled={saving}
                />
                Active product
              </label>
              <div className="sm:col-span-2">
                <label
                  htmlFor="product-images"
                  className="mb-2 block text-sm font-medium"
                >
                  Product images (1–5 total)
                </label>
                <input
                  id="product-images"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => handleFiles(event.target.files)}
                  disabled={saving}
                  className="block w-full text-sm"
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  {existingImages.map((image) => (
                    <div key={image.publicId} className="relative">
                      <img
                        src={image.url}
                        alt="Existing product"
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setExistingImages(
                            existingImages.filter(
                              (item) => item.publicId !== image.publicId,
                            ),
                          )
                        }
                        disabled={saving}
                        className="absolute -right-2 -top-2 rounded-full bg-rose-600 px-2 text-white"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  {files.map((file) => (
                    <img
                      key={`${file.name}-${file.lastModified}`}
                      src={URL.createObjectURL(file)}
                      alt="Selected product"
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                  ))}
                </div>
              </div>
              {modalError && (
                <p className="sm:col-span-2 text-sm text-rose-700" role="alert">
                  {modalError}
                </p>
              )}
              <div className="flex justify-end gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-lg border px-4 py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || categoriesLoading || subcategoriesLoading}
                  className="rounded-lg bg-slate-950 px-4 py-2.5 font-semibold text-white"
                >
                  {saving ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {(detailLoading || detail) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-detail-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6">
            <div className="flex justify-between">
              <h2 id="product-detail-title" className="text-xl font-semibold">
                Product details
              </h2>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Close details"
              >
                &times;
              </button>
            </div>
            {detailLoading ? (
              <p className="py-10 text-center text-sm text-slate-500">
                Loading product...
              </p>
            ) : (
              detail && (
                <div className="mt-5 space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold">{detail.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {detail.description}
                    </p>
                  </div>
                  <p className="text-sm text-slate-600">
                    {productCategoryName(detail.category)} / {productSubcategoryName(detail.subcategory)} · MRP{" "}
                    {priceLabel(detail.mrp ?? detail.price ?? 0)} · {priceLabel(detail.sellingPrice ?? detail.price ?? 0)} ·{" "}
                    {detail.pricingValid === false ? "Invalid stored pricing" : `${detail.discountPercent ?? 0}% OFF`} · {detail.stock} in stock
                  </p>
                  {detail.pricingValid === false && (
                    <p className="text-sm text-amber-700">
                      {detail.pricingError ?? "Invalid stored pricing"}
                    </p>
                  )}
                  <p className="text-sm font-semibold">
                    {detail.isActive ? "Active" : "Inactive"}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {(detail.images ?? []).map((image) => (
                      <img
                        key={image.publicId}
                        src={image.url}
                        alt={detail.name}
                        className="h-28 w-28 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
