import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageExtraction } from "@/components/inbox/message-extraction";
import { MessageSquare, MessageCircle, Send, Clock } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Messagerie — SahelFlow" };
export const dynamic = "force-dynamic";

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 1) return "À l'instant";
  if (hours < 24) return `Il y a ${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days}j`;
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const { t } = await getI18n();
  const { conv: selectedConvId } = await searchParams;

  // Fetch all conversations
  const conversations = await db.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  // Fetch messages for the selected conversation (or the first one)
  const activeConvId = selectedConvId ?? conversations[0]?.id ?? null;
  const activeConv = activeConvId
    ? await db.conversation.findUnique({
        where: { id: activeConvId },
        include: { messages: { orderBy: { timestamp: "asc" } } },
      })
    : null;

  // Mark conversation as read (update unreadCount)
  if (activeConv && activeConv.unreadCount > 0 && selectedConvId) {
    await db.conversation.update({
      where: { id: activeConv.id },
      data: { unreadCount: 0 },
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversation list (left) */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t("nav.inbox")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {conversations.length} conversation{conversations.length > 1 ? "s" : ""}
          </p>
        </div>
        <ScrollArea className="flex-1">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune conversation.
              <br />
              Connectez MessageCircle pour recevoir des messages.
            </div>
          ) : (
            <div className="divide-y">
              {conversations.map((conv) => {
                const isActive = conv.id === activeConvId;
                return (
                  <Link
                    key={conv.id}
                    href={`/inbox?conv=${conv.id}`}
                    className={`flex items-start gap-3 p-3 hover:bg-accent/50 transition-colors ${
                      isActive ? "bg-accent" : ""
                    }`}
                  >
                    <Avatar className="h-10 w-10 mt-1">
                      <AvatarFallback className={conv.channel === "whatsapp" ? "bg-green-100 text-green-700" : "bg-pink-100 text-pink-700"}>
                        {conv.channel === "whatsapp" ? <MessageCircle className="h-5 w-5" /> : "TT"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{conv.contactName}</span>
                        {conv.lastMessageAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {formatTime(conv.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      {conv.contactPhone && (
                        <p className="text-xs text-muted-foreground font-mono">{conv.contactPhone}</p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <Badge variant="outline" className="text-xs capitalize">
                          {conv.channel}
                        </Badge>
                        {conv.unreadCount > 0 && (
                          <Badge className="bg-primary text-primary-foreground text-xs px-1.5 py-0">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Message thread (right) */}
      <div className="flex-1 flex flex-col">
        {activeConv ? (
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className={activeConv.channel === "whatsapp" ? "bg-green-100 text-green-700" : "bg-pink-100 text-pink-700"}>
                    {activeConv.contactName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-semibold">{activeConv.contactName}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{activeConv.contactPhone}</p>
                </div>
              </div>
              <Badge variant="outline" className="capitalize">
                {activeConv.channel}
              </Badge>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {activeConv.messages.map((msg) => (
                  <div key={msg.id} className="space-y-2">
                    <div className={`flex ${msg.direction === "inbound" ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          msg.direction === "inbound"
                            ? "bg-muted text-foreground"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        <p className={`text-xs mt-1 ${msg.direction === "inbound" ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                          {new Date(msg.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    {/* Show extraction button on inbound messages that look like orders */}
                    {msg.direction === "inbound" && msg.body.length > 10 && (
                      <div className="ml-4">
                        <MessageExtraction
                          messageId={msg.id}
                          messageBody={msg.body}
                          knownPhone={activeConv.contactPhone ?? undefined}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Reply box (stub — will connect to Baileys in Phase 0 #1) */}
            <div className="p-4 border-t">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Répondez... (MessageCircle non connecté)"
                  disabled
                  className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground"
                />
                <Button size="icon" disabled>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Connectez MessageCircle (Baileys) pour envoyer des messages — Phase 0 item #1
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="rounded-full bg-muted p-4 mb-4 mx-auto w-fit">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Aucune conversation sélectionnée</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Sélectionnez une conversation dans la liste, ou connectez MessageCircle pour commencer à recevoir des messages.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
