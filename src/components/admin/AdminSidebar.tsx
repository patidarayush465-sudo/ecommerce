"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import NotificationRegistrationButton from "@/components/common/NotificationRegistrationButton";

type IconName = "dashboard" | "users" | "products" | "categories" | "subcategories" | "orders" | "support";

type NavigationItem = {
  label: string;
  href: string;
  icon: IconName;
};

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Users", href: "/admin/users", icon: "users" },
  { label: "Products", href: "/admin/products", icon: "products" },
  { label: "Orders", href: "/admin/orders", icon: "orders" },
  { label: "Support", href: "/admin/support", icon: "support" },
  { label: "Categories", href: "/admin/categories", icon: "categories" },
  {
    label: "Subcategories",
    href: "/admin/subcategories",
    icon: "subcategories",
  },
];

function NavigationIcon({ name }: { name: IconName }) {
  const commonProps = {
    className: "h-5 w-5 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  } as const;

  switch (name) {
    case "dashboard":
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "products":
      return (
        <svg {...commonProps}>
          <path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12" />
        </svg>
      );
    case "categories":
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M17.5 14v7M14 17.5h7" />
        </svg>
      );
    case "subcategories":
      return (
        <svg {...commonProps}>
          <path d="M4 5h16M4 12h10M4 19h7" />
          <circle cx="18" cy="12" r="2" />
          <circle cx="15" cy="19" r="2" />
        </svg>
      );
    case "orders":
      return (
        <svg {...commonProps}>
          <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M8 7h8M8 11h8M8 15h5" />
        </svg>
      );
    case "support":
      return (
        <svg {...commonProps}>
          <path d="M20 11a8 8 0 0 1-8 8H7l-4 2 1.5-4A8 8 0 1 1 20 11Z" />
          <path d="M8 11h.01M12 11h.01M16 11h.01" />
        </svg>
      );
  }
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      const response = await fetch("/api/auth/admin/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Admin logout failed");
      }

      router.replace("/admin/login");
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-800 bg-slate-950 text-slate-300 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-5 lg:block lg:px-6">
        <Link href="/admin" className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
            Store control
          </span>
          <span className="mt-1 block text-lg font-semibold tracking-tight text-white">
            E-Commerce Admin
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-x-auto px-3 py-4 lg:px-4 lg:py-6" aria-label="Admin navigation">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Workspace
        </p>
        <div className="flex min-w-max gap-1 lg:block lg:min-w-0 lg:space-y-1">
          {navigationItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:w-full ${
                  isActive
                    ? "bg-cyan-400/10 text-cyan-300 ring-1 ring-inset ring-cyan-400/20"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <NavigationIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-slate-800 p-3 lg:p-4">
        <NotificationRegistrationButton compact audience="admin" />
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-900 hover:text-white"
        >
          <svg
            className="h-5 w-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5M21 12H9" />
          </svg>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
