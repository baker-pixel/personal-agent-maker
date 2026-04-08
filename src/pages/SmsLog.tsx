import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Smartphone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import AppMenu from "@/components/AppMenu";

interface SmsMessage {
  role: string;
  content: string;
}

interface SmsConversation {
  id: string;
  phone_number: string;
  messages: SmsMessage[];
  updated_at: string;
}

export default function SmsLog() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("sms_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (!error && data) {
        setConversations(data.map((c: any) => ({
          id: c.id,
          phone_number: c.phone_number,
          messages: (c.messages as SmsMessage[]) || [],
          updated_at: c.updated_at,
        })));
      }
      setLoading(false);
    };

    fetchConversations();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <button
            onClick={() => navigate("/office")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <h1 className="font-display font-semibold">{agentName} SMS Log</h1>
          <AppMenu />
        </div>
      </nav>

      <div className="container py-8 max-w-lg space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Text {agentName} at <span className="font-mono font-semibold text-foreground">+1 (844) 392-6449</span>
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">📱</p>
            <p className="font-display font-semibold text-foreground mb-1">No SMS conversations yet</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Save your phone number in Settings, then text {agentName} at the number above to get started.
            </p>
          </div>
        )}

        {!loading && conversations.map((convo) => (
          <div key={convo.id} className="border rounded-2xl overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b flex items-center justify-between">
              <span className="text-sm font-medium font-mono">{convo.phone_number}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(convo.updated_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {convo.messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No messages yet</p>
              )}
              {convo.messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
