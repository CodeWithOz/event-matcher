export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  // Auth is enforced by middleware at src/middleware.ts
  return <>{children}</>;
}
