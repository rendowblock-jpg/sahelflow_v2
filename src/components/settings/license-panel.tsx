"use client";

import { useState } from "react";
import { useLicense } from "@/hooks/use-license";
import { useLicenseStore } from "@/stores/license-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Cpu,
  Calendar,
  Copy,
  Check,
  Loader2,
} from "lucide-react";

export function LicensePanel() {
  const { license, validation, machineId, isLoading } = useLicense();
  const setLicense = useLicenseStore((s) => s.setLicense);
  const setHasChecked = useLicenseStore((s) => s.setHasChecked);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handlePasteKey() {
    setError(null);
    try {
      const parsed = JSON.parse(keyInput);
      if (!parsed.payload || !parsed.signature) {
        setError("Format de licence invalide.");
        return;
      }
      setLicense(parsed);
      setHasChecked(false);
      setPasteOpen(false);
      setKeyInput("");
      window.location.reload();
    } catch {
      setError("JSON invalide. Vérifiez le format.");
    }
  }

  function copyMachineId() {
    if (machineId) {
      navigator.clipboard.writeText(machineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Vérification de la licence...
        </CardContent>
      </Card>
    );
  }

  const status = validation?.status ?? "missing";
  const isValid = status === "valid";
  const isPermanent = license?.payload.type === "permanent";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {isValid ? (
            <ShieldCheck className="h-5 w-5 text-green-600" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-destructive" />
          )}
          Licence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Statut</span>
          <Badge variant={isValid ? "default" : "destructive"}>
            {validation?.message ?? "Aucune licence"}
          </Badge>
        </div>

        {license && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Type</span>
            <span className="text-sm font-medium capitalize">
              {license.payload.type === "permanent" && "Permanente"}
              {license.payload.type === "trial" && "Essai 7 jours"}
              {license.payload.type === "extension" && "Extension"}
            </span>
          </div>
        )}

        {license?.payload.expiresAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Expire le
            </span>
            <span className="text-sm font-medium">
              {new Date(license.payload.expiresAt).toLocaleDateString("fr-FR")}
            </span>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" />
            Identifiant machine
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-2 py-1.5 text-xs font-mono break-all">
              {machineId ?? "—"}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={copyMachineId}
              disabled={!machineId}
              title="Copier"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Communiquez cet identifiant au fondateur après paiement pour recevoir votre licence permanente.
          </p>
        </div>

        <Separator />

        {!isPermanent && (
          <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm">
                <Key className="h-4 w-4 mr-1.5" />
                Entrer une licence
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Activer une licence permanente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="license-key">Clé de licence</Label>
                  <Input
                    id="license-key"
                    placeholder="Collez le JSON reçu par email..."
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: {"{ \"payload\": {...}, \"signature\": \"...\" }"}
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-destructive" role="alert">{error}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPasteOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handlePasteKey} disabled={!keyInput.trim()}>
                  Activer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
