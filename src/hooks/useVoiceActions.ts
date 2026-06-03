// @ts-nocheck
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const CONFIRM_REGEX = /\bconfirm\b/i;

export function withLocalTz(isoStr: string): string {
  if (!isoStr || isoStr.includes("Z") || isoStr.includes("+") || /T.*-\d\d:\d\d$/.test(isoStr)) return isoStr;
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const m = String(Math.abs(off) % 60).padStart(2, "0");
  return `${isoStr}${sign}${h}:${m}`;
}

type VoiceAction =
  | { type: "calendar-create"; data: any }
  | { type: "calendar-update"; data: any }
  | { type: "calendar-cancel"; data: any }
  | { type: "email"; data: any }
  | { type: "contact"; data: any };

interface Opts {
  messages: Array<{ role: string; text: string }>;
  injectAgentMessage: (text: string) => void;
}

export function useVoiceActions({ messages, injectAgentMessage }: Opts) {
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());
  const executingRef = useRef(false);

  const pendingVoiceAction = useMemo((): VoiceAction | null => {
    const lastAgent = [...messages].reverse().find((m) => m.role === "agent");
    if (!lastAgent) return null;
    const t = lastAgent.text;

    const tryParse = (regex: RegExp): any | null => {
      const m = regex.exec(t);
      if (!m) return null;
      try { return JSON.parse(m[1].trim()); } catch { return null; }
    };

    const cal = tryParse(/```calendar-json\s*\n([\s\S]*?)\n```/);
    if (cal && !confirmedKeys.has(JSON.stringify(cal))) return { type: "calendar-create", data: cal };

    const upd = tryParse(/```update-event-json\s*\n([\s\S]*?)\n```/);
    if (upd && !confirmedKeys.has(JSON.stringify(upd))) return { type: "calendar-update", data: upd };

    const can = tryParse(/```cancel-event-json\s*\n([\s\S]*?)\n```/);
    if (can && !confirmedKeys.has(JSON.stringify(can))) return { type: "calendar-cancel", data: can };

    const draft = tryParse(/```draft-json\s*\n([\s\S]*?)\n```/);
    if (draft && !confirmedKeys.has(JSON.stringify(draft))) return { type: "email", data: draft };

    const contact = tryParse(/```contact-json\s*\n([\s\S]*?)\n```/);
    if (contact && !confirmedKeys.has(JSON.stringify(contact))) return { type: "contact", data: contact };

    return null;
  }, [messages, confirmedKeys]);

  const executeVoiceAction = async (action: VoiceAction) => {
    if (executingRef.current) return;
    executingRef.current = true;
    const actionKey = JSON.stringify(action.data);
    setConfirmedKeys((prev) => new Set(prev).add(actionKey));

    try {
      if (action.type === "calendar-create") {
        const d = action.data;
        const { error } = await supabase.functions.invoke("calendar-event-create", {
          body: {
            summary: d.summary,
            start: d.allDay ? d.start : withLocalTz(d.start),
            end: d.end ? (d.allDay ? d.end : withLocalTz(d.end)) : undefined,
            description: d.description,
            location: d.location,
            allDay: d.allDay ?? false,
            attendees: d.attendees ?? [],
          },
        });
        if (error) throw error;
        injectAgentMessage(`Done — "${d.summary}" is on your calendar. Anything else?`);

      } else if (action.type === "calendar-update") {
        const d = action.data;
        const { error } = await supabase.functions.invoke("calendar-event-update", {
          body: {
            eventId: d.eventId,
            summary: d.summary,
            start: d.start ? (d.allDay ? d.start : withLocalTz(d.start)) : undefined,
            end: d.end ? (d.allDay ? d.end : withLocalTz(d.end)) : undefined,
            description: d.description,
            location: d.location,
            allDay: d.allDay,
            attendees: d.attendees,
            notifyAttendees: d.notifyAttendees ?? true,
          },
        });
        if (error) throw error;
        injectAgentMessage(`Done — "${d.summary}" has been updated. Anything else?`);

      } else if (action.type === "calendar-cancel") {
        const d = action.data;
        const { error } = await supabase.functions.invoke("calendar-event-delete", {
          body: { eventId: d.eventId, notifyAttendees: d.notifyAttendees ?? true },
        });
        if (error) throw error;
        injectAgentMessage(`Done — "${d.summary}" has been cancelled. Anything else?`);

      } else if (action.type === "email") {
        const d = action.data;
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            to: d.to_name ? `${d.to_name} <${d.to_email}>` : d.to_email,
            subject: d.subject,
            emailBody: d.body,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Send failed");
        }
        injectAgentMessage(`Done — email to ${d.to_name || d.to_email} sent. Anything else?`);

      } else if (action.type === "contact") {
        const d = action.data;
        const { data: result, error } = await supabase.functions.invoke("contact-create", { body: d });
        if (error) throw error;
        injectAgentMessage(
          result?.code === "DUPLICATE" || result?.code === "DUPLICATE_NAME"
            ? `${d.name} is already in your contacts. Anything else?`
            : `Done — ${d.name} has been saved to your contacts. Anything else?`
        );
      }
    } catch (e: any) {
      const msg: string = e?.message || "Something went wrong";
      const isDisconnected = /NOT_CONNECTED|RECONNECT|not connected/i.test(msg);
      injectAgentMessage(
        isDisconnected
          ? "I couldn't do that — your account isn't connected. Go to Settings to reconnect."
          : `Sorry, that didn't work — ${msg}. Want me to try again?`
      );
      setConfirmedKeys((prev) => { const s = new Set(prev); s.delete(actionKey); return s; });
    } finally {
      executingRef.current = false;
    }
  };

  const resetActions = () => {
    setConfirmedKeys(new Set());
    executingRef.current = false;
  };

  return { pendingVoiceAction, executeVoiceAction, resetActions };
}
