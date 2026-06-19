"use client";

import { Loader2 } from "lucide-react";
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
					</div>
	);
}
