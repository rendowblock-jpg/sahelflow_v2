"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { useShopStore } from "@/stores/shop-store";

const EMOJI_OPTIONS = ["🏪", "🛍️", "📦", "📱", "👕", "💻", "🏠", "💄", "⚽", "🎮"];

export function CreateShopDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏪");
  const [pending, startTransition] = useTransition();
  const createShop = useShopStore((s) => s.createShop);

  function reset() {
    setName("");
    setIcon("🏪");
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Le nom de la boutique est requis");
      return;
    }
    startTransition(async () => {
      try {
        const shop = await createShop({ name: name.trim(), icon });
        toast.success(`Boutique "${shop.name}" créée`);
        setOpen(false);
        reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground">
          <Plus className="h-4 w-4" />
          <span>Nouvelle boutique</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer une nouvelle boutique</DialogTitle>
          <DialogDescription>
            Chaque boutique a sa propre base de données séparée. Vous pouvez
            gérer jusqu&apos;à 10 boutiques (maximum 10).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="shop-name">Nom de la boutique *</Label>
            <Input
              id="shop-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ma Boutique"
              maxLength={50}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Icône</Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`h-9 w-9 rounded-md border-2 text-lg transition-colors ${
                    icon === emoji
                      ? "border-primary bg-accent"
                      : "border-border hover:border-foreground/20"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleCreate} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
