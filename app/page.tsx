// Root page redirects to dashboard; formatting only, no behavior changes.
import { redirect } from 'next/navigation';
export default function Home() {
  redirect('/dashboard');
}
