"use client";

import { Smartphone, Loader2 } from "lucide-react";
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

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">
				{t.settings.channels || t.common.error}
			</h3>
			<p className="sf-text-sm-secondary">
				Connect your WhatsApp account to automatically sync conversations and
				answer customers directly from the SahelFlow Inbox.
			</p>
			<div className="sf-card sf-flex-col sf-gap-lg sf-items-start sf-card-muted">
				<div className="sf-flex-center-gap-md">
					<div className="sf-size-7 sf-wa-icon">
						<Smartphone size={24} />
					</div>
					<div>
						<h4 className="sf-font-semibold">WhatsApp Business</h4>
						<p className="sf-settings-meta">
							{channelStatus === "connected"
								? t.settings.whatsappConnected
								: channelStatus === "expired"
									? t.settings.qrExpired
									: channelStatus === "scanning"
										? `${t.settings.scanQrCode} (${qrCountdown}s)`
										: t.settings.scanToConnect}
						</p>
					</div>
				</div>
				{qrCode && channelStatus === "scanning" && (
					<div className="sf-ml-auto sf-mr-auto sf-p-md sf-qr-frame">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={qrCode}
							alt="WhatsApp QR Code"
							className="sf-block sf-qr-img"
						/>
					</div>
				)}
				{channelStatus === "scanning" && (
					<p className="sf-text-sm-secondary sf-text-brand sf-mt-sm">
						<Loader2
							size={14}
							className="sf-inline sf-align-middle sf-animate-spin sf-mr-sm"
						/>
						{t.settings.waitingForScan}
					</p>
				)}
				<button
					className={`sf-btn ${channelStatus === "connected" ? "sf-btn-outline" : "sf-btn-primary"}`}
					onClick={onConnectWhatsApp}
					disabled={
						channelLoading ||
						channelStatus === "connected" ||
						channelStatus === "scanning"
					}
				>
					{channelLoading ? (
						<Loader2 size={16} className="sf-animate-spin" />
					) : (
						<Smartphone size={16} />
					)}
					{channelStatus === "connected"
						? t.settings.connected
						: channelStatus === "expired"
							? t.settings.refreshQr
							: channelStatus === "scanning"
								? t.settings.scanning
								: t.settings.generateQr}
				</button>
			</div>
		</div>
	);
}
