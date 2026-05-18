"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { AlertCircle, Loader2 } from "lucide-react";

interface DeadLetterEvent {
	id: string;
	event_type: string;
	error: string;
	attempts: number;
	max_attempts: number;
	created_at: string;
	payload: Record<string, unknown>;
}

export default function DeadLetterSection() {
	const { t } = useI18n();
	const [events, setEvents] = useState<DeadLetterEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [retrying, setRetrying] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/webhooks/dead-letters")
			.then((r) => r.json())
			.then((data) => setEvents(data.events || []))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	async function handleRetry(id: string) {
		setRetrying(id);
		try {
			const res = await fetch("/api/webhooks/dead-letters", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "retry", id }),
			});
			if (res.ok) {
				setEvents((prev) => prev.filter((e) => e.id !== id));
			}
		} catch {
			/* non-blocking */
		} finally {
			setRetrying(null);
		}
	}

	async function handleDismiss(id: string) {
		try {
			await fetch("/api/webhooks/dead-letters", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "dismiss", id }),
			});
			setEvents((prev) => prev.filter((e) => e.id !== id));
		} catch {
			/* non-blocking */
		}
	}

	if (loading) return null;
	if (events.length === 0) return null;

	return (
		<div className="sf-card sf-mt-xl">
			<div className="sf-flex-center-gap-md sf-mb-lg">
				<div className="sf-icon-box sf-icon-danger">
					<AlertCircle size={16} />
				</div>
				<div>
					<h3 className="sf-heading-sm">{t.agents?.deadLetters}</h3>
					<span className="sf-text-xs-tertiary">
						{events.length} {t.agents?.unresolved}
					</span>
				</div>
			</div>

			<div className="sf-flex-col-gap-md">
				{events.map((ev) => (
					<div key={ev.id} className="sf-list-item sf-deadletter-item">
						<div className="sf-flex-1 sf-overflow-hidden">
							<p className="sf-text-sm-secondary sf-font-semibold sf-mb-sm">
								{ev.event_type}
							</p>
							<p
								className="sf-text-truncate"
								style={{
									fontSize: 11,
									color: "var(--color-danger-400)",
									maxWidth: 400,
								}}
							>
								{ev.error}
							</p>
							<p className="sf-deadletter-meta">
								{ev.attempts}/{ev.max_attempts} attempts •{" "}
								{new Date(ev.created_at).toLocaleDateString()}
							</p>
						</div>
						<div className="sf-flex-gap-sm-shrink">
							<button
								className="sf-btn sf-btn-ghost sf-btn-xs"
								onClick={() => handleRetry(ev.id)}
								disabled={retrying === ev.id}
							>
								{retrying === ev.id ? (
									<Loader2 size={12} className="sf-animate-spin" />
								) : (
									`↻ ${t.agents?.retryEvent}`
								)}
							</button>
							<button
								className="sf-btn sf-btn-ghost sf-btn-xs sf-text-tertiary"
								onClick={() => handleDismiss(ev.id)}
							>
								{t.agents?.dismissEvent}
							</button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
