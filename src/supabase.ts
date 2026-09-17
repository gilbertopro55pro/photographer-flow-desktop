import { createClient } from "@supabase/supabase-js";

// Same project as the web app (photographer-flow) — this desktop app is a second client against
// the same backend, not a separate data store. The anon key is the public, client-safe key (RLS
// still applies per-photographer), same as what ships in the web app's own client bundle.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
