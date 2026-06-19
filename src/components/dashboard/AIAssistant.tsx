"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
	Bot,
	Send,
	X,
	Sparkles,
	Loader2,
	Lightbulb,
	Package,
	Clock,
	DollarSign,
	Minimize2,
	Trash2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import ChatMessage from "@/components/dashboard/ai/ChatMessage";
import ThinkingIndicator from "@/components/dashboard/ai/ThinkingIndicator";

interface ChatMessageItem {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	actionCards?: Array<{
		type: "success" | "info" | "data";
		title: string;
		description?: string;
	}>;
	isError?: boolean;
	modelUsed?: string;
}

const MODEL_FRIENDLY_NAMES: Record<string, string> = {
	"llama-3.1-8b": "Sahara-Flash",
	"llama-4-scout": "Sahara-Brain",
	"gpt-oss-120b": "Sahara-Deep",
	"qwen3-32b": "Sahara-Struct",
	"llama-3.3-70b": "Sahara-Craft",
};
function getModelBadge(modelId: string): string {
	for (const [key, name] of Object.entries(MODEL_FRIENDLY_NAMES)) {
		if (modelId.includes(key)) return name;
	}
	return modelId.length > 16 ? modelId.slice(0, 16) + "…" : modelId;
}

export function AIAssistant() {
	const { t, locale } = useI18n();
	const { isMobile } = useLayout();
	const [isOpen, setIsOpen] = useState(false);
	const [messages, setMessages] = useState<ChatMessageItem[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [detectedLang, setDetectedLang] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(
		null,
	);
	const [thinkingStage, setThinkingStage] = useState(0);
	const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
	const [_sessionId, setSessionId] = useState<string | null>(null);
	const sessionIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isLoading) {
			setThinkingStage(0);
			return;
		}
		const interval = setInterval(() => {
			setThinkingStage((prev) => (prev < 2 ? prev + 1 : prev));
		}, 2000);
		return () => clearInterval(interval);
	}, [isLoading]);

	// Server-side session persistence with localStorage fallback
	useEffect(() => {
		async function initChat() {
			try {
				// Try loading last session from server
				const res = await fetch("/api/ai/sessions");
				if (res.ok) {
					const { sessions } = await res.json();
					if (sessions && sessions.length > 0) {
						const lastSession = sessions[0];
						setSessionId(lastSession.id);
						sessionIdRef.current = lastSession.id;
						// Load messages for last session
						const msgRes = await fetch(`/api/ai/sessions/${lastSession.id}`);
						if (msgRes.ok) {
							const { messages: serverMsgs } = await msgRes.json();
							if (serverMsgs && serverMsgs.length > 0) {
								setMessages(
									serverMsgs.map(
										(m: {
											id: string;
											role: string;
											content: string;
											action_cards: unknown;
											created_at: string;
										}) => ({
											id: m.id,
											role: m.role as "user" | "assistant",
											content: m.content,
											timestamp: new Date(m.created_at),
											actionCards:
												m.action_cards as ChatMessageItem["actionCards"],
										}),
									),
								);
								// Migrate: clear old localStorage since server has data
								localStorage.removeItem("sahelflow_ai_chat");
								return;
							}
						}
					}
					// No server messages — check for localStorage migration
					const saved = localStorage.getItem("sahelflow_ai_chat");
					if (saved) {
						const parsed = JSON.parse(saved);
						const revived = (parsed as ChatMessageItem[]).map((m) => ({
							...m,
							timestamp: new Date(m.timestamp),
						}));
						if (revived.length > 0) setMessages(revived);
						localStorage.removeItem("sahelflow_ai_chat");
						return;
					}
				}
			} catch {
				// Fallback: load from localStorage
				try {
					const saved = localStorage.getItem("sahelflow_ai_chat");
					if (saved) {
						const parsed = JSON.parse(saved);
						const revived = (parsed as ChatMessageItem[]).map((m) => ({
							...m,
							timestamp: new Date(m.timestamp),
						}));
						if (revived.length > 0) {
							setMessages(revived);
							return;
						}
					}
				} catch {
					/* localStorage fallback may fail */
				}
			}
			// Default welcome message
			setMessages([
				{
					id: "welcome",
					role: "assistant",
					content: t.ai.welcomeMessage,
					timestamp: new Date(),
				},
			]);
		}
		initChat();
		// Load saved language preference
		const savedLang = localStorage.getItem("sahelflow_ai_lang");
		if (savedLang) setDetectedLang(savedLang);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Save messages to localStorage as fallback cache
	useEffect(() => {
		if (messages.length > 0) {
			try {
				const toSave = messages.slice(-50);
				localStorage.setItem("sahelflow_ai_chat", JSON.stringify(toSave));
			} catch {
				/* localStorage may be unavailable */
			}
		}
	}, [messages]);

	useEffect(() => {
		if (detectedLang) {
			localStorage.setItem("sahelflow_ai_lang", detectedLang);
		} else {
			localStorage.removeItem("sahelflow_ai_lang");
		}
	}, [detectedLang]);

	// Helper: persist a message to the server session
	const persistMessage = useCallback(
		async (
			role: "user" | "assistant",
			content: string,
			actionCards?: unknown[],
			isFirst = false,
		) => {
			let sid = sessionIdRef.current;
			// Create session on first message if none exists
			if (!sid) {
				try {
					const res = await fetch("/api/ai/sessions", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({}),
					});
					if (res.ok) {
						const { session } = await res.json();
						sid = session.id;
						setSessionId(session.id);
						sessionIdRef.current = session.id;
					}
				} catch {
					/* session init may fail */
				}
			}
			if (!sid) return;
			try {
				await fetch(`/api/ai/sessions/${sid}/messages`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						role,
						content,
						actionCards,
						isFirstMessage: isFirst,
					}),
				});
			} catch {
				/* message persist may fail */
			}
		},
		[],
	);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	useEffect(() => {
		if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
	}, [isOpen]);

	function detectLanguage(text: string): string {
		const darijaPatterns =
			/\b(wach|besh|bch|ki|kif|hadi|hada|nta|nti|ana|3and|m3a|gal|galt|habit|bghit|nabghi|3tini|chhal|ch7al|kayen|makanch|makaynch|wella|aya|saha|sahha|bslama|khouya|khti|sahbi|labas|hamdoulah|nchallah|lyoum|ghudwa|bsuraa|w3lach|mnin|bach|rani|rahi|3lbalak|zouj|tletha|rak)\b/i;
		const francoArabPatterns = /[a-zA-Z][235789]|[235789][a-zA-Z]/;
		const arabicScript = /[\u0600-\u06FF\u0750-\u077F]/;
		const frenchPatterns =
			/\b(je|tu|il|elle|nous|vous|les|des|une|est|avec|pour|dans|sur|pas|que|qui|mais|bonjour|salut|merci|oui|non|comment|combien|livraison|commande|prix|cher|client)\b/i;

		const hasDarija = darijaPatterns.test(text);
		const hasFrancoArab = francoArabPatterns.test(text);
		const hasArabic = arabicScript.test(text);
		const hasFrench = frenchPatterns.test(text);

		if (hasArabic && hasDarija) return "darija";
		if (hasArabic && !hasDarija) return "arabic";
		if (hasFrancoArab && !hasFrench) return "darija";
		if (hasFrancoArab && hasFrench) return "mixed";
		if (hasDarija && hasFrench) return "mixed";
		if (hasDarija) return "darija";
		if (hasFrench) return "french";
		return "english";
	}

	const getLanguageInstruction = useCallback((): string => {
		switch (locale) {
			case "ar":
				return "RESPOND EXCLUSIVELY in Modern Standard Arabic (فصحى). NEVER respond in Darija or dialect. The user may write in Darija, Franco-Arab, or dialect — you MUST fully understand it, but your response MUST be in clear, professional Arabic (فصحى). Do NOT use any dialect words in your response.";
			case "fr":
				return "RESPOND EXCLUSIVELY in French. The user may write in Darija, Franco-Arab, Arabic, or dialect — you MUST fully understand it, but your response MUST be in clear, professional French. Do NOT use Darija or Arabic words in your response.";
			default:
				return "RESPOND EXCLUSIVELY in English. The user may write in Darija, Franco-Arab, Arabic, French, or dialect — you MUST fully understand it, but your response MUST be in clear, professional English. Do NOT use Darija or Arabic words in your response.";
		}
	}, [locale]);

	const sendMessage = useCallback(
		async (text: string) => {
			if (!text.trim() || isLoading) return;

			const userMsg: ChatMessageItem = {
				id: `user_${Date.now()}`,
				role: "user",
				content: text.trim(),
				timestamp: new Date(),
			};
			setMessages((prev) => [...prev, userMsg]);
			setInput("");
			setIsLoading(true);
			setLastFailedMessage(null);

			// Persist user message to server
			const isFirst = messages.filter((m) => m.role === "user").length === 0;
			persistMessage("user", text.trim(), undefined, isFirst);

			if (!detectedLang) {
				const detected = detectLanguage(text);
				setDetectedLang(detected);
			}

			try {
				const res = await fetch("/api/ai", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "agent_execute",
						question: text.trim(),
						languageInstruction: getLanguageInstruction(),
						locale,
						conversationHistory: messages
							.filter((m) => m.id !== "welcome")
							.map((m) => ({ role: m.role, content: m.content })),
					}),
				});

				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}

				const data = await res.json();

				if (data.error && !data.answer) {
					const fallbackRes = await fetch("/api/ai", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							action: "ask_assistant",
							question: text.trim(),
							businessContext:
								"SahelFlow e-commerce platform for Algerian sellers.",
							conversationHistory: messages
								.filter((m) => m.id !== "welcome")
								.map((m) => ({ role: m.role, content: m.content })),
						}),
					});
					const fallbackData = await fallbackRes.json();
					setMessages((prev) => [
						...prev,
						{
							id: `ai_${Date.now()}`,
							role: "assistant",
							content: fallbackData.answer || fallbackData.error || t.ai.error,
							timestamp: new Date(),
						},
					]);
				} else {
					const aiContent = data.answer || t.ai.error;
					setMessages((prev) => [
						...prev,
						{
							id: `ai_${Date.now()}`,
							role: "assistant",
							content: aiContent,
							timestamp: new Date(),
							actionCards: data.actionCards,
							modelUsed: data.modelUsed,
						},
					]);
					if (data.modelUsed) setLastModelUsed(data.modelUsed);
					// Persist assistant response to server
					persistMessage("assistant", aiContent, data.actionCards);
				}
			} catch {
				setLastFailedMessage(text.trim());
				setMessages((prev) => [
					...prev,
					{
						id: `err_${Date.now()}`,
						role: "assistant",
						content: t.ai.error,
						timestamp: new Date(),
						isError: true,
					},
				]);
			} finally {
				setIsLoading(false);
			}
		},
		[
			isLoading,
			detectedLang,
			messages,
			t.ai.error,
			locale,
			getLanguageInstruction,
			persistMessage,
		],
	);

	function clearChat() {
		setMessages([
			{
				id: "welcome",
				role: "assistant",
				content: t.ai.welcomeMessage,
				timestamp: new Date(),
			},
		]);
		setDetectedLang(null);
		setLastFailedMessage(null);
		setLastModelUsed(null);
		// Create a new server session
		setSessionId(null);
		sessionIdRef.current = null;
	}

	const QUICK_PROMPTS = [
		{
			label: t.ai.pendingOrders || "Pending Orders",
			prompt:
				locale === "ar"
					? "أرني الطلبيات المعلقة"
					: locale === "fr"
						? "Montre-moi les commandes en attente"
						: "Show me pending orders",
			icon: Clock,
		},
		{
			label: t.ai.revenueToday || "Revenue Today",
			prompt:
				locale === "ar"
					? "كم إيرادات اليوم؟"
					: locale === "fr"
						? "Quel est le chiffre d'affaires aujourd'hui ?"
						: "What's my revenue today?",
			icon: DollarSign,
		},
		{
			label: t.ai.bestProducts || "Stock & Products",
			prompt:
				locale === "ar"
					? "ما هي وضعية المخزون؟"
					: locale === "fr"
						? "Quels sont les produits en rupture de stock ?"
						: "Show me low stock products",
			icon: Package,
		},
		{
			label: "Business Health",
			prompt:
				locale === "ar"
					? "كيف هو أداء متجري اليوم؟"
					: locale === "fr"
						? "Comment se porte mon activité aujourd'hui ?"
						: "How is my business doing today?",
			icon: Sparkles,
		},
		{
			label: "Confirm Pending",
			prompt:
				locale === "ar"
					? "تأكيد الطلبيات المعلقة"
					: locale === "fr"
						? "Confirmer les commandes en attente"
						: "Confirm pending orders",
			icon: Sparkles,
		},
		{
			label: t.ai.growthTips || "Tips",
			prompt:
				locale === "ar"
					? "أعطني نصائح لزيادة المبيعات"
					: locale === "fr"
						? "Donne-moi des conseils"
						: "Give me growth tips for Algeria",
			icon: Lightbulb,
		},
	];

	// Dynamic popup positioning — stays inline because it switches between mobile/desktop
	const popupStyle: React.CSSProperties = isMobile
		? {
				position: "fixed",
				bottom: 0,
				left: 0,
				right: 0,
				height: "85vh",
				zIndex: 1001,
				borderRadius: "20px 20px 0 0",
				background: "var(--color-surface-secondary)",
				border: "1px solid var(--color-line-primary)",
				borderBottom: "none",
				display: "flex",
				flexDirection: "column",
				boxShadow: "0 -8px 40px rgba(0,0,0,0.3)",
				animation: "sf-slide-up-sheet 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
			}
		: {
				position: "fixed",
				bottom: 90,
				insetInlineEnd: 24,
				width: 460,
				height: 620,
				zIndex: 1001,
				borderRadius: 20,
				background: "var(--color-surface-secondary)",
				border: "1px solid var(--color-line-primary)",
				display: "flex",
				flexDirection: "column",
				boxShadow:
					"0 12px 48px rgba(0,0,0,0.25), 0 0 0 1px rgba(99,102,241,0.1)",
				animation: "sf-scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
				overflow: "hidden",
			};

	return (
		<>
			{/* Floating Action Button — gradient sphere with pulse */}
			{!isOpen && (
				<button className="sf-ai-fab-aaa" onClick={() => setIsOpen(true)} aria-label="Open AI Assistant">
					<Sparkles size={22} />
					{messages.filter(m => m.role === 'assistant' && m.id !== 'welcome').length > 0 && (
						<span className="sf-ai-fab-badge">
							{Math.min(messages.filter(m => m.role === 'assistant' && m.id !== 'welcome').length, 9)}
						</span>
					)}
				</button>
			)}

			{/* Chat Popup */}
			{isOpen && (
				<>
					{/* Backdrop on mobile */}
					{isMobile && (
						<div
							className="sf-ai-chat-backdrop"
							onClick={() => setIsOpen(false)}
						/>
					)}

					<div style={popupStyle}>
						{/* Header — AAA frosted glass with 3px brand accent bar */}
						<div className="sf-ai-window-header">
							<div className="sf-flex sf-items-center sf-gap-md">
								<div
									className="sf-ai-msg-avatar"
									style={{ background: "rgba(255,255,255,0.2)" }}
								>
									<Bot size={16} />
								</div>
								<div>
									<div className="sf-flex sf-items-center sf-gap-sm">
										<p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
											{t.ai.title}
										</p>
										{lastModelUsed && (
											<span
												className="sf-ai-model-badge"
												title={lastModelUsed}
											>
												⚡ {getModelBadge(lastModelUsed)}
											</span>
										)}
									</div>
									<p style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.2, marginTop: 2 }}>
										{t.ai.subtitle}
									</p>
								</div>
							</div>
							<div className="sf-flex sf-items-center sf-gap-sm">
								<button
									onClick={clearChat}
									title={t.common.clearConversation}
									className="sf-ai-header-btn"
								>
									<Trash2 size={14} />
								</button>
								<button
									onClick={() => setIsOpen(false)}
									className="sf-ai-header-btn"
								>
									{isMobile ? <X size={18} /> : <Minimize2 size={16} />}
								</button>
							</div>
						</div>

						{/* Messages */}
						<div className="sf-ai-chat-messages">
							{messages.map((msg) => (
								<ChatMessage
									key={msg.id}
									id={msg.id}
									role={msg.role}
									content={msg.content}
									isError={msg.isError}
									actionCards={msg.actionCards}
									lastFailedMessage={lastFailedMessage}
									onRetry={sendMessage}
								/>
							))}

							{isLoading && (
								<ThinkingIndicator
									stage={thinkingStage}
									labels={{
										analyzing:
											t.ai.analyzingRequest || "Analyzing your request...",
										thinking:
											t.ai.thinkingTools || "Thinking & executing tools...",
										preparing:
											t.ai.preparingResponse || "Preparing response...",
									}}
								/>
							)}

							<div ref={messagesEndRef} />
						</div>

						{/* Quick Prompts — 2×3 icon card grid */}
						{messages.length <= 1 && (
							<div className="sf-ai-quick-grid">
								{QUICK_PROMPTS.map((q) => (
									<button
										key={q.label}
										onClick={() => sendMessage(q.prompt)}
										className="sf-ai-quick-card"
									>
										<div className="sf-ai-quick-card-icon">
											<q.icon size={13} />
										</div>
										{q.label}
									</button>
								))}
							</div>
						)}

						{/* Input — pill-shaped with integrated send button */}
						<div className="sf-ai-input-pill">
							<input
								ref={inputRef}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
								placeholder={t.ai.placeholder}
								disabled={isLoading}
								dir="auto"
							/>
							<button
								className="sf-ai-send"
								onClick={() => sendMessage(input)}
								disabled={!input.trim() || isLoading}
							>
								{isLoading ? (
									<Loader2 size={15} className="sf-animate-spin" />
								) : (
									<Send size={15} />
								)}
							</button>
						</div>
					</div>
				</>
			)}
		</>
	);
}
