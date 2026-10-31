"use client";

import { sendGuardWarnCopy } from "@/lib/i18n/whatsapp-send-guard-runtime";
import { useCallback, useMemo, useRef, useState } from "react";

import type {
  InboxChat,
  InboxMessage,
  InboxUploadState,
} from "@/components/inbox/inbox-workspace-types";
import { reconcileInboxProviderMessage } from "@/lib/inbox/message-projection";
import type { WhatsAppStatus } from "@/lib/whatsapp/types";
import {
  MEDIA_SEND_SPECS,
  type MediaSendResponse,
  type MediaSendSpec,
  postFormWithUploadProgress,
  whatsappSendFailureCopy,
} from "./inbox-workspace-shared";
import { postHeldApproval } from "./held-send-client";
import { postHeldDiscard, type HeldDiscardUiStatus } from "./held-discard-client";
import type { InboxSharedRefs } from "./use-inbox-shared-refs";

export function quoteRejectionMayRetry(
  status: number,
  data: { accepted?: boolean; effectKey?: string | null },
  hadQuote: boolean,
): boolean {
  return (
    hadQuote &&
    (status === 400 || status === 409) &&
    data.accepted !== true &&
    !data.effectKey
  );
}

export function withoutRejectedQuote<
  T extends { quotedMessageId?: string | null; quoted?: unknown },
>(message: T): T {
  return { ...message, quotedMessageId: null, quoted: null };
}

/** A browser abort is not proof the send failed. A queued effect must stay queued. */
export function abortedSendShouldFailBubble(
  effect: { state?: string | null } | null,
): boolean {
  if (!effect?.state) return true;
  return (
    effect.state !== "queued" &&
    effect.state !== "processing" &&
    effect.state !== "retrying" &&
    effect.state !== "held" &&
    effect.state !== "succeeded"
  );
}

