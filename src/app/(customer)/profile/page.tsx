"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  customerProfileUpdateSchema,
  type CustomerProfileUpdateInput,
} from "@/validations/profile.validation";
import {
  customerChangePasswordSchema,
  type CustomerChangePasswordInput,
} from "@/validations/auth.validation";

type ProfileImage = {
  url?: string;
  publicId?: string;
};

type CustomerProfile = {
  id: string;
  name: string;
  email: string;
  dateOfBirth?: string;
  mobile?: string;
  profileImage?: ProfileImage;
};

type ProfileResponse = {
  message?: string;
  data?: CustomerProfile;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function formatDateForInput(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function getErrorMessage(status: number, responseBody?: ProfileResponse) {
  if (status === 400) return responseBody?.message ?? "Please check your details.";
  if (status === 403) return "You are not authorized to access this profile.";
  if (status >= 500) return "The server is unavailable. Please try again later.";
  return responseBody?.message ?? "Something went wrong. Please try again.";
}

export default function CustomerProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const previewUrlRef = useRef("");
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerProfileUpdateInput>({
    resolver: zodResolver(customerProfileUpdateSchema),
  });
  const {
    register: registerPassword,
    reset: resetPasswordForm,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
  } = useForm<CustomerChangePasswordInput>({
    resolver: zodResolver(customerChangePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      try {
        const response = await fetch("/api/customer/profile", {
          cache: "no-store",
        });
        const responseBody = (await response.json()) as ProfileResponse;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok || !responseBody.data) {
          if (isActive) setPageError(getErrorMessage(response.status, responseBody));
          return;
        }

        if (isActive) {
          setProfile(responseBody.data);
          reset({
            name: responseBody.data.name,
            dateOfBirth: formatDateForInput(responseBody.data.dateOfBirth),
            mobile: responseBody.data.mobile ?? "",
          });
        }
      } catch {
        if (isActive) setPageError("Unable to load your profile. Please try again.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void loadProfile();
    return () => {
      isActive = false;
    };
  }, [reset, router]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function onSubmit(values: CustomerProfileUpdateInput) {
    setPageError("");
    setSuccessMessage("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const responseBody = (await response.json()) as ProfileResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !responseBody.data) {
        setPageError(getErrorMessage(response.status, responseBody));
        return;
      }

      setProfile(responseBody.data);
      reset({
        name: responseBody.data.name,
        dateOfBirth: formatDateForInput(responseBody.data.dateOfBirth),
        mobile: responseBody.data.mobile ?? "",
      });
      setSuccessMessage(responseBody.message ?? "Profile updated successfully.");
    } catch {
      setPageError("Unable to update your profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPageError("");
    setSuccessMessage("");

    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setPageError("Choose a JPEG, PNG, or WEBP image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setPageError("Image size must not exceed 5 MB.");
      event.target.value = "";
      return;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setImagePreview(previewUrlRef.current);
    setSelectedImage(file);
  }

  async function uploadImage() {
    if (!selectedImage) return;

    setPageError("");
    setSuccessMessage("");
    setIsUploading(true);
    const formData = new FormData();
    formData.append("image", selectedImage);

    try {
      const response = await fetch("/api/customer/profile", {
        method: "PUT",
        body: formData,
      });
      const responseBody = (await response.json()) as ProfileResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !responseBody.data?.profileImage) {
        setPageError(getErrorMessage(response.status, responseBody));
        return;
      }

      setProfile((currentProfile) =>
        currentProfile
          ? { ...currentProfile, profileImage: responseBody.data?.profileImage }
          : currentProfile,
      );
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
      setSelectedImage(null);
      setImagePreview("");
      setSuccessMessage(responseBody.message ?? "Profile image updated successfully.");
    } catch {
      setPageError("Unable to upload your image. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function changePassword(values: CustomerChangePasswordInput) {
    setPasswordError("");
    setPasswordSuccess("");
    setIsChangingPassword(true);

    try {
      const response = await fetch("/api/customer/change-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const responseBody = (await response.json()) as { message?: string };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setPasswordError(
          responseBody.message ?? "Unable to change your password. Please try again.",
        );
        return;
      }

      resetPasswordForm();
      setPasswordSuccess(responseBody.message ?? "Password changed successfully.");
    } catch {
      setPasswordError("Unable to change your password. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  const displayedImage = imagePreview || profile?.profileImage?.url;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/customer/home" className="text-sm text-zinc-400 hover:text-amber-300">
          Back to customer home
        </Link>
        <div className="mt-8 flex flex-col gap-2 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">
              Customer account
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your profile</h1>
          </div>
          <p className="text-sm text-zinc-400">Keep your details up to date.</p>
        </div>

        {pageError && <p className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{pageError}</p>}
        {successMessage && <p className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200" role="status">{successMessage}</p>}

        {isLoading ? (
          <p className="mt-10 text-zinc-400" role="status">Loading your profile...</p>
        ) : profile ? (
          <>
          <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold">Profile image</h2>
              <div className="mt-5 flex justify-center">
                {displayedImage ? (
                  <div role="img" aria-label="Your profile" className="h-40 w-40 rounded-full bg-cover bg-center bg-no-repeat ring-4 ring-amber-300/20" style={{ backgroundImage: `url("${displayedImage}")` }} />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center rounded-full bg-zinc-800 text-4xl font-semibold text-amber-300" aria-label="No profile image">{profile.name.charAt(0).toUpperCase()}</div>
                )}
              </div>
              <label htmlFor="profile-image" className="mt-6 block cursor-pointer rounded-lg border border-amber-300 px-4 py-3 text-center text-sm font-semibold text-amber-300 transition hover:bg-amber-300 hover:text-zinc-950">Choose image</label>
              <input id="profile-image" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleImageSelection} />
              <p className="mt-3 text-center text-xs leading-5 text-zinc-500">JPEG, PNG, or WEBP. Maximum 5 MB.</p>
              <button type="button" onClick={uploadImage} disabled={!selectedImage || isUploading} className="mt-5 w-full rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50" aria-busy={isUploading}>{isUploading ? "Uploading..." : "Save image"}</button>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
              <h2 className="text-lg font-semibold">Personal details</h2>
              <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-medium text-zinc-200">Name</label>
                  <input id="name" autoComplete="name" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" {...register("name", { setValueAs: (value: string) => value === "" ? undefined : value })} />
                  {errors.name && <p className="mt-2 text-sm text-red-300">{errors.name.message}</p>}
                </div>
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-200">Email address <span className="text-xs font-normal text-zinc-500">(read-only)</span></label>
                  <input id="email" type="email" value={profile.email} readOnly className="w-full cursor-not-allowed rounded-lg border border-zinc-800 bg-zinc-950/60 px-3.5 py-3 text-sm text-zinc-500" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="dateOfBirth" className="mb-2 block text-sm font-medium text-zinc-200">Date of birth</label>
                    <input id="dateOfBirth" type="date" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" {...register("dateOfBirth", { setValueAs: (value: string) => value === "" ? undefined : value })} />
                    {errors.dateOfBirth && <p className="mt-2 text-sm text-red-300">{errors.dateOfBirth.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="mobile" className="mb-2 block text-sm font-medium text-zinc-200">Mobile number</label>
                    <input id="mobile" type="tel" autoComplete="tel" inputMode="numeric" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" {...register("mobile", { setValueAs: (value: string) => value === "" ? undefined : value })} />
                    {errors.mobile && <p className="mt-2 text-sm text-red-300">{errors.mobile.message}</p>}
                  </div>
                </div>
                <button type="submit" disabled={isSaving} className="w-full rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50" aria-busy={isSaving}>{isSaving ? "Saving..." : "Save profile"}</button>
              </form>
            </section>
          </div>
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8 lg:col-span-2">
            <h2 className="text-lg font-semibold">Change Password</h2>
            <form
              className="mt-6 grid gap-5 sm:grid-cols-2"
              onSubmit={handlePasswordSubmit(changePassword)}
              noValidate
            >
              <div>
                <label htmlFor="currentPassword" className="mb-2 block text-sm font-medium text-zinc-200">
                  Current Password
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
                  {...registerPassword("currentPassword")}
                />
                {passwordErrors.currentPassword && <p className="mt-2 text-sm text-red-300">{passwordErrors.currentPassword.message}</p>}
              </div>
              <div>
                <label htmlFor="newPassword" className="mb-2 block text-sm font-medium text-zinc-200">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
                  {...registerPassword("newPassword")}
                />
                {passwordErrors.newPassword && <p className="mt-2 text-sm text-red-300">{passwordErrors.newPassword.message}</p>}
              </div>
              <div>
                <label htmlFor="confirmNewPassword" className="mb-2 block text-sm font-medium text-zinc-200">
                  Confirm New Password
                </label>
                <input
                  id="confirmNewPassword"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
                  {...registerPassword("confirmPassword")}
                />
                {passwordErrors.confirmPassword && <p className="mt-2 text-sm text-red-300">{passwordErrors.confirmPassword.message}</p>}
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={isChangingPassword} aria-busy={isChangingPassword} className="w-full rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">
                  {isChangingPassword ? "Changing..." : "Change Password"}
                </button>
              </div>
            </form>
            {passwordError && <p className="mt-4 text-sm text-red-300" role="alert">{passwordError}</p>}
            {passwordSuccess && <p className="mt-4 text-sm text-emerald-300" role="status">{passwordSuccess}</p>}
          </section>
          </>
        ) : null}
      </div>
    </main>
  );
}