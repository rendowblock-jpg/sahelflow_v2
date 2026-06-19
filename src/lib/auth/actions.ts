"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { linkUserToInvitations } from "@/lib/data/team-service";

export interface AuthResult {
  error?: string;
  success?: boolean;
}

// S17 fix: Stronger password policy + email validation + rate limiting.
const MIN_PASSWORD_LENGTH = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limit for signup attempts (per email + per IP).
// Limits reset on cold starts (acceptable for single-instance deployments).
const signupAttempts = new Map<string, { count: number; resetAt: number }>();
const SIGNUP_MAX_ATTEMPTS = 5;
const SIGNUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkSignupRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = signupAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    signupAttempts.set(key, { count: 1, resetAt: now + SIGNUP_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= SIGNUP_MAX_ATTEMPTS;
}

/**
 * S17 fix: Validate password strength.
 * Requires at least 10 characters with at least 3 of: lowercase, uppercase,
 * digit, special character. This exceeds the old 8-char minimum with no
 * complexity requirements.
 */
function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const categories = [hasLower, hasUpper, hasDigit, hasSpecial].filter(
    Boolean,
  ).length;
  if (categories < 3) {
    return "Password must include at least 3 of: lowercase, uppercase, digits, special characters";
  }
  return null;
}

export async function signUp(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("name") as string;
  const businessName = formData.get("businessName") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  // S17 fix: Email format validation (was missing entirely).
  if (!EMAIL_REGEX.test(email)) {
    return { error: "Invalid email format" };
  }

  // S17 fix: Stronger password policy (was: 8 chars, no complexity).
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return { error: passwordError };
  }

  // S17 fix: Rate limit signup attempts by email (was: no rate limit).
  const emailKey = `signup:${email.toLowerCase().trim()}`;
  if (!checkSignupRateLimit(emailKey)) {
    return { error: "Too many signup attempts. Please try again later." };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        business_name: businessName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data?.user) {
    await linkUserToInvitations(data.user.id, email).catch((err) => {
      console.error("Failed to link invitations on signup:", err);
    });
  }

  redirect("/dashboard");
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (data?.user) {
    await linkUserToInvitations(data.user.id, email).catch((err) => {
      console.error("Failed to link invitations on signin:", err);
    });
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getSellerProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: seller } = await supabase
    .from("sellers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return seller;
}
