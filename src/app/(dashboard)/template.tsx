/**
 * Route-level template — wraps every page in the (dashboard) group
 * with a subtle fade-in transition on navigation.
 * 
 * Next.js re-renders template.tsx on every navigation (unlike layout.tsx
 * which persists). This gives us a smooth page transition without
 * client-side routing libraries.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in">
      {children}
    </div>
  );
}
