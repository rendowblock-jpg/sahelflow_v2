/**
 * License store — client-side license state.
 *
 * In dev: uses localStorage (not secure, just for testing)
 * In production (Tauri): will use OS keychain via Tauri API
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SignedLicense, LicenseValidationResult } from "@/lib/license/types";

interface LicenseState {
  /** The stored license (null if none) */
  license: SignedLicense | null;
  /** The last validation result */
  validation: LicenseValidationResult | null;
  /** Whether the license has been checked on this session */
  hasChecked: boolean;

  setLicense: (license: SignedLicense | null) => void;
  setValidation: (result: LicenseValidationResult | null) => void;
  setHasChecked: (checked: boolean) => void;
  clear: () => void;
}

const LICENSE_STORAGE_KEY = "sahelflow-license";

export const useLicenseStore = create<LicenseState>()(
  persist(
    (set) => ({
      license: null,
      validation: null,
      hasChecked: false,

      setLicense: (license) => set({ license }),
      setValidation: (result) => set({ validation: result }),
      setHasChecked: (checked) => set({ hasChecked: checked }),
      clear: () => set({ license: null, validation: null, hasChecked: false }),
    }),
    {
      name: LICENSE_STORAGE_KEY,
      // Only persist the license itself, not the validation result
      partialize: (state) => ({ license: state.license }),
    },
  ),
);
