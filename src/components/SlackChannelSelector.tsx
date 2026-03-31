import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Hash, Lock, Loader2, Check, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
}

export const SlackChannelSelector = () => {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  // Load saved preference
  useEffect(() => {
    const loadPreference = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_preferences")
        .select("slack_notification_channel_id, slack_notification_channel_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.slack_notification_channel_id) {
        setSelectedId(data.slack_notification_channel_id);
        setSelectedName(data.slack_notification_channel_name);
        setSavedId(data.slack_notification_channel_id);
      }
    };
    loadPreference();
  }, []);

  const fetchChannels = useCallback(async () => {
    if (channels.length > 0) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("slack-channels");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setChannels(data.channels ?? []);
    } catch (err: any) {
      toast({
        title: "Failed to load channels",
        description: err.message || "Could not fetch Slack channels",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [channels.length, toast]);

  const handleSelect = async (channel: SlackChannel) => {
    setSelectedId(channel.id);
    setSelectedName(channel.name);
    setOpen(false);
    setSearch("");

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_preferences")
        .update({
          slack_notification_channel_id: channel.id,
          slack_notification_channel_name: channel.name,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      setSavedId(channel.id);
      toast({
        title: "Slack channel saved",
        description: `Notifications will be sent to #${channel.name}`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to save",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const filtered = channels.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wider">
        Notification channel
      </h4>
      <p className="text-xs text-muted-foreground mb-3">
        Choose a Slack channel to receive notifications from your assistant.
      </p>

      <div className="relative">
        <button
          onClick={() => {
            setOpen(!open);
            if (!open) fetchChannels();
          }}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-muted/50 border border-border/60 text-sm text-foreground hover:bg-muted/70 transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            {selectedName ? (
              <>
                <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{selectedName}</span>
                {savedId === selectedId && !saving && (
                  <Check className="w-3.5 h-3.5 text-success shrink-0" />
                )}
                {saving && (
                  <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Select a channel…</span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border/60 rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 border-b border-border/40">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search channels…"
                className="w-full px-3 py-2 text-sm bg-muted/50 rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-accent/30 text-foreground placeholder:text-muted-foreground/50"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {channels.length === 0 ? "No channels found" : "No matching channels"}
                </p>
              ) : (
                filtered.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => handleSelect(ch)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors ${
                      selectedId === ch.id ? "bg-accent/10 text-accent" : "text-foreground"
                    }`}
                  >
                    {ch.is_private ? (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">{ch.name}</span>
                    {selectedId === ch.id && (
                      <Check className="w-3.5 h-3.5 text-accent ml-auto shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
