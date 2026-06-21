import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Bot, Zap, Clock, CheckCircle2, Plus } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Automatisations — SahelFlow" };
export const dynamic = "force-dynamic";

const TRIGGER_LABELS: Record<string, string> = {
  "order.created": "Commande créée",
  "order.confirmed": "Commande confirmée",
  "order.shipped": "Commande expédiée",
  "order.delivered": "Commande livrée",
  "order.returned": "Commande retournée",
  "customer.created": "Client créé",
  "message.received": "Message reçu",
  "stock.low": "Stock faible",
};

const ACTION_LABELS: Record<string, string> = {
  "send_whatsapp": "Envoyer WhatsApp",
  "create_order": "Créer commande",
  "update_status": "Mettre à jour le statut",
  "send_notification": "Envoyer notification",
  "tag_customer": "Taguer le client",
};

export default async function AutomationsPage() {
  const { t } = await getI18n();

  const automations = await db.automation.findMany({
    orderBy: { createdAt: "desc" },
  });

  const activeCount = automations.filter((a) => a.isActive).length;
  const totalRuns = automations.reduce((sum, a) => sum + a.runCount, 0);

  const stats = [
    { label: "Total automatisations", value: String(automations.length), icon: Bot },
    { label: "Actives", value: String(activeCount), icon: Zap },
    { label: "Exécutions totales", value: String(totalRuns), icon: CheckCircle2 },
  ];

  // Pre-built recipe templates
  const recipes = [
    {
      name: "Confirmation automatique",
      trigger: "order.created",
      action: "send_whatsapp",
      description: "Envoie un message WhatsApp de confirmation quand une commande est créée",
    },
    {
      name: "Suivi de livraison",
      trigger: "order.shipped",
      action: "send_whatsapp",
      description: "Notifie le client avec le numéro de suivi quand la commande est expédiée",
    },
    {
      name: "Alerte stock faible",
      trigger: "stock.low",
      action: "send_notification",
      description: "Crée une notification quand un produit atteint son seuil de stock faible",
    },
    {
      name: "Remerciement post-livraison",
      trigger: "order.delivered",
      action: "send_whatsapp",
      description: "Envoie un message de remerciement après la livraison",
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.automations")}</h1>
          <p className="text-sm text-muted-foreground">
            Automatisez vos tâches répétitives
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouvelle automatisation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Active automations */}
      {automations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vos automatisations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {automations.map((auto) => (
                <div key={auto.id} className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{auto.name}</span>
                      <Badge variant={auto.isActive ? "default" : "outline"}>
                        {auto.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Déclencheur: {TRIGGER_LABELS[auto.trigger] ?? auto.trigger}</span>
                      <span>·</span>
                      <span>Exécutions: {auto.runCount}</span>
                      {auto.lastRunAt && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDate(auto.lastRunAt, "fr")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Configurer
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipe templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modèles dModèles d&apos;automatisationapos;automatisation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {recipes.map((recipe) => (
              <div key={recipe.name} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="font-medium">{recipe.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{recipe.description}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">
                        {TRIGGER_LABELS[recipe.trigger] ?? recipe.trigger}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="outline">
                        {ACTION_LABELS[recipe.action] ?? recipe.action}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Activer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="rounded-lg border border-dashed p-6 text-center">
        <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          LL&apos;exécution des automatisationsapos;exécution des automatisations sera disponible une fois les intégrations WhatsApp et IA connectées.
        </p>
      </div>
    </div>
  );
}
