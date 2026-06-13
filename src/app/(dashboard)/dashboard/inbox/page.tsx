"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  MessageCircle,
  Search,
  Phone,
  Loader2,
  ChevronLeft,
  Package,
  Sparkles,
  Wifi,
  WifiOff,
  Pin,
  Archive,
  Tag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { updateOrderStatus } from "@/lib/data/service";
import { generateOrderNumber } from "@/lib/data/utils";
import { useToast } from "@/components/dashboard/ToastProvider";
import { PageTransition } from "@/components/ui/motion";
import type {
  InboxConversation,
  InboxMessage,
  InboxDraftOrder,
} from "@/components/dashboard/inbox/types";
import {
  getContactName,
  getContactInitial,
} from "@/components/dashboard/inbox/utils";
import { ConversationItem } from "@/components/dashboard/inbox/ConversationItem";
import { MessageBubble } from "@/components/dashboard/inbox/MessageBubble";
import { DraftOrderCard } from "@/components/dashboard/inbox/DraftOrderCard";
import { ComposeArea } from "@/components/dashboard/inbox/ComposeArea";
import { ForwardModal } from "@/components/dashboard/inbox/ForwardModal";
export default function InboxPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<InboxConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [channelOnline, setChannelOnline] = useState(false);
  const [draftOrder, setDraftOrder] = useState<InboxDraftOrder | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string>("all");
  const [forwarding, setForwarding] = useState<InboxMessage | null>(null);
  const [suggestedReplies, setSuggestedReplies] = useState<
    Array<{ text: string; tone: string }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeConvoRef = useRef<InboxConversation | null>(null);
  useEffect(() => {
    activeConvoRef.current = activeConvo;
  }, [activeConvo]);
  // Load conversations on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data } = await supabase
        .from("conversations")
        .select(
          "*, customer:customers(id, name, phone), channel:channels(id, name, active)",
        )
        .order("last_message_at", { ascending: false });
      if (cancelled) return;
      if (data) {
        setConversations(data as unknown as InboxConversation[]);
        const anyOnline = data.some((c: Record<string, unknown>) => {
          const ch = c.channel as Record<string, unknown> | null;
          return ch?.active;
        });
        setChannelOnline(anyOnline);
      }
      setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [supabase]);
  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConvo) return;
    let cancelled = false;
    const convoId = activeConvo.id;
    async function init() {
      setMsgsLoading(true);
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convoId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      setMessages((data as InboxMessage[]) || []);
      setMsgsLoading(false);
      await supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("id", convoId);
      setConversations((prev) =>
        prev.map((c) => (c.id === convoId ? { ...c, unread_count: 0 } : c)),
      );
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [activeConvo, supabase]);
  // Load draft order for active conversation's customer
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!activeConvo?.customer_id) {
        if (!cancelled) setDraftOrder(null);
        return;
      }
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, items, total_price, delivery_cost, wilaya")
        .eq("status", "draft")
        .eq("customer_id", activeConvo.customer_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (cancelled) return;
      setDraftOrder((data as InboxDraftOrder) || null);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [activeConvo, supabase]);
  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  // Keep a ref to conversations so the realtime handler can see current
  // IDs without being a dep — prevents the subscribe/unsubscribe loop.
  const conversationsRef = useRef<InboxConversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Stable realtime subscription — only supabase (useMemo-stable) in deps.
  // Using conversations as a dep would re-subscribe on every message, which
  // saturates the connection pool and freezes the dashboard.
  useEffect(() => {
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        // No server-side filter so we don't need to resubscribe when the
        // conversation list grows. RLS already scopes to the current seller;
        // we do an extra client-side membership check for defence-in-depth.
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as InboxMessage;
          // Client-side guard: only handle messages in our conversations.
          const isOurs = conversationsRef.current.some(
            (c) => c.id === newMsg.conversation_id,
          );
          if (!isOurs) return;

          // Append to open conversation thread.
          if (
            activeConvoRef.current &&
            newMsg.conversation_id === activeConvoRef.current.id
          ) {
            setMessages((prev) => [...prev, newMsg]);
          }

          // Optimistic conversation-list update — no full re-fetch that
          // would change `conversations` state and retrigger this effect.
          setConversations((prev) =>
            prev
              .map((c) =>
                c.id === newMsg.conversation_id
                  ? {
                      ...c,
                      last_message_preview: (newMsg.content || "").substring(
                        0,
                        80,
                      ),
                      last_message_at: newMsg.created_at,
                      unread_count:
                        activeConvoRef.current?.id === c.id
                          ? c.unread_count
                          : (c.unread_count || 0) + 1,
                    }
                  : c,
              )
              .sort(
                (a, b) =>
                  new Date(b.last_message_at).getTime() -
                  new Date(a.last_message_at).getTime(),
              ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "channels" },
        (payload) => {
          const updated = payload.new as { active?: boolean };
          setChannelOnline(!!updated.active);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]); // supabase is stable (useMemo) — subscription created once
  // Draft order actions
  async function handleConfirmDraft() {
    if (!draftOrder) return;
    try {
      await updateOrderStatus(draftOrder.id, "pending");
      setDraftOrder(null);
      toast({
        type: "success",
        title: `${t.orders.confirmOrder} — ${draftOrder.order_number}`,
      });
    } catch {
      toast({ type: "error", title: "Failed to confirm order" });
    }
  }
  async function handleDiscardDraft() {
    if (!draftOrder) return;
    try {
      await updateOrderStatus(draftOrder.id, "cancelled");
      setDraftOrder(null);
      toast({
        type: "success",
        title: `${t.orders.discard} — ${draftOrder.order_number}`,
      });
    } catch {
      toast({ type: "error", title: "Failed to discard order" });
    }
  }
  // Send message
  async function handleSend() {
    if (!newMessage.trim() || !activeConvo || sending) return;
    setSending(true);
    setSendStatus("idle");
    try {
      // Call our send API
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvo.id,
          text: newMessage.trim(),
          replyToId: replyTo?.id || null,
          quotedText: replyTo?.content
            ? replyTo.content.length > 80
              ? replyTo.content.substring(0, 80) + "..."
              : replyTo.content
            : null,
        }),
      });
      if (res.ok) {
        setNewMessage("");
        setReplyTo(null);
        setSendStatus("success");
        inputRef.current?.focus();
        setTimeout(() => setSendStatus("idle"), 2000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSendStatus("error");
        toast({
          type: "error",
          title: t.inbox.sendFailed,
          description: errData.error || "",
        });
        setTimeout(() => setSendStatus("idle"), 3000);
      }
    } catch {
      setSendStatus("error");
      toast({ type: "error", title: t.inbox.sendFailed });
      setTimeout(() => setSendStatus("idle"), 3000);
    } finally {
      setSending(false);
    }
  }
  async function handleExtractOrder() {
    if (!activeConvo) return;
    setExtracting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // Try to find or create a customer from conversation metadata
      let customerId = activeConvo.customer_id;
      if (!customerId && activeConvo.customer?.phone) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("seller_id", user.id)
          .eq("phone", activeConvo.customer.phone)
          .limit(1)
          .single();
        customerId = existing?.id || null;
      }
      // Call the real AI extraction endpoint if available
      let extractedData = {
        items: [
          {
            product_id: null,
            name: t.inbox.extractedItem,
            quantity: 1,
            price: 0,
            cost_price: null,
          },
        ],
        total_price: 0,
        delivery_cost: 0,
        wilaya: "",
        commune: "",
        address: "",
      };
      try {
        const res = await fetch("/api/ai/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages.slice(-10).map((m) => m.content),
          }),
        });
        if (res.ok) {
          const aiResult = await res.json();
          if (aiResult.products?.length) {
            extractedData = {
              items: aiResult.products.map(
                (p: {
                  name: string;
                  quantity: number;
                  price?: number;
                  variant?: string;
                }) => ({
                  product_id: null,
                  name: p.name,
                  quantity: p.quantity,
                  price: p.price || 0,
                  cost_price: null,
                  variant: p.variant,
                }),
              ),
              total_price:
                aiResult.total_price ||
                aiResult.products.reduce(
                  (s: number, i: { price?: number; quantity: number }) =>
                    s + (i.price || 0) * i.quantity,
                  0,
                ),
              delivery_cost: aiResult.delivery_cost || 0,
              wilaya: aiResult.wilaya || "",
              commune: aiResult.commune || "",
              address: aiResult.address || "",
            };
            // If we didn't have customerId, but AI found a phone/name, try to insert/find it again
            if (
              !customerId &&
              (aiResult.phone || activeConvo.customer?.phone)
            ) {
              const phoneToUse = aiResult.phone || activeConvo.customer?.phone;
              const { data: extCustomer } = await supabase
                .from("customers")
                .insert({
                  seller_id: user.id,
                  phone: phoneToUse,
                  name:
                    aiResult.customer_name ||
                    activeConvo.customer?.name ||
                    "Client",
                  wilaya: aiResult.wilaya || null,
                  commune: aiResult.commune || null,
                  address: aiResult.address || null,
                })
                .select("id")
                .maybeSingle();
              customerId = extCustomer?.id || null;
            }
          }
        }
      } catch {
        console.warn("AI extraction unavailable, creating empty draft");
      }
      const { data, error } = await supabase
        .from("orders")
        .insert({
          seller_id: user.id,
          customer_id: customerId,
          status: "draft",
          total_price: extractedData.total_price,
          delivery_cost: extractedData.delivery_cost,
          wilaya: extractedData.wilaya,
          commune: extractedData.commune,
          address: extractedData.address,
          items: extractedData.items,
          order_number: generateOrderNumber(),
          source: "messenger",
        })
        .select("id, order_number, items, total_price, delivery_cost, wilaya")
        .single();
      if (error) throw error;
      if (data) {
        setDraftOrder(data as unknown as InboxDraftOrder);
        toast({
          type: "success",
          title: t.inbox.orderExtracted,
        });
      }
    } catch (e) {
      toast({
        type: "error",
        title: (e as Error).message || t.inbox.extractionFailed,
      });
    } finally {
      setExtracting(false);
    }
  }
  async function handleAiSuggest() {
    if (!activeConvo) return;
    setSuggesting(true);
    setSuggestedReplies([]);
    try {
      const res = await fetch("/api/inbox/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeConvo.id }),
      });
      if (res.ok) {
        const data = await res.json();
        const replies = data.suggestedReplies || [];
        if (replies.length > 0) {
          setSuggestedReplies(replies);
          toast({
            type: "success",
            title: t.inbox.aiSuggestionsReady || "AI reply suggestions ready",
          });
        } else {
          toast({
            type: "warning",
            title: t.inbox.noSuggestion,
          });
        }
      } else {
        // API failed — generate a smart fallback using customer context
        const customerName = activeConvo.customer?.name || "";
        const fallback = customerName
          ? `${t.inbox.hello} ${customerName}, ${t.inbox.thankYouMessage}`
          : t.inbox.genericReply;
        setSuggestedReplies([{ text: fallback, tone: "formal" }]);
        toast({
          type: "info",
          title: t.inbox.aiFallback,
        });
      }
    } catch {
      toast({
        type: "error",
        title: t.inbox.aiError,
      });
    } finally {
      setSuggesting(false);
    }
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
  async function handleForward(conversationId: string, text: string) {
    try {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text }),
      });
      if (res.ok) {
        toast({ type: "success", title: t.inbox.forwardSent });
      } else {
        toast({ type: "error", title: t.inbox.sendFailed });
      }
    } catch {
      toast({ type: "error", title: t.inbox.sendFailed });
    }
  }
  // Filter conversations
  const allLabels = useMemo(() => {
    const labelSet = new Set<string>();
    conversations.forEach((c) =>
      (c.labels || []).forEach((l) => labelSet.add(l)),
    );
    return Array.from(labelSet).sort();
  }, [conversations]);
  const filtered = conversations
    .filter((c) => {
      if (!showArchived && c.is_archived) return false;
      if (showArchived && !c.is_archived) return false;
      if (labelFilter !== "all" && !(c.labels || []).includes(labelFilter))
        return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const name = c.customer?.name?.toLowerCase() || "";
      const phone = c.customer?.phone?.toLowerCase() || "";
      return name.includes(q) || phone.includes(q);
    })
    .sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return (
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
      );
    });
  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);
  return (
    <PageTransition className="inbox-layout">
      {/* ── Conversation List ── */}
      <div
        className={`inbox-sidebar ${activeConvo ? "inbox-sidebar--hidden-mobile" : ""}`}
      >
        <div className="inbox-sidebar__header">
          <div className="inbox-sidebar__title">
            <MessageCircle size={20} />
            <span>{t.nav.inbox}</span>
            {totalUnread > 0 && (
              <span className="inbox-badge">{totalUnread}</span>
            )}
          </div>
          <div className="inbox-sidebar__status">
            {channelOnline ? (
              <>
                <Wifi size={14} className="inbox-status--online" />{" "}
                {t.inbox.connected}
              </>
            ) : (
              <>
                <WifiOff size={14} className="inbox-status--offline" />{" "}
                {t.inbox.offline}
              </>
            )}
          </div>
        </div>
        <div className="inbox-sidebar__search">
          <Search size={16} />
          <input
            type="text"
            placeholder={t.inbox.searchConversations}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search conversations"
          />
        </div>
        <div className="inbox-filter-bar">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`inbox-filter-pill ${showArchived ? "inbox-filter-pill--active" : ""}`}
          >
            <Archive size={11} />
            {showArchived ? t.inbox.hideArchived : t.inbox.showArchived}
          </button>
          {allLabels.map((label) => (
            <button
              key={label}
              onClick={() =>
                setLabelFilter(labelFilter === label ? "all" : label)
              }
              className={`inbox-filter-pill ${labelFilter === label ? "inbox-filter-pill--active" : ""}`}
            >
              <Tag size={11} />
              {label}
            </button>
          ))}
        </div>
        <div className="inbox-sidebar__list">
          {loading ? (
            <div className="inbox-empty">
              <Loader2 size={20} className="sf-animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="inbox-empty">
              <MessageCircle size={32} className="sf-opacity-20" />
              <p>{search ? t.inbox.noMatches : t.inbox.noConversations}</p>
              <p className="inbox-empty__hint">{t.inbox.messagesHint}</p>
            </div>
          ) : (
            filtered.map((convo) => (
              <ConversationItem
                key={convo.id}
                conversation={convo}
                isActive={activeConvo?.id === convo.id}
                onClick={() => setActiveConvo(convo)}
              />
            ))
          )}
        </div>
      </div>
      {/* ── Chat View ── */}
      <div
        className={`inbox-chat ${!activeConvo ? "inbox-chat--hidden-mobile" : ""}`}
      >
        {!activeConvo ? (
          <div className="inbox-empty sf-flex-1">
            <MessageCircle size={48} className="sf-opacity-15" />
            <p className="sf-mt-md sf-text-lg sf-font-semibold">
              {t.inbox.selectConversation}
            </p>
            <p className="inbox-empty__hint">
              {t.inbox.selectConversationHint}
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="inbox-chat__header">
              <button
                className="inbox-chat__back"
                onClick={() => setActiveConvo(null)}
                aria-label="Back to list"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="inbox-convo__avatar sf-text-base sf-font-bold">
                {getContactInitial(getContactName(activeConvo))}
              </div>
              <div className="inbox-chat__header-info">
                <span className="inbox-chat__header-name">
                  {getContactName(activeConvo)}
                </span>
                <span className="inbox-chat__header-phone">
                  {activeConvo.customer?.phone || ""}
                </span>
              </div>
              <div className="inbox-chat__header-actions">
                <button
                  className="inbox-icon-btn"
                  aria-label="Pin conversation"
                  title={activeConvo.is_pinned ? t.inbox.unpin : t.inbox.pin}
                  onClick={async () => {
                    await supabase
                      .from("conversations")
                      .update({ is_pinned: !activeConvo.is_pinned })
                      .eq("id", activeConvo.id);
                    setConversations((prev) =>
                      prev.map((c) =>
                        c.id === activeConvo.id
                          ? { ...c, is_pinned: !c.is_pinned }
                          : c,
                      ),
                    );
                    setActiveConvo((prev) =>
                      prev ? { ...prev, is_pinned: !prev.is_pinned } : null,
                    );
                  }}
                >
                  <Pin
                    size={18}
                    className={activeConvo.is_pinned ? "sf-text-brand" : ""}
                  />
                </button>
                <button
                  className="inbox-icon-btn"
                  aria-label="Archive conversation"
                  title={t.inbox.archive}
                  onClick={async () => {
                    await supabase
                      .from("conversations")
                      .update({ is_archived: !activeConvo.is_archived })
                      .eq("id", activeConvo.id);
                    const { data } = await supabase
                      .from("conversations")
                      .select(
                        "*, customer:customers(id, name, phone), channel:channels(id, name, active)",
                      )
                      .order("last_message_at", { ascending: false });
                    if (data) {
                      setConversations(data as unknown as InboxConversation[]);
                    }
                    setActiveConvo(null);
                    toast({
                      type: "success",
                      title: activeConvo.is_archived
                        ? t.inbox.unarchived
                        : t.inbox.archived,
                    });
                  }}
                >
                  <Archive size={18} />
                </button>
                {activeConvo.customer?.phone && (
                  <a
                    href={`tel:${activeConvo.customer.phone}`}
                    className="inbox-icon-btn"
                    aria-label="Call"
                  >
                    <Phone size={18} />
                  </a>
                )}
                <button
                  className="inbox-icon-btn"
                  aria-label="Create order from chat"
                  title={t.inbox.extractOrder}
                  onClick={handleExtractOrder}
                  disabled={extracting}
                >
                  {extracting ? (
                    <Loader2 size={18} className="sf-animate-spin" />
                  ) : (
                    <Package size={18} />
                  )}
                </button>
                <button
                  className="inbox-icon-btn"
                  aria-label="AI suggest reply"
                  title={t.inbox.aiSuggest}
                  onClick={handleAiSuggest}
                  disabled={suggesting}
                >
                  {suggesting ? (
                    <Loader2 size={18} className="sf-animate-spin" />
                  ) : (
                    <Sparkles size={18} />
                  )}
                </button>
              </div>
            </div>
            {/* Messages */}
            <div className="inbox-chat__messages">
              {msgsLoading ? (
                <div className="inbox-empty">
                  <Loader2 size={20} className="sf-animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="inbox-empty">
                  <p>{t.inbox.noMessagesYet}</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onDoubleClick={() => {
                      setReplyTo(msg);
                      inputRef.current?.focus();
                    }}
                    onForward={() => setForwarding(msg)}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* Draft Order Card */}
            {draftOrder && (
              <DraftOrderCard
                draftOrder={draftOrder}
                onConfirm={handleConfirmDraft}
                onDiscard={handleDiscardDraft}
              />
            )}
            {/* AI Reply Suggestions */}
            {suggestedReplies.length > 0 && (
              <div className="inbox-ai-suggestions-container">
                <span className="inbox-ai-suggestions-label">
                  ✨ {t.inbox.suggestedReplies || "Suggested:"}
                </span>
                {suggestedReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setNewMessage(reply.text);
                      setSuggestedReplies([]);
                      inputRef.current?.focus();
                    }}
                    className="sf-ai-quick-btn"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    title={reply.tone}
                  >
                    {reply.text.length > 60
                      ? reply.text.slice(0, 60) + "..."
                      : reply.text}
                  </button>
                ))}
                <button
                  onClick={() => setSuggestedReplies([])}
                  className="inbox-ai-suggestions-close"
                >
                  ✕
                </button>
              </div>
            )}
            <ComposeArea
              value={newMessage}
              onChange={setNewMessage}
              onSend={handleSend}
              onKeyDown={handleKeyDown}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              sending={sending}
              sendStatus={sendStatus}
              channelOnline={channelOnline}
              inputRef={inputRef}
            />
          </>
        )}
      </div>
      <ForwardModal
        isOpen={!!forwarding}
        conversations={conversations}
        activeConvoId={activeConvo?.id || null}
        messageToForward={forwarding}
        onForward={handleForward}
        onClose={() => setForwarding(null)}
      />
    </PageTransition>
  );
}
