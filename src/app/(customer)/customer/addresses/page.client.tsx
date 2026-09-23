"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  createAddressSchema,
  type CreateAddressInput,
} from "@/validations/address.validation";

type Address = CreateAddressInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type AddressFormValues = z.input<typeof createAddressSchema>;

type AddressResponse = {
  message?: string;
  data?: Address | Address[] | { id: string };
  errors?: Array<{ path?: PropertyKey[]; message?: string }>;
};

type PincodeLookupResponse = Array<{
  Status?: string;
  PostOffice?: Array<{
    Block?: string;
    District?: string;
    Division?: string;
    Name?: string;
    Region?: string;
    State?: string;
  }> | null;
}>;

type LocationOption = {
  value: string;
  label: string;
};

type LookupStatus = "idle" | "loading" | "success" | "invalid" | "error";

const emptyForm: CreateAddressInput = {
  fullName: "",
  mobile: "",
  addressLine: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  isDefault: false,
};

function getErrorMessage(status: number, responseBody?: AddressResponse) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You are not authorized to manage addresses.";
  if (status >= 500) return "The server is unavailable. Please try again later.";
  return responseBody?.errors?.[0]?.message ?? responseBody?.message ?? "Something went wrong. Please try again.";
}

function addressData(data: AddressResponse["data"]) {
  return Array.isArray(data) ? data : [];
}

