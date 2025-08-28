export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Passive layout: auth is enforced by segment-specific layouts and middleware
  return <>{children}</>;
}
