import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, MessageSquare, Sparkles, Zap, TrendingUp, AlertCircle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Agents IA — SahelFlow" };
export const dynamic = "force-dynamic";

const AI_CAPABILITIES = [
  {
    icon: MessageSquare,
    title: "Extraction de commandes",
    description: "L'IA lit vos messages WhatsApp/TikTok et extrait automatiquement les détails de la commande (produit, quantité, prix, wilaya, téléphone).",
    status: "available",
  },
  {
    icon: Zap,
    title: "Actions automatisées",
    description: "30 outils IA: créer des commandes, confirmer des livraisons, envoyer des messages, analyser le stock, et plus.",
    status: "coming_soon",
  },
  {
    icon: TrendingUp,
    title: "Analyses intelligentes",
    description: "Posez des questions sur votre business: 'Quel est mon produit le plus rentable?'apos;Quel est mon produit le plus rentable?'Quel est mon produit le plus rentable?'apos;, 'Quels clients n'ont pas commandé ce mois?'apos;Quels clients n'Quels clients n'ont pas commandé ce mois?'apos;ont pas commandé ce mois?'Quels clients n'ont pas commandé ce mois?'apos;",
    status: "coming_soon",
  },
  {
    icon: AlertCircle,
    title: "Support client",
    description: "L'IA répond aux questions courantes de vos clients (statut de livraison, horaires, disponibilité des produits).",
    status: "coming_soon",
  },
];

export default async function AgentsPage() {
  const { t } = await getI18n();

  const sessions = await db.aiChatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    include: { messages: { take: 1, orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.agents")}</h1>
          <p className="text-sm text-muted-foreground">
            Votre assistant IA pour gérer votre boutique
          </p>
        </div>
        <Button>
          <Sparkles className="h-4 w-4 mr-1.5" />
          Nouvelle conversation
        </Button>
      </div>

      {/* AI status banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Gemini 3.5 Flash</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Pour activer l&apos;IA, ajoutez votre clé API Google AI Studio (gratuit, 1500 requêtes/jour).
                Allez dans Paramètres → Intégrations → Gemini.
              </p>
              <Button variant="outline" size="sm" className="mt-3">
                Configurer l&apos;IA
              </Button>
            </div>
            <Badge variant="outline">Non configuré</Badge>
          </div>
        </CardContent>
      </Card>

      {/* AI capabilities */}
      <div className="grid gap-4 md:grid-cols-2">
        {AI_CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          return (
            <Card key={cap.title}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{cap.title}</CardTitle>
                  </div>
                  <Badge variant={cap.status === "available" ? "default" : "outline"}>
                    {cap.status === "available" ? "Disponible" : "Bientôt"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{cap.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent chat sessions */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversations récentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {session.title || `Conversation ${formatDate(session.createdAt, "fr")}`}
                    </p>
                    {session.messages[0] && (
                      <p className="text-xs text-muted-foreground truncate max-w-md">
                        {session.messages[0].content}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(session.updatedAt, "fr")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state for AI chat */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Bot className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">L&apos;assistant IA arrive ici</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            Une fois Gemini configuré, vous pourrez discuter avec l&apos;IA pour gérer votre boutique
            en langage naturel.
          </p>
          <Button variant="outline">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Configurer l&apos;IA
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