export default function CustomerAddressesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const safeReturnTo = returnTo === "/customer/checkout" ? returnTo : null;
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedShippingAddressId, setSelectedShippingAddressId] =
    useState<string | null>(null);
  const [pincodeLookupStatus, setPincodeLookupStatus] =
    useState<LookupStatus>("idle");
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const lastLookupPincodeRef = useRef("");
  const skipNextLookupRef = useRef(false);
  const {
    register,
    reset,
    setValue,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AddressFormValues, unknown, CreateAddressInput>({
    resolver: zodResolver(createAddressSchema),
    defaultValues: emptyForm,
  });
  const pincode = useWatch({ control, name: "pincode" });

  useEffect(() => {
    const normalizedPincode = (pincode ?? "").replace(/\D/g, "");

    if (normalizedPincode.length !== 6) {
      return;
    }

    if (skipNextLookupRef.current) {
      skipNextLookupRef.current = false;
      lastLookupPincodeRef.current = normalizedPincode;
      return;
    }

    if (lastLookupPincodeRef.current === normalizedPincode) return;

    const controller = new AbortController();
    lastLookupPincodeRef.current = normalizedPincode;
    setPincodeLookupStatus("loading");

    async function lookupPincode() {
      try {
        const response = await fetch(
          `https://api.postalpincode.in/pincode/${normalizedPincode}`,
          { signal: controller.signal },
        );
        const responseBody = (await response.json()) as PincodeLookupResponse;
        const lookupResult = responseBody[0];
        const postOffices = lookupResult?.PostOffice ?? [];
        const state = postOffices.find((office) => office.State?.trim())?.State?.trim();

        const seenLocations = new Set<string>();
        const locations: LocationOption[] = [];
        const locationFields: Array<{ key: keyof (typeof postOffices)[number]; label: string }> = [
          { key: "Name", label: "Post Office" },
          { key: "Block", label: "Block / Tehsil" },
          { key: "Division", label: "Division" },
          { key: "Region", label: "Region" },
        ];

        for (const office of postOffices) {
          for (const field of locationFields) {
            const value = office[field.key]?.trim();
            const normalizedValue = value?.toLocaleLowerCase();

            if (!value || !normalizedValue || seenLocations.has(normalizedValue)) {
              continue;
            }

            seenLocations.add(normalizedValue);
            locations.push({ value, label: `${value} (${field.label})` });
          }
        }

        if (!response.ok) {
          setPincodeLookupStatus("error");
          return;
        }

        if (lookupResult?.Status !== "Success" || !state || locations.length === 0) {
          setLocationOptions([]);
          setPincodeLookupStatus("invalid");
          return;
        }

        setLocationOptions(locations);
        setValue("city", "", { shouldValidate: true });
        setValue("state", state, { shouldValidate: true });
        setPincodeLookupStatus("success");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPincodeLookupStatus("error");
      }
    }

    void lookupPincode();
    return () => controller.abort();
  }, [pincode, setValue]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAddresses() {
      try {
        const response = await fetch("/api/customer/addresses", {
          cache: "no-store",
          signal: controller.signal,
        });
        const responseBody = (await response.json()) as AddressResponse;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          setPageError(getErrorMessage(response.status, responseBody));
          return;
        }

        setAddresses(addressData(responseBody.data));

        const shippingResponse = await fetch("/api/customer/shipping-address", {
          cache: "no-store",
          signal: controller.signal,
        });
        const shippingBody = (await shippingResponse.json()) as AddressResponse;

        if (shippingResponse.status === 401) {
          router.replace("/login");
          return;
        }

        if (shippingResponse.ok && shippingBody.data && !Array.isArray(shippingBody.data)) {
          setSelectedShippingAddressId(shippingBody.data.id);
        } else if (shippingResponse.status !== 404) {
          setPageError(getErrorMessage(shippingResponse.status, shippingBody));
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPageError("Unable to load your addresses. Please try again.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadAddresses();
    return () => controller.abort();
  }, [router]);

  function openCreateForm() {
    setEditingAddressId(null);
    lastLookupPincodeRef.current = "";
    setPincodeLookupStatus("idle");
    setLocationOptions([]);
    reset(emptyForm);
    setPageError("");
    setSuccessMessage("");
    setShowForm(true);
  }

  function openEditForm(address: Address) {
    setEditingAddressId(address.id);
    skipNextLookupRef.current = true;
    setLocationOptions([]);
    reset({
      fullName: address.fullName,
      mobile: address.mobile,
      addressLine: address.addressLine,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
      isDefault: address.isDefault,
    });
    setPageError("");
    setSuccessMessage("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingAddressId(null);
    lastLookupPincodeRef.current = "";
    setPincodeLookupStatus("idle");
    setLocationOptions([]);
    reset(emptyForm);
  }

  async function saveAddress(values: CreateAddressInput) {
    setPageError("");
    setSuccessMessage("");
    setIsSaving(true);

    const isEditing = editingAddressId !== null;
    const endpoint = isEditing
      ? `/api/customer/addresses/${editingAddressId}`
      : "/api/customer/addresses";

    try {
      const response = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const responseBody = (await response.json()) as AddressResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setPageError(getErrorMessage(response.status, responseBody));
        return;
      }

      const savedAddress = responseBody.data as Address;
      setAddresses((currentAddresses) =>
        isEditing
          ? currentAddresses.map((address) =>
              address.id === savedAddress.id ? savedAddress : address,
            )
          : [savedAddress, ...currentAddresses].sort(
              (first, second) => Number(second.isDefault) - Number(first.isDefault),
            ),
      );
      if (!isEditing && addresses.length === 0) {
        setSelectedShippingAddressId(savedAddress.id);
      }
      setSuccessMessage(responseBody.message ?? "Address saved successfully.");
      closeForm();
    } catch {
      setPageError("Unable to save your address. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function setDefault(addressId: string) {
    if (activeAction) return;
    setPageError("");
    setSuccessMessage("");
    setActiveAction(addressId);

    try {
      const response = await fetch(`/api/customer/addresses/${addressId}/default`, {
        method: "PATCH",
      });
      const responseBody = (await response.json()) as AddressResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setPageError(getErrorMessage(response.status, responseBody));
        return;
      }

      setAddresses((currentAddresses) =>
        currentAddresses
          .map((address) => ({ ...address, isDefault: address.id === addressId }))
          .sort((first, second) => Number(second.isDefault) - Number(first.isDefault)),
      );
      setSuccessMessage(responseBody.message ?? "Default address updated successfully.");
    } catch {
      setPageError("Unable to set the default address. Please try again.");
    } finally {
      setActiveAction(null);
    }
  }

  async function selectShippingAddress(addressId: string) {
    if (activeAction || addressId === selectedShippingAddressId) return;

    setPageError("");
    setSuccessMessage("");
    setActiveAction(addressId);

    try {
      const response = await fetch("/api/customer/shipping-address", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId }),
      });
      const responseBody = (await response.json()) as AddressResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !responseBody.data || Array.isArray(responseBody.data)) {
        setPageError(getErrorMessage(response.status, responseBody));
        return;
      }

      setSelectedShippingAddressId(responseBody.data.id);
      setSuccessMessage(responseBody.message ?? "Shipping address selected successfully.");
      router.push(safeReturnTo ?? "/customer/addresses");
    } catch {
      setPageError("Unable to select the shipping address. Please try again.");
    } finally {
      setActiveAction(null);
    }
  }

  async function deleteAddress(addressId: string) {
    if (activeAction) return;
    if (!window.confirm("Delete this address?")) return;

    setPageError("");
    setSuccessMessage("");
    setActiveAction(addressId);

    try {
      const response = await fetch(`/api/customer/addresses/${addressId}`, {
        method: "DELETE",
      });
      const responseBody = (await response.json()) as AddressResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setPageError(getErrorMessage(response.status, responseBody));
        return;
      }

      setAddresses((currentAddresses) => {
        const remaining = currentAddresses.filter((address) => address.id !== addressId);
        if (remaining.length > 0 && !remaining.some((address) => address.isDefault)) {
          remaining[0] = { ...remaining[0], isDefault: true };
        }
        return remaining;
      });
      if (selectedShippingAddressId === addressId) {
        const shippingResponse = await fetch("/api/customer/shipping-address", {
          cache: "no-store",
        });
        const shippingBody = (await shippingResponse.json()) as AddressResponse;
        if (shippingResponse.ok && shippingBody.data && !Array.isArray(shippingBody.data)) {
          setSelectedShippingAddressId(shippingBody.data.id);
        } else {
          setSelectedShippingAddressId(null);
        }
      }
      setSuccessMessage(responseBody.message ?? "Address deleted successfully.");
    } catch {
      setPageError("Unable to delete the address. Please try again.");
    } finally {
      setActiveAction(null);
    }
  }

  const fieldClassName = "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20";

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/customer/home" className="text-sm text-zinc-400 transition hover:text-amber-300">
          Back to customer home
        </Link>
        <div className="mt-8 flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">Customer account</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your addresses</h1>
          </div>
          <button type="button" onClick={openCreateForm} className="rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200">
            Add address
          </button>
        </div>

        {pageError && <p className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{pageError}</p>}
        {successMessage && <p className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200" role="status">{successMessage}</p>}

        {showForm && (
          <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{editingAddressId ? "Edit address" : "Add address"}</h2>
              <button type="button" onClick={closeForm} disabled={isSaving} className="text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-50">Cancel</button>
            </div>
            <form
              className="mt-6 grid gap-5 sm:grid-cols-2"
              onSubmit={(event) => {
                void handleSubmit(saveAddress)(event);
              }}
              noValidate
            >
              <div>
                <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-zinc-200">Full name</label>
                <input id="fullName" className={fieldClassName} {...register("fullName")} />
                {errors.fullName && <p className="mt-2 text-sm text-red-300">{errors.fullName.message}</p>}
              </div>
              <div>
                <label htmlFor="mobile" className="mb-2 block text-sm font-medium text-zinc-200">Mobile</label>
                <input id="mobile" type="tel" inputMode="numeric" className={fieldClassName} {...register("mobile")} />
                {errors.mobile && <p className="mt-2 text-sm text-red-300">{errors.mobile.message}</p>}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="addressLine" className="mb-2 block text-sm font-medium text-zinc-200">Address</label>
                <textarea id="addressLine" rows={3} className={fieldClassName} {...register("addressLine")} />
                {errors.addressLine && <p className="mt-2 text-sm text-red-300">{errors.addressLine.message}</p>}
              </div>
              <div>
                <label htmlFor="pincode" className="mb-2 block text-sm font-medium text-zinc-200">Pincode</label>
                <input
                  id="pincode"
                  inputMode="numeric"
                  maxLength={6}
                  className={fieldClassName}
                  {...register("pincode", {
                    onChange: (event) => {
                      const normalizedValue = event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      if (normalizedValue.length !== 6) {
                        setPincodeLookupStatus("idle");
                      }
                      setLocationOptions([]);
                      setValue("city", "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      setValue("pincode", normalizedValue, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    },
                  })}
                />
                {pincodeLookupStatus === "loading" && (
                  <p className="mt-2 text-xs text-zinc-400" role="status">Fetching location...</p>
                )}
                {pincodeLookupStatus === "success" && (
                  <p className="mt-2 text-xs text-emerald-300" role="status">Location found</p>
                )}
                {pincodeLookupStatus === "invalid" && (
                  <p className="mt-2 text-xs text-amber-300" role="status">Invalid pincode or location not found</p>
                )}
                {pincodeLookupStatus === "error" && (
                  <p className="mt-2 text-xs text-amber-300" role="status">Unable to fetch location. Please enter City and State manually.</p>
                )}
                {errors.pincode && <p className="mt-2 text-sm text-red-300">{errors.pincode.message}</p>}
              </div>
              <div>
                <label htmlFor="city" className="mb-2 block text-sm font-medium text-zinc-200">City / Tehsil</label>
                {locationOptions.length > 0 ? (
                  <select id="city" className={fieldClassName} {...register("city")}>
                    <option value="">Select City / Tehsil</option>
                    {locationOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input id="city" className={fieldClassName} {...register("city")} />
                )}
                {errors.city && <p className="mt-2 text-sm text-red-300">{errors.city.message}</p>}
              </div>
              <div>
                <label htmlFor="state" className="mb-2 block text-sm font-medium text-zinc-200">State</label>
                <input id="state" className={fieldClassName} {...register("state")} />
                {errors.state && <p className="mt-2 text-sm text-red-300">{errors.state.message}</p>}
              </div>
              <div>
                <label htmlFor="country" className="mb-2 block text-sm font-medium text-zinc-200">Country</label>
                <input id="country" className={fieldClassName} {...register("country")} />
                {errors.country && <p className="mt-2 text-sm text-red-300">{errors.country.message}</p>}
              </div>
              <label className="flex items-center gap-3 text-sm text-zinc-200 sm:col-span-2">
                <input type="checkbox" className="h-4 w-4 accent-amber-300" {...register("isDefault")} />
                Set as default address
              </label>
              <button type="submit" disabled={isSaving} className="rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">
                {isSaving ? "Saving..." : editingAddressId ? "Save changes" : "Save address"}
              </button>
            </form>
          </section>
        )}

        {isLoading ? (
          <p className="mt-10 text-zinc-400" role="status">Loading your addresses...</p>
        ) : addresses.length === 0 ? (
          <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-14 text-center">
            <h2 className="text-xl font-semibold">No saved addresses</h2>
            <p className="mt-3 text-sm text-zinc-400">Add an address to keep your delivery details ready.</p>
            <button type="button" onClick={openCreateForm} className="mt-6 rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-200">Add your first address</button>
          </section>
        ) : (
          <section className="mt-8 grid gap-5 md:grid-cols-2" aria-label="Saved addresses">
            {addresses.map((address) => (
              <article key={address.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-lg font-semibold">{address.fullName}</h2>
                  <div className="flex flex-wrap justify-end gap-2">
                    {address.isDefault && <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-200">Default address</span>}
                    {address.id === selectedShippingAddressId && <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">Selected for shipping</span>}
                  </div>
                </div>
                <dl className="mt-5 space-y-2 text-sm leading-6">
                  <div><dt className="inline text-zinc-500">Mobile: </dt><dd className="inline text-zinc-200">{address.mobile}</dd></div>
                  <div><dt className="inline text-zinc-500">Address: </dt><dd className="inline text-zinc-200">{address.addressLine}</dd></div>
                  <div><dt className="inline text-zinc-500">Location: </dt><dd className="inline text-zinc-200">{address.city}, {address.state} {address.pincode}</dd></div>
                  <div><dt className="inline text-zinc-500">Country: </dt><dd className="inline text-zinc-200">{address.country}</dd></div>
                </dl>
                <div className="mt-6 flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
                  <button type="button" onClick={() => openEditForm(address)} disabled={activeAction !== null || isSaving} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-amber-300 disabled:opacity-50">Edit</button>
                  <button type="button" onClick={() => void deleteAddress(address.id)} disabled={activeAction !== null || isSaving} className="rounded-lg border border-red-300/40 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-300/10 disabled:opacity-50">{activeAction === address.id ? "Working..." : "Delete"}</button>
                  {!address.isDefault && <button type="button" onClick={() => void setDefault(address.id)} disabled={activeAction !== null || isSaving} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-200 disabled:opacity-50">Set as default</button>}
                  {address.id !== selectedShippingAddressId && <button type="button" onClick={() => void selectShippingAddress(address.id)} disabled={activeAction !== null || isSaving} className="rounded-lg border border-emerald-300/40 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-300/10 disabled:opacity-50">{activeAction === address.id ? "Working..." : "Use for shipping"}</button>}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}