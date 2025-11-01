// Protected layout simply renders nested routes; formatting only, no behavior changes.
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
