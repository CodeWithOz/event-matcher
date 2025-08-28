"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    try {
      setLoading(true);
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin/login");
    } catch {
      router.push("/admin/login");
    } finally {
      setLoading(false);
    }
  };

  const linkClass = (href: string) => {
    const isActive = href === "/admin"
      ? pathname === "/admin" || pathname === "/admin/"
      : !!pathname?.startsWith(href);
    return `px-3 py-2 rounded-md text-sm font-medium ${
      isActive ? "bg-gray-900 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
    }`;
  };

  return (
    <header className="w-full bg-gray-800">
      <nav className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-white font-semibold">
            Admin
          </Link>
          <div className="hidden sm:flex items-center gap-1 ml-4">
            <Link href="/admin" className={linkClass("/admin")}>Dashboard</Link>
            <Link href="/admin/courses" className={linkClass("/admin/courses")}>Courses</Link>
            <Link href="/admin/events" className={linkClass("/admin/events")}>Events</Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={logout} disabled={loading}>
            {loading ? "Logging out…" : "Logout"}
          </Button>
        </div>
      </nav>
    </header>
  );
}
