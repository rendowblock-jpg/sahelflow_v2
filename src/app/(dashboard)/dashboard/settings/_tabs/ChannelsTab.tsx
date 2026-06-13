"use client";

import { Loader2, Mail, Instagram } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ChannelsTabProps {
	channelStatus: string;
	qrCode: string | null;
	qrCountdown: number;
	channelLoading: boolean;
	onConnectWhatsApp: () => void;
}

export default function ChannelsTab({
	channelStatus,
	qrCode,
	qrCountdown,
	channelLoading,
	onConnectWhatsApp,
}: ChannelsTabProps) {
	const { t } = useI18n();

	const isConnected = channelStatus === "connected";
	const isScanning = channelStatus === "scanning";
	const isExpired = channelStatus === "expired";

	return (
		<div className="sf-flex-col sf-gap-lg sf-animate-fade">
			{/* Section header */}
			<div className="sf-settings-section">
				<div className="sf-settings-section-header">
					<h3 className="sf-settings-section-title">
						{t.settings.channels || "Channels"}
					</h3>
					<p className="sf-settings-section-desc">
						Connect your messaging channels to sync conversations and manage
						customer outreach directly from SahelFlow.
					</p>
				</div>

				{/* WhatsApp Card */}
				<div className="sf-settings-section-body">
					<div className="sf-wa-card">
						<div className="sf-flex sf-items-center sf-gap-md">
							{/* WA Icon */}
							<div className="sf-wa-icon-wrap">
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="#25D366"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
								</svg>
							</div>

							<div className="sf-flex-1">
								<h4 className="sf-font-semibold sf-text-primary" style={{ fontSize: "15px" }}>
									WhatsApp Business
								</h4>
								<div className="sf-flex sf-items-center sf-gap-sm" style={{ marginTop: "4px" }}>
									<div
										className={`sf-wa-status-dot ${isConnected ? "sf-wa-status-dot--connected" : ""}`}
									/>
									<span className="sf-text-xs sf-text-secondary">
										{isConnected
											? t.settings.whatsappConnected
											: isExpired
												? t.settings.qrExpired
												: isScanning
													? `${t.settings.scanQrCode} — ${qrCountdown}s`
													: t.settings.scanToConnect}
									</span>
								</div>
							</div>

							<button
								className={`sf-btn ${isConnected ? "sf-btn-ghost" : "sf-btn-primary"}`}
								onClick={onConnectWhatsApp}
								disabled={channelLoading || isConnected || isScanning}
								style={isConnected ? { borderColor: "#25D366", color: "#25D366" } : {}}
							>
								{channelLoading ? (
									<Loader2 size={15} className="sf-animate-spin" />
								) : null}
								{channelLoading
									? t.common.loading
									: isConnected
										? t.settings.connected
										: isExpired
											? t.settings.refreshQr
											: isScanning
												? t.settings.scanning
												: t.settings.generateQr}
							</button>
						</div>

						{/* QR Code Display */}
						{qrCode && isScanning && (
							<div className="sf-flex-col sf-items-center sf-gap-md" style={{ alignItems: "center" }}>
								<div className="sf-wa-qr-frame">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={qrCode}
										alt="WhatsApp QR Code"
										style={{ width: "100%", height: "100%", objectFit: "contain" }}
									/>
									{qrCountdown <= 10 && (
										<div className="sf-wa-qr-countdown">
											<span>{qrCountdown}</span>
											<span style={{ fontSize: "12px", fontWeight: 500 }}>sec</span>
										</div>
									)}
								</div>
								<div className="sf-flex sf-items-center sf-gap-sm">
									<Loader2 size={13} className="sf-animate-spin sf-text-brand" />
									<span className="sf-text-xs sf-text-secondary">
										{t.settings.waitingForScan}
									</span>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Coming Soon Channels */}
			<div className="sf-settings-section">
				<div className="sf-settings-section-header">
					<h3 className="sf-settings-section-title" style={{ fontSize: "13px" }}>
						Coming Soon
					</h3>
				</div>
				<div className="sf-settings-section-body sf-gap-sm">
					<div className="sf-channel-card">
						<div className="sf-icon-box sf-icon-brand">
							<Instagram size={16} />
						</div>
						<div className="sf-flex-1">
							<p className="sf-font-medium sf-text-sm">Instagram DMs</p>
							<p className="sf-text-xs sf-text-tertiary sf-mt-sm">
								Manage Instagram messages from your inbox
							</p>
						</div>
						<span className="sf-channel-coming-badge">Soon</span>
					</div>
					<div className="sf-channel-card">
						<div className="sf-icon-box sf-icon-brand">
							<Mail size={16} />
						</div>
						<div className="sf-flex-1">
							<p className="sf-font-medium sf-text-sm">Email</p>
							<p className="sf-text-xs sf-text-tertiary sf-mt-sm">
								Connect your business email for transactional messages
							</p>
						</div>
						<span className="sf-channel-coming-badge">Soon</span>
					</div>
				</div>
			</div>
		</div>
	);
}
