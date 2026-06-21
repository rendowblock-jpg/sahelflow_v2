import { ImportPanel, ExportButton } from "@/components/import/import-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Import / Export — SahelFlow" };
export const dynamic = "force-dynamic";

export default function ImportsPage() {
  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import / Export</h1>
        <p className="text-sm text-muted-foreground">
          Importez vos produits et clients depuis un fichier CSV ou XLSX, ou exportez vos données.
        </p>
      </div>

      <ImportPanel
        entity="products"
        title="Importer des produits"
        description="CSV ou XLSX avec colonnes: nom, prix, stock, catégorie (optionnel), SKU (optionnel)."
      />

      <ImportPanel
        entity="customers"
        title="Importer des clients"
        description="CSV ou XLSX avec colonnes: nom, téléphone, wilaya (optionnel), commune (optionnel), adresse (optionnel)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            Exporter les données
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <ExportButton entity="orders" label="Exporter les commandes (CSV)" />
            <ExportButton entity="customers" label="Exporter les clients (CSV)" />
            <ExportButton entity="products" label="Exporter les produits (CSV)" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