export async function lookupQueuedSend(
  clientMessageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  state: NonNullable<InboxMessage["outboxState"]>;
  effectKey: string;
  providerMessageId: string | null;
  errorCode?: string | null;
} | null> {
  const response = await fetchImpl(
    `/api/whatsapp/outbox?messageId=${encodeURIComponent(clientMessageId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    effect?: {
      state?: InboxMessage["outboxState"];
      effectKey?: string;
      providerMessageId?: string | null;
      errorCode?: string | null;
    };
  };
  if (!data.effect?.effectKey || !data.effect.state) return null;
  return {
    state: data.effect.state,
    effectKey: data.effect.effectKey,
    providerMessageId: data.effect.providerMessageId ?? null,
    errorCode: data.effect.errorCode ?? null,
  };
}

/**
 * INB-27 — outbox concern of the Inbox workspace.
 *
 * Owns the shared send gate, truthful send error surface, bounded upload
 * progress/cancellation, the durable outbox effect monitor, ambiguous-retry
 * arbitration (INB-29), the text send path and the INB-28 media-send factory.
 */
export interface UseInboxOutboxParams {
  refs: Pick<
    InboxSharedRefs,
    "activeChatRef" | "messagesRef" | "sendingRef"
  >;
  chats: InboxChat[];
  activeChatId: string | null;
  effectiveStatus: WhatsAppStatus | null;
  canReply: boolean;
  replyText: string;
  setSendError: (error: string | null) => void;
  setReplyText: (value: string | ((current: string) => string)) => void;
  persistDraft: (conversationId: string, body: string) => Promise<boolean>;
  mutateMessages: (
    conversationId: string,
    mutation: (current: InboxMessage[]) => InboxMessage[],
  ) => void;
  loadMessages: (
    chat: InboxChat,
    options?: { background?: boolean },
  ) => Promise<void>;
  loadChats: () => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useInboxOutbox({
  refs,
  chats,
  activeChatId,
  effectiveStatus,
  canReply,
  replyText,
  setSendError,
  setReplyText,
  persistDraft,
  mutateMessages,
  loadMessages,
  loadChats,
  t,
}: UseInboxOutboxParams) {
  const { activeChatRef, messagesRef, sendingRef } = refs;

  const [sending, setSending] = useState(false);
  const [uploads, setUploads] = useState<Record<string, InboxUploadState>>({});
  // Ledger INB-29: ambiguous retry is a real decision — it uses an
  // accessible AlertDialog instead of window.confirm.
  const [ambiguousRetryMessage, setAmbiguousRetryMessage] =
    useState<InboxMessage | null>(null);
  const ambiguousRetryResolveRef = useRef<((confirmed: boolean) => void) | null>(
    null,
  );
  const uploadCancelRef = useRef(new Map<string, () => void>());
  // The owner's "Send anyway" on a held send is a deliberate decision too.
  const [heldApproveMessage, setHeldApproveMessage] = useState<InboxMessage | null>(null);
  const heldApproveResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  // "Discard" is a decision too: one dialog, then one request, with its progress shown in the box.
  const [heldDiscardMessage, setHeldDiscardMessage] = useState<InboxMessage | null>(null);
  const heldDiscardResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [heldDiscardStatus, setHeldDiscardStatus] = useState<HeldDiscardUiStatus | null>(null);

  const markUploadProgress = useCallback(
    (messageId: string, progress: number) => {
      setUploads((current) => ({
        ...current,
        [messageId]: { progress, cancellable: progress < 100 },
      }));
    },
    [],
  );

  const clearUploadState = useCallback((messageId: string) => {
    uploadCancelRef.current.delete(messageId);
    setUploads((current) => {
      if (!(messageId in current)) return current;
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }, []);

  const cancelUpload = useCallback(
    (messageId: string) => {
      const abort = uploadCancelRef.current.get(messageId);
      if (abort) abort();
    },
    [],
  );

  const monitorWhatsAppEffect = useCallback(
    async (
      conversationId: string,
      effectKey: string,
      localMessageId: string,
    ) => {
      // Applies one outbox poll to the local projection. Returns true when the
      // effect reached a terminal state and monitoring can stop.
      const applyOutboxPoll = async (): Promise<boolean> => {
        const response = await fetch(
          `/api/whatsapp/outbox?effectKey=${encodeURIComponent(effectKey)}`,
        );
        if (!response.ok) return false;
        const data = (await response.json()) as {
          effect: {
            state: InboxMessage["outboxState"];
            providerMessageId: string | null;
            errorCode?: string | null;
          };
        };
        const state = data.effect.state;
        if (state === "succeeded") {
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              localMessageId,
              data.effect.providerMessageId,
              {
                deliveryStatus: "sent",
                outboxEffectKey: effectKey,
                outboxState: state,
                outboxErrorCode: null,
              },
            ),
          );
          const active = activeChatRef.current;
          if (active?.conversationId === conversationId) {
            void loadMessages(active, { background: true });
          }
          return true;
        }
        if (state === "held") {
          // The guard parked it; nothing more will happen until the owner decides.
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              localMessageId,
              data.effect.providerMessageId,
              {
                outboxEffectKey: effectKey,
                outboxState: "held",
                outboxErrorCode: data.effect.errorCode ?? null,
              },
            ),
          );
          return true;
        }
        if (state === "ambiguous" || state === "dead_letter") {
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              localMessageId,
              data.effect.providerMessageId,
              {
                deliveryStatus: "failed",
                outboxEffectKey: effectKey,
                outboxState: state,
                outboxErrorCode: data.effect.errorCode ?? null,
              },
            ),
          );
          if (activeChatRef.current?.conversationId === conversationId) {
            setSendError(
              state === "ambiguous"
                ? t("inbox.whatsappAmbiguous")
                : t("inbox.sendFailed"),
            );
          }
          return true;
        }
        mutateMessages(conversationId, (current) =>
          reconcileInboxProviderMessage(
            current,
            localMessageId,
            data.effect.providerMessageId,
            {
              outboxEffectKey: effectKey,
              outboxState: state,
            },
          ),
        );
        return false;
      };
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt === 0 ? 1_000 : 3_000),
        );
        try {
          if (await applyOutboxPoll()) return;
        } catch {
        }
      }
      // Budget exhausted (≈6 min): without a final reconcile the bubble could
      // keep its optimistic "sending" clock even after the durable effect
      // later resolved server-side (worker backoff can outlive the monitor).
      try {
        await applyOutboxPoll();
      } catch {
      }
    },
    [activeChatRef, loadMessages, mutateMessages, setSendError, t],
  );

  const resolveAmbiguousRetry = useCallback((confirmed: boolean) => {
    setAmbiguousRetryMessage(null);
    ambiguousRetryResolveRef.current?.(confirmed);
    ambiguousRetryResolveRef.current = null;
  }, []);

  const resolveHeldApprove = useCallback((confirmed: boolean) => {
    setHeldApproveMessage(null);
    heldApproveResolveRef.current?.(confirmed);
    heldApproveResolveRef.current = null;
  }, []);

  const approveHeldMessage = useCallback(
    async (message: InboxMessage) => {
      const conversationId = activeChatRef.current?.conversationId;
      if (!message.outboxEffectKey || !conversationId) return;
      if (heldApproveResolveRef.current) return;
      const confirmed = await new Promise<boolean>((resolve) => {
        heldApproveResolveRef.current = resolve;
        setHeldApproveMessage(message);
      });
      if (!confirmed) return;
      setSendError(null);
      const result = await postHeldApproval(message.outboxEffectKey);
      const active = activeChatRef.current;
      if (!result.ok) {
        // 409: someone released or changed it first; show the real state.
        if (result.status === 409 && active?.conversationId === conversationId) {
          void loadMessages(active, { background: true });
        }
        if (active?.conversationId === conversationId) {
          setSendError(
            result.code === "HELD_SEND_OWNER_ONLY"
              ? t("whatsapp.heldSend.ownerOnly")
              : t("whatsapp.heldSend.approveFailed"),
          );
        }
        return;
      }
      mutateMessages(conversationId, (current) =>
        current.map((entry) =>
          entry.id === message.id
            ? {
                ...entry,
                deliveryStatus: "sending",
                outboxState: result.state as NonNullable<InboxMessage["outboxState"]>,
                outboxErrorCode: null,
              }
            : entry,
        ),
      );
      if (result.state === "succeeded") {
        if (active?.conversationId === conversationId) {
          void loadMessages(active, { background: true });
        }
        return;
      }
      void monitorWhatsAppEffect(conversationId, message.outboxEffectKey, message.id);
    },
    [activeChatRef, loadMessages, monitorWhatsAppEffect, mutateMessages, setSendError, t],
  );

  const resolveHeldDiscard = useCallback((confirmed: boolean) => {
    setHeldDiscardMessage(null);
    heldDiscardResolveRef.current?.(confirmed);
    heldDiscardResolveRef.current = null;
  }, []);

  const discardHeldMessage = useCallback(
    async (message: InboxMessage) => {
      const conversationId = activeChatRef.current?.conversationId;
      const effectKey = message.outboxEffectKey;
      if (!effectKey || !conversationId) return;
      if (heldDiscardResolveRef.current) return;
      const confirmed = await new Promise<boolean>((resolve) => {
        heldDiscardResolveRef.current = resolve;
        setHeldDiscardMessage(message);
      });
      if (!confirmed) return;
      setHeldDiscardStatus({ effectKey, status: "discarding" });
      const result = await postHeldDiscard(effectKey);
      if (!result.ok) {
        // 409: it was released or changed first; show the real state.
        const active = activeChatRef.current;
        if (result.status === 409 && active?.conversationId === conversationId) {
          void loadMessages(active, { background: true });
        }
        setHeldDiscardStatus({
          effectKey,
          status: "failed",
          reason:
            result.code === "HELD_SEND_OWNER_ONLY"
              ? t("whatsapp.heldSend.discardOwnerOnly")
              : result.status === 409
                ? t("whatsapp.heldSend.discardTooLate")
                : t("whatsapp.heldSend.discardFailed"),
        });
        return;
      }
      setHeldDiscardStatus(null);
      // "discarded" is the state the history route reports for this row; the
      // message type learns the word when the thread is wired.
      const discardedState = "discarded" as unknown as NonNullable<InboxMessage["outboxState"]>;
      mutateMessages(conversationId, (current) =>
        current.map((entry) =>
          entry.id === message.id ? { ...entry, outboxState: discardedState } : entry,
        ),
      );
    },
    [activeChatRef, loadMessages, mutateMessages, t],
  );

  const retryFailedMessage = useCallback(
    async (message: InboxMessage) => {
      const conversationId = activeChatRef.current?.conversationId;
      if (!message.outboxEffectKey || !conversationId) return;
      let confirmMayDuplicate = false;
      if (message.outboxState === "ambiguous") {
        // Ledger INB-29: one dialog at a time; the answer arrives through the
        // AlertDialog rendered by the thread surface.
        if (ambiguousRetryResolveRef.current) return;
        confirmMayDuplicate = await new Promise<boolean>((resolve) => {
          ambiguousRetryResolveRef.current = resolve;
          setAmbiguousRetryMessage(message);
        });
        if (!confirmMayDuplicate) return;
      }

      mutateMessages(conversationId, (current) =>
        current.map((entry) =>
          entry.id === message.id ? { ...entry, deliveryStatus: "sending" } : entry,
        ),
      );
      setSendError(null);
      try {
        const response = await fetch("/api/whatsapp/outbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            effectKey: message.outboxEffectKey,
            confirmMayDuplicate,
          }),
        });
        const data = (await response.json()) as {
          effect?: {
            state: InboxMessage["outboxState"];
            providerMessageId: string | null;
          };
        };
        if (!data.effect) throw new Error(t("inbox.sendFailed"));
        if (data.effect.state === "succeeded") {
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              message.id,
              data.effect?.providerMessageId,
              {
                deliveryStatus: "sent",
                outboxEffectKey: message.outboxEffectKey,
                outboxState: "succeeded",
              },
            ),
          );
          const active = activeChatRef.current;
          if (active?.conversationId === conversationId) {
            void loadMessages(active, { background: true });
          }
          return;
        }
        if (response.status === 202) {
          void monitorWhatsAppEffect(
            conversationId,
            message.outboxEffectKey,
            message.id,
          );
          return;
        }
        throw new Error(
          data.effect.state === "ambiguous"
            ? t("inbox.whatsappAmbiguous")
            : t("inbox.sendFailed"),
        );
      } catch (error) {
        mutateMessages(conversationId, (current) =>
          current.map((entry) =>
            entry.id === message.id
              ? { ...entry, deliveryStatus: "failed" }
              : entry,
          ),
        );
        if (activeChatRef.current?.conversationId === conversationId) {
          setSendError(
            error instanceof Error ? error.message : t("inbox.sendFailed"),
          );
        }
      }
    },
    [activeChatRef, loadMessages, monitorWhatsAppEffect, mutateMessages, setSendError, t],
  );

  const sendReply = useCallback(
    async (quotedMessageId?: string | null) => {
    const chat = chats.find((entry) => entry.id === activeChatId) ?? null;
    if (
      !chat ||
      chat.channel !== "whatsapp" ||
      !chat.transportId ||
      effectiveStatus !== "connected" ||
      !canReply ||
      sendingRef.current ||
      !replyText.trim()
    ) {
      return;
    }

    const trimmedQuotedId = quotedMessageId?.trim() || null;
    const quotedTarget = trimmedQuotedId
      ? messagesRef.current.find((message) => message.id === trimmedQuotedId) ?? null
      : null;
    const tempId = crypto.randomUUID();
    const body = replyText.trim();
    const clearAcceptedDraft = () => {
      if (activeChatRef.current?.conversationId === chat.conversationId) {
        setReplyText("");
      }
      void persistDraft(chat.conversationId, "");
    };
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    mutateMessages(chat.conversationId, (current) => [
      ...current,
      {
        id: tempId,
        body,
        direction: "outbound",
        timestamp: Date.now(),
        deliveryStatus: "sending",
        ...(trimmedQuotedId
          ? {
              quotedMessageId: trimmedQuotedId,
              quoted: quotedTarget
                ? {
                    fromMe: quotedTarget.direction === "outbound",
                    preview: Array.from(quotedTarget.body).slice(0, 200).join(""),
                    messageType: quotedTarget.messageType ?? null,
                  }
                : null,
            }
          : {}),
      },
    ]);

    try {
      const postText = (includeQuote: boolean) =>
        fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Ledger INB-31: text sends get a hard timeout so a hung request can
          // never leave the bubble in "sending" limbo. An abort is not proof
          // the send failed; the catch reconciles the same client id against
          // the outbox before painting a failure.
          signal: AbortSignal.timeout(45_000),
          body: JSON.stringify({
            clientMessageId: tempId,
            conversationId: chat.conversationId,
            to: chat.transportId,
            text: body,
            ...(includeQuote && trimmedQuotedId
              ? { quotedMessageId: trimmedQuotedId }
              : {}),
          }),
        });
      let response = await postText(true);
      let data = (await response.json()) as MediaSendResponse & {
        code?: string;
      };
      // A quote the server will not anchor (bad id, unconfirmed target,
      // cross-chat) must not swallow the seller's text. Nothing was
      // committed on that rejection, so the same client id sends the words
      // and the bubble must not keep a quote WhatsApp did not get.
      if (quoteRejectionMayRetry(response.status, data, Boolean(trimmedQuotedId))) {
        mutateMessages(chat.conversationId, (current) =>
          current.map((message) =>
            message.id === tempId ? withoutRejectedQuote(message) : message,
          ),
        );
        response = await postText(false);
        data = (await response.json()) as MediaSendResponse & { code?: string };
      }
      if (!data.errorCode && data.code) {
        data.errorCode = data.code;
      }
      if (response.status === 202 && data.accepted && data.effectKey) {
        clearAcceptedDraft();
        // A warned send is accepted; tell the person to slow down.
        const guardNotice = sendGuardWarnCopy(t, data.guard);
        if (
          guardNotice &&
          activeChatRef.current?.conversationId === chat.conversationId
        ) {
          setSendError(guardNotice);
        }
        mutateMessages(chat.conversationId, (current) =>
          current.map((message) =>
            message.id === tempId
              ? {
                  ...message,
                  outboxEffectKey: data.effectKey,
                  outboxState: data.state,
                }
              : message,
          ),
        );
        void monitorWhatsAppEffect(
          chat.conversationId,
          data.effectKey,
          tempId,
        );
        return;
      }
      if (!response.ok || !data.ok) {
        mutateMessages(chat.conversationId, (current) =>
          current.map((message) =>
            message.id === tempId
              ? {
                  ...message,
                  deliveryStatus: "failed",
                  outboxEffectKey: data.effectKey,
                  outboxState: data.state,
                }
              : message,
          ),
        );
        throw new Error(whatsappSendFailureCopy(t, data));
      }
      mutateMessages(chat.conversationId, (current) =>
        reconcileInboxProviderMessage(current, tempId, data.id, {
          deliveryStatus: "sent",
          outboxEffectKey: data.effectKey,
          outboxState: "succeeded",
        }),
      );
      clearAcceptedDraft();
      void loadChats();
    } catch (error) {
      const aborted =
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      if (aborted) {
        // The 45s abort can fire after POST /api/whatsapp/send has already
        // queued the effect. Reconcile that client id; do not mint another
        // and do not paint a queued effect as failed.
        const effect = await lookupQueuedSend(tempId).catch(() => null);
        if (effect && !abortedSendShouldFailBubble(effect)) {
          clearAcceptedDraft();
          mutateMessages(chat.conversationId, (current) =>
            current.map((message) =>
              message.id === tempId
                ? {
                    ...message,
                    deliveryStatus:
                      effect.state === "succeeded" ? "sent" : "sending",
                    outboxEffectKey: effect.effectKey,
                    outboxState: effect.state,
                    outboxErrorCode: effect.errorCode ?? null,
                  }
                : message,
            ),
          );
          if (effect.state !== "succeeded") {
            void monitorWhatsAppEffect(
              chat.conversationId,
              effect.effectKey,
              tempId,
            );
          }
          return;
        }
      }
      mutateMessages(chat.conversationId, (current) =>
        current.map((message) =>
          message.id === tempId
            ? { ...message, deliveryStatus: "failed" }
            : message,
        ),
      );
      if (activeChatRef.current?.conversationId === chat.conversationId) {
        setSendError(
          aborted
            ? t("inbox.sendError.timeout")
            : error instanceof Error
              ? error.message
              : t("inbox.sendFailed"),
        );
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [
    activeChatId,
    activeChatRef,
    canReply,
    chats,
    effectiveStatus,
    loadChats,
    messagesRef,
    monitorWhatsAppEffect,
    mutateMessages,
    persistDraft,
    replyText,
    sendingRef,
    setReplyText,
    setSendError,
    t,
  ]);

  // Ledger INB-28: one durable media-send factory. The four former ~200-line
  // copies (image/video/document/voice) differed only in their spec — the
  // endpoint, the form field, the bounded byte ceiling, the authenticated
  // media-type gate, the attachment kind and whether WhatsApp carries the
  // composer caption. Every behavioral guarantee is unchanged: bounded files,
  // optimistic message with quoted provenance, upload progress + in-flight
  // cancellation, durable effect-key reconciliation, pre-effect abort
  // dropping only the optimistic row, and the shared sending gate.
  const createMediaSender = useCallback(
    (spec: MediaSendSpec) =>
      async (file: File, quotedMessageId?: string | null) => {
        const chat = chats.find((entry) => entry.id === activeChatId) ?? null;
        const mediaType = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
        if (
          !chat ||
          chat.channel !== "whatsapp" ||
          !chat.transportId ||
          effectiveStatus !== "connected" ||
          !canReply ||
          sendingRef.current
        ) {
          return;
        }
        if (
          file.size <= 0 ||
          file.size > spec.maxBytes ||
          spec.rejects(mediaType)
        ) {
          setSendError(t("inbox.sendFailed"));
          return;
        }

        const trimmedQuotedId = quotedMessageId?.trim() || null;
        const quotedTarget = trimmedQuotedId
          ? messagesRef.current.find((message) => message.id === trimmedQuotedId) ?? null
          : null;
        const tempId = crypto.randomUUID();
        const caption = spec.carriesCaption ? replyText.trim() : "";
        let knownEffectKey: string | null = null;
        const clearAcceptedDraft = () => {
          if (activeChatRef.current?.conversationId === chat.conversationId) {
            setReplyText("");
          }
          void persistDraft(chat.conversationId, "");
        };
        sendingRef.current = true;
        setSending(true);
        setSendError(null);
        // WhatsApp audio carries no caption: the composer draft is left
        // intact and the canonical Message body is empty.
        mutateMessages(chat.conversationId, (current) => [
          ...current,
          {
            id: tempId,
            body: caption,
            direction: "outbound",
            timestamp: Date.now(),
            messageType: spec.kind,
            deliveryStatus: "sending",
            ...(trimmedQuotedId
              ? {
                  quotedMessageId: trimmedQuotedId,
                  quoted: quotedTarget
                    ? {
                        fromMe: quotedTarget.direction === "outbound",
                        preview: Array.from(quotedTarget.body).slice(0, 200).join(""),
                        messageType: quotedTarget.messageType ?? null,
                      }
                    : null,
                }
              : {}),
            attachment: {
              formatVersion: 1,
              kind: spec.kind,
              state: "ready",
              mimeType: mediaType,
              fileName: spec.kind === "audio" ? null : file.name || null,
              sizeBytes: file.size,
              durationSeconds: null,
              width: null,
              height: null,
              voiceMessage: false,
              location: null,
              contact: null,
              failureCode: null,
            },
          },
        ]);

        try {
          const form = new FormData();
          form.set("clientMessageId", tempId);
          form.set("to", chat.transportId);
          if (spec.carriesCaption) form.set("caption", caption);
          if (trimmedQuotedId) form.set("quotedMessageId", trimmedQuotedId);
          form.set(spec.fieldName, file, file.name || spec.fallbackFileName);
          let uploaded = await postFormWithUploadProgress(
            spec.endpoint,
            form,
            (percent) => markUploadProgress(tempId, percent),
            (abort) => uploadCancelRef.current.set(tempId, abort),
          );
          // Same rule as text: a quote rejection retries the media without
          // the quote. A committed first request (effect key or accepted)
          // is never sent again.
          if (
            quoteRejectionMayRetry(
              uploaded.status,
              uploaded.data,
              Boolean(trimmedQuotedId),
            )
          ) {
            mutateMessages(chat.conversationId, (current) =>
              current.map((message) =>
                message.id === tempId ? withoutRejectedQuote(message) : message,
              ),
            );
            const retry = new FormData();
            retry.set("clientMessageId", tempId);
            retry.set("to", chat.transportId);
            if (spec.carriesCaption) retry.set("caption", caption);
            retry.set(spec.fieldName, file, file.name || spec.fallbackFileName);
            uploaded = await postFormWithUploadProgress(
              spec.endpoint,
              retry,
              (percent) => markUploadProgress(tempId, percent),
              (abort) => uploadCancelRef.current.set(tempId, abort),
            );
          }
          const { status: responseStatus, data } = uploaded;
          knownEffectKey = data.effectKey ?? null;
          clearUploadState(tempId);

          if (responseStatus === 202 && data.accepted && data.effectKey) {
            if (spec.carriesCaption) clearAcceptedDraft();
            mutateMessages(chat.conversationId, (current) =>
              current.map((message) =>
                message.id === tempId
                  ? {
                      ...message,
                      outboxEffectKey: data.effectKey,
                      outboxState: data.state,
                    }
                  : message,
              ),
            );
            await loadMessages(chat, { background: true });
            void monitorWhatsAppEffect(
              chat.conversationId,
              data.effectKey,
              tempId,
            );
            void loadChats();
            return;
          }

          if (!(responseStatus >= 200 && responseStatus < 300) || !data.ok) {
            mutateMessages(chat.conversationId, (current) =>
              current.map((message) =>
                message.id === tempId
                  ? {
                      ...message,
                      deliveryStatus: "failed",
                      outboxEffectKey: data.effectKey,
                      outboxState: data.state,
                    }
                  : message,
              ),
            );
            if (data.effectKey) {
              await loadMessages(chat, { background: true });
            }
            throw new Error(
              data.requiresDuplicateConfirmation
                ? t("inbox.whatsappAmbiguous")
                : t("inbox.sendFailed"),
            );
          }

          mutateMessages(chat.conversationId, (current) =>
            reconcileInboxProviderMessage(current, tempId, data.id, {
              deliveryStatus: "sent",
              outboxEffectKey: data.effectKey,
              outboxState: "succeeded",
            }),
          );
          if (spec.carriesCaption) clearAcceptedDraft();
          await loadMessages(chat, { background: true });
          void loadChats();
        } catch (error) {
          clearUploadState(tempId);
          if (error instanceof DOMException && error.name === "AbortError") {
            // Pre-effect cancellation (#317): the request never completed, so
            // no durable intent can exist. Drop only the optimistic message.
            mutateMessages(chat.conversationId, (current) =>
              current.filter((message) => message.id !== tempId),
            );
            return;
          }
          if (knownEffectKey) {
            mutateMessages(chat.conversationId, (current) =>
              current.map((message) =>
                message.id === tempId
                  ? { ...message, deliveryStatus: "failed" }
                  : message,
              ),
            );
          } else {
            mutateMessages(chat.conversationId, (current) =>
              current.filter((message) => message.id !== tempId),
            );
            await loadMessages(chat, { background: true });
          }
          if (activeChatRef.current?.conversationId === chat.conversationId) {
            setSendError(
              error instanceof Error ? error.message : t("inbox.sendFailed"),
            );
          }
        } finally {
          sendingRef.current = false;
          setSending(false);
        }
      },
    [
      activeChatId,
      activeChatRef,
      canReply,
      chats,
      clearUploadState,
      effectiveStatus,
      loadChats,
      loadMessages,
      markUploadProgress,
      messagesRef,
      monitorWhatsAppEffect,
      mutateMessages,
      persistDraft,
      replyText,
      sendingRef,
      setReplyText,
      setSendError,
      t,
    ],
  );

  const sendImage = useMemo(() => createMediaSender(MEDIA_SEND_SPECS.image), [createMediaSender]);
  const sendVideo = useMemo(() => createMediaSender(MEDIA_SEND_SPECS.video), [createMediaSender]);
  const sendDocument = useMemo(
    () => createMediaSender(MEDIA_SEND_SPECS.document),
    [createMediaSender],
  );
  const sendVoice = useMemo(() => createMediaSender(MEDIA_SEND_SPECS.voice), [createMediaSender]);

  return {
    sending,
    setSendError,
    uploads,
    cancelUpload,
    ambiguousRetryMessage,
    resolveAmbiguousRetry,
    heldApproveMessage,
    resolveHeldApprove,
    approveHeldMessage,
    heldDiscardMessage,
    resolveHeldDiscard,
    discardHeldMessage,
    heldDiscardStatus,
    retryFailedMessage,
    sendReply,
    sendImage,
    sendVideo,
    sendDocument,
    sendVoice,
  };
}
