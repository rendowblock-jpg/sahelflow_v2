/**
 * SahelFlow Storage Service
 * Image upload and data cleanup.
 */

import { getSupabase } from "./supabase-helpers";
import { getCurrentUser } from "./auth-service";

// ===== IMAGE UPLOAD =====

// S16 fix: Validate uploaded images before storing.
// Limits: max 5 MB, image MIME types only, extension must match an allowlist.
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const ALLOWED_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];

export async function uploadProductImage(file: File): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // S16 fix: Size validation — reject oversized uploads (was unbounded).
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(
      `Image too large: ${file.size} bytes (max ${MAX_IMAGE_SIZE} bytes / 5 MB)`,
    );
  }

  // S16 fix: MIME type validation — reject non-image uploads.
  // An attacker could rename a .exe to .jpg and upload it; without this check
  // it would be stored and served as a public URL.
  if (!file.type || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Invalid file type: "${file.type}". Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
    );
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  // S16 fix: Extension allowlist — defense in depth alongside MIME check.
  if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
    throw new Error(
      `Invalid file extension: ".${ext}". Allowed: ${ALLOWED_IMAGE_EXTS.join(", ")}`,
    );
  }

  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error } = await getSupabase().storage
    .from("product-images")
    .upload(path, file, {
      upsert: true,
      contentType: file.type, // Ensure stored Content-Type matches validated MIME
    });
  if (error) throw error;
  const { data } = getSupabase().storage
    .from("product-images")
    .getPublicUrl(path);
  return data.publicUrl;
}

// ===== DANGER ZONE =====

export async function clearTestData(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { data: seller } = await getSupabase()
    .from("sellers")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!seller) {
    throw new Error("Forbidden: Only organization owners can clear test data.");
  }
  
  // Because of foreign keys, delete in specific order
  // Deliveries -> Agent Activity -> Messages -> Conversations -> Orders -> Customers
  
  // 1. Deliveries (if tracked)
  await getSupabase().from('deliveries').delete().eq('seller_id', user.id);
  
  // 2. Agent Activity
  await getSupabase().from('agent_activity').delete().eq('seller_id', user.id);
  
  // 3. Messages & Conversations
  // NOTE: `messages` has no seller_id column (it links to sellers via conversations).
  // Fetch the seller's conversation IDs first, then delete messages by conversation_id.
  const { data: sellerConversations } = await getSupabase()
    .from('conversations')
    .select('id')
    .eq('seller_id', user.id);
  const conversationIds = (sellerConversations || []).map((c) => c.id);
  if (conversationIds.length > 0) {
    await getSupabase()
      .from('messages')
      .delete()
      .in('conversation_id', conversationIds);
  }
  await getSupabase().from('conversations').delete().eq('seller_id', user.id);
  
  // 4. Orders
  await getSupabase().from('orders').delete().eq('seller_id', user.id);
  
  // 5. Customers
  await getSupabase().from('customers').delete().eq('seller_id', user.id);

  // W18 fix: Previously missing — returns, expenses, and automations were not
  // deleted, causing FK violations if any existed. Now cleaned up properly.
  await getSupabase().from('returns').delete().eq('seller_id', user.id);
  await getSupabase().from('expenses').delete().eq('seller_id', user.id);
  await getSupabase().from('automations').delete().eq('seller_id', user.id);
  await getSupabase().from('ai_chat_sessions').delete().eq('seller_id', user.id);
  await getSupabase().from('whatsapp_templates').delete().eq('seller_id', user.id);
  await getSupabase().from('notifications').delete().eq('seller_id', user.id);
}
