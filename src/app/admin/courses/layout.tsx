import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function CoursesLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get('admin_session')?.value;
  if (!token) {
    redirect('/admin/login?redirect=/admin/courses/new');
  }
  return <>{children}</>;
}
