import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const validSupabaseUrl =
  typeof supabaseUrl === "string" && /^https:\/\/[^/]+$/.test(supabaseUrl);

export const supabaseConfigError =
  !supabaseUrl || !publishableKey
    ? "Supabase browser environment variables are not configured."
    : !validSupabaseUrl
      ? "NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS origin."
      : "";

export const supabase = createClient(
  supabaseUrl || "https://example.supabase.co",
  publishableKey || "missing-publishable-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
