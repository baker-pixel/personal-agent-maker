import { useMemo } from "react";
import { useDraftActions } from "@/hooks/useDraftActions";
import { toast } from "@/hooks/use-toast";
import { Save, Check } from "lucide-react";
import { useState } from "react";

interface DraftData {
  to_email: string;
  to_name?: string;
  subject: string;
  body: string;
}

/**
 * Parses agent message text and renders "Save to Inbox" buttons
 * for any ```draft-json blocks found.
 */
export function DraftJsonParser({ text }: { text: string }) {
  const { saveDraft } = useDraftActions();
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());

  const drafts = useMemo(() => {
    const results: DraftData[] = [];
    const regex = /```draft-json\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.to_email && parsed.subject && parsed.body) {
          results.push(parsed);
        }
      } catch {
        // skip malformed
      }
    }
    return results;
  }, [text]);

  if (drafts.length === 0) return null;

  const handleSave = async (draft: DraftData, index: number) => {
    const result = await saveDraft({
      to_email: draft.to_email,
      to_name: draft.to_name,
      subject: draft.subject,
      body: draft.body,
    });
    if (result) {
      setSavedIndices((prev) => new Set(prev).add(index));
      toast({ title: "Draft saved", description: `Reply to ${draft.to_name || draft.to_email} queued in Approval Inbox` });
    } else {
      toast({ title: "Error", description: "Could not save draft. Are you signed in?", variant: "destructive" });
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {drafts.map((draft, i) => (
        <button
          key={i}
          onClick={() => handleSave(draft, i)}
          disabled={savedIndices.has(i)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-default"
        >
          {savedIndices.has(i) ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Saved to Inbox
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              Save draft to {draft.to_name || draft.to_email}
            </>
          )}
        </button>
      ))}
    </div>
  );
}
