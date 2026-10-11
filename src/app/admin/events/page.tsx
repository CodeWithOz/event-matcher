"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import { useState, useEffect } from "react";

interface EventItem {
  _id: string;
  title: string;
  description: string;
  createdAt?: string;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/events", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load events");
      }

      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">Events</h1>

        {error && (
          <div className="mb-6 p-4 border border-red-200 rounded-md bg-red-50 text-red-700">
            {error}
          </div>
        )}

        {events.length === 0 && !error ? (
          <p className="text-gray-600">No events found.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e._id} className="rounded-md border bg-white p-4">
                <div className="font-medium">{e.title}</div>
                <div className="text-sm text-gray-600">{e.description}</div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
