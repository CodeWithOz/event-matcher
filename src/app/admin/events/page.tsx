import AdminHeader from "@/components/admin/AdminHeader";

interface EventItem {
  _id: string;
  title: string;
  description: string;
  createdAt?: string;
}

async function getEvents(): Promise<EventItem[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/events`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed");
    const data = (await res.json()) as { events: EventItem[] };
    return data.events || [];
  } catch {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (!res.ok) return [];
      const data = (await res.json()) as { events: EventItem[] };
      return data.events || [];
    } catch {
      return [];
    }
  }
}

export default async function AdminEventsPage() {
  const events = await getEvents();

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">Events</h1>
        {events.length === 0 ? (
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
