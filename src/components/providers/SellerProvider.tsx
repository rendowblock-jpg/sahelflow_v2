"use client";

import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	type ReactNode,
} from "react";
import { getSellerProfile } from "@/lib/data/service";

/**
 * Phase 5.11: SellerContext Provider
 *
 * Previously, Topbar (and settings/automation pages) each called getSellerProfile()
 * independently on mount. Every dashboard navigation triggered a new DB query.
 *
 * Now: Single fetch at the provider level, cached for the session.
 * Components consume context instead of calling the API directly.
 */

interface SellerProfile {
	id: string;
	email: string;
	full_name: string | null;
	business_name: string | null;
	phone: string | null;
	onboarding_completed: boolean;
	plan: string;
	slug: string | null;
	logo_url: string | null;
	currency: string;
	locale: string;
}

interface SellerContextValue {
	profile: SellerProfile | null;
	loading: boolean;
	error: string | null;
	/** Force a refetch (e.g., after profile update) */
	refetch: () => Promise<void>;
	/** Display name: business_name > full_name > email prefix */
	displayName: string;
	/** Initials for avatar */
	initials: string;
}

const SellerContext = createContext<SellerContextValue>({
	profile: null,
	loading: true,
	error: null,
	refetch: async () => {},
	displayName: "",
	initials: "U",
});

export function SellerProvider({ children }: { children: ReactNode }) {
	const [profile, setProfile] = useState<SellerProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchProfile = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const p = await getSellerProfile();
			setProfile(p as SellerProfile | null);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchProfile();
	}, [fetchProfile]);

	const displayName =
		profile?.business_name ||
		profile?.full_name ||
		(profile?.email ? profile.email.split("@")[0] : "");

	const initials = displayName
		? displayName
				.split(" ")
				.map((w) => w[0])
				.slice(0, 2)
				.join("")
				.toUpperCase()
		: "U";

	return (
		<SellerContext.Provider
			value={{
				profile,
				loading,
				error,
				refetch: fetchProfile,
				displayName,
				initials,
			}}
		>
			{children}
		</SellerContext.Provider>
	);
}

export function useSeller() {
	return useContext(SellerContext);
}
