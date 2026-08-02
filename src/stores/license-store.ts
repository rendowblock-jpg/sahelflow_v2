import { create } from "zustand";

export type LicenseClientStatus =
  | "valid"
  | "missing"
  | "unavailable"
  | "invalid"
  | "expired"
  | "clock_rollback"
  | "device_mismatch"
  | "installation_mismatch"
  | "workspace_mismatch"
  | "product_mismatch"
  | "revoked"
  | "transfer_required";

export type LicenseClientProjection = Readonly<{
  status: LicenseClientStatus;
  message: string;
  licenseId: string | null;
  type: "trial" | "extension" | "permanent" | null;
  expiresAt: string | null;
  supportEndsAt: string | null;
  shopSlots: number;
  memberLimit: number;
  deviceLimit: number;
  features: readonly string[];
  minimumPermanentRecoveryEpoch: number | null;
}>;

type LicenseState = {
  projection: LicenseClientProjection | null;
  isLoading: boolean;
  error: string | null;
  setProjection: (projection: LicenseClientProjection) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

export const useLicenseStore = create<LicenseState>((set) => ({
  projection: null,
  isLoading: true,
  error: null,
  setProjection: (projection) => set({ projection, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
