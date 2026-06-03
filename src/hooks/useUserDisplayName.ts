import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves what the agent should call the user.
 * Priority: user_preferences.user_display_name → auth metadata name → email handle.
 */
export function useUserDisplayName(): string {
  const [name, setName] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("user_display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (prefs?.user_display_name?.trim()) {
        setName(prefs.user_display_name.trim());
        return;
      }

      const meta = (user.user_metadata ?? {}) as Record<string, string>;
      const raw =
        meta.first_name ||
        meta.given_name ||
        meta.full_name ||
        meta.name ||
        (user.email ? user.email.split("@")[0] : "");
      const first = String(raw).trim().split(/\s+/)[0] || "";
      setName(first ? first.charAt(0).toUpperCase() + first.slice(1) : "");
    })();
  }, []);

  return name;
}
