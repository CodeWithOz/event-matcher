import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { Button } from "@/components/ui/button";

export default function AdminHomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">Admin Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/admin/courses">
            <div className="rounded-lg border p-6 bg-white hover:shadow cursor-pointer">
              <h2 className="font-medium text-lg mb-2">Courses</h2>
              <p className="text-sm text-gray-600">Manage courses: view list and add new course.</p>
            </div>
          </Link>
          <Link href="/admin/events">
            <div className="rounded-lg border p-6 bg-white hover:shadow cursor-pointer">
              <h2 className="font-medium text-lg mb-2">Events</h2>
              <p className="text-sm text-gray-600">Manage events: view list.</p>
            </div>
          </Link>
        </div>
        <div className="mt-8">
          <Link href="/">
            <Button variant="outline">Go to site</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
