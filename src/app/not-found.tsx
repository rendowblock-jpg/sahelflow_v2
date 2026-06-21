import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-xl font-semibold">Page introuvable</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          La page que vous cherchez n&apos;existe pas ou a été déplacée.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Retour au tableau de bord</Link>
      </Button>
    </div>
  );
}
