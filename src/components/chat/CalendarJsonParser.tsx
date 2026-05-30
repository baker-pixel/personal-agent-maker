import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarPlus, CalendarX, CalendarClock, Check, ExternalLink, Loader2 } from "lucide-react";

interface Attendee {
  email: string;
  name?: string;
}

interface CalendarEventData {
  summary: string;
  start: string;
  end?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  attendees?: Attendee[];
}

interface UpdateEventData {
  eventId: string;
  summary: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  attendees?: Attendee[];
  notifyAttendees?: boolean;
}

interface CancelEventData {
  eventId: string;
  summary: string;
  notifyAttendees?: boolean;
}

// supabase.functions.invoke returns FunctionsHttpError on non-2xx.
// The actual response body is in error.context (a Response object) — not error.message.
async function extractErrMsg(e: any): Promise<string> {
  // Try to read the actual JSON body from the response context
  if (e?.context && typeof e.context.json === "function") {
    try {
      const body = await e.context.json();
      return body?.error || body?.message || e.message || "Unknown error";
    } catch { /* fall through */ }
  }
  // Fallback: try parsing message as JSON (older supabase-js versions)
  const raw: string = e?.message || e?.error || "Unknown error";
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error || parsed?.message || raw;
  } catch {
    return raw;
  }
}

// Append local UTC offset to bare ISO datetime strings so Deno (UTC) interprets them correctly.
function withLocalTz(isoStr: string): string {
  if (!isoStr || isoStr.includes("Z") || isoStr.includes("+") || /T.*-\d\d:\d\d$/.test(isoStr)) return isoStr;
  const offsetMins = -new Date().getTimezoneOffset();
  const sign = offsetMins >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(offsetMins) / 60)).padStart(2, "0");
  const m = String(Math.abs(offsetMins) % 60).padStart(2, "0");
  return `${isoStr}${sign}${h}:${m}`;
}

function parseBlocks<T>(text: string, tag: string, validate: (p: any) => boolean): T[] {
  const results: T[] = [];
  const regex = new RegExp("```" + tag + "\\s*\\n([\\s\\S]*?)\\n```", "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (validate(parsed)) results.push(parsed as T);
    } catch { /* skip malformed */ }
  }
  return results;
}

export function CalendarJsonParser({ text }: { text: string }) {
  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());
  const [updatedIndices, setUpdatedIndices] = useState<Set<number>>(new Set());
  const [cancelledIndices, setCancelledIndices] = useState<Set<number>>(new Set());
  const [loadingAdd, setLoadingAdd] = useState<Set<number>>(new Set());
  const [loadingUpdate, setLoadingUpdate] = useState<Set<number>>(new Set());
  const [loadingCancel, setLoadingCancel] = useState<Set<number>>(new Set());
  const [eventLinks, setEventLinks] = useState<Record<string, string>>({});

  const { creates, updates, cancels } = useMemo(() => ({
    creates: parseBlocks<CalendarEventData>(text, "calendar-json", (p) => !!(p.summary && p.start)),
    updates: parseBlocks<UpdateEventData>(text, "update-event-json", (p) => !!(p.eventId && p.summary)),
    cancels: parseBlocks<CancelEventData>(text, "cancel-event-json", (p) => !!(p.eventId && p.summary)),
  }), [text]);

  if (creates.length === 0 && updates.length === 0 && cancels.length === 0) return null;

  const handleAdd = async (event: CalendarEventData, index: number) => {
    setLoadingAdd((prev) => new Set(prev).add(index));
    try {
      const { data, error } = await supabase.functions.invoke("calendar-event-create", {
        body: {
          summary: event.summary,
          start: event.allDay ? event.start : withLocalTz(event.start),
          end: event.end ? (event.allDay ? event.end : withLocalTz(event.end)) : undefined,
          description: event.description,
          location: event.location,
          allDay: event.allDay ?? false,
          attendees: event.attendees ?? [],
        },
      });
      if (error) throw error;
      const link: string | undefined = data?.event?.htmlLink;
      const invited: Attendee[] = event.attendees ?? [];
      setAddedIndices((prev) => new Set(prev).add(index));
      if (link) setEventLinks((prev) => ({ ...prev, [`create-${index}`]: link }));
      const inviteNote = invited.length > 0
        ? ` · invite sent to ${invited.map((a) => a.name || a.email).join(", ")}`
        : "";
      toast.success(`"${event.summary}" added to Google Calendar${inviteNote}`, {
        action: link ? { label: "Open", onClick: () => window.open(link, "_blank") } : undefined,
      });
    } catch (e: any) {
      const msg = await extractErrMsg(e);
      if (msg.includes("NOT_CONNECTED") || msg.includes("RECONNECT") || msg.includes("expired")) {
        toast.error("Calendar not connected — reconnect via Integrations.");
      } else {
        toast.error(`Failed to create event: ${msg}`);
      }
    } finally {
      setLoadingAdd((prev) => { const s = new Set(prev); s.delete(index); return s; });
    }
  };

  const handleUpdate = async (event: UpdateEventData, index: number) => {
    setLoadingUpdate((prev) => new Set(prev).add(index));
    try {
      const { data, error } = await supabase.functions.invoke("calendar-event-update", {
        body: {
          eventId: event.eventId,
          summary: event.summary,
          start: event.start ? (event.allDay ? event.start : withLocalTz(event.start)) : undefined,
          end: event.end ? (event.allDay ? event.end : withLocalTz(event.end)) : undefined,
          description: event.description,
          location: event.location,
          allDay: event.allDay,
          attendees: event.attendees,
          notifyAttendees: event.notifyAttendees ?? true,
        },
      });
      if (error) throw error;
      const link: string | undefined = data?.event?.htmlLink;
      setUpdatedIndices((prev) => new Set(prev).add(index));
      if (link) setEventLinks((prev) => ({ ...prev, [`update-${index}`]: link }));
      toast.success(`"${event.summary}" updated on Google Calendar`, {
        action: link ? { label: "Open", onClick: () => window.open(link, "_blank") } : undefined,
      });
    } catch (e: any) {
      const msg = await extractErrMsg(e);
      if (msg.includes("NOT_CONNECTED") || msg.includes("RECONNECT") || msg.includes("expired")) {
        toast.error("Calendar not connected — reconnect via Integrations.");
      } else if (msg.toLowerCase().includes("not found") || msg.includes("404")) {
        toast.error("Event not found — it may have been deleted.");
      } else {
        toast.error(`Failed to update event: ${msg}`);
      }
    } finally {
      setLoadingUpdate((prev) => { const s = new Set(prev); s.delete(index); return s; });
    }
  };

  const handleCancel = async (event: CancelEventData, index: number) => {
    setLoadingCancel((prev) => new Set(prev).add(index));
    try {
      const { error } = await supabase.functions.invoke("calendar-event-delete", {
        body: {
          eventId: event.eventId,
          notifyAttendees: event.notifyAttendees ?? true,
        },
      });
      if (error) throw error;
      setCancelledIndices((prev) => new Set(prev).add(index));
      toast.success(`"${event.summary}" cancelled on Google Calendar${event.notifyAttendees !== false ? " · attendees notified" : ""}`);
    } catch (e: any) {
      const msg = await extractErrMsg(e);
      if (msg.includes("NOT_CONNECTED") || msg.includes("RECONNECT") || msg.includes("expired")) {
        toast.error("Calendar not connected — reconnect via Integrations.");
      } else if (msg.toLowerCase().includes("not found") || msg.includes("404") || msg.includes("already")) {
        toast.error("Event not found — it may already be deleted.");
      } else {
        toast.error(`Failed to cancel event: ${msg}`);
      }
    } finally {
      setLoadingCancel((prev) => { const s = new Set(prev); s.delete(index); return s; });
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {creates.map((event, i) => (
        <div key={`create-${i}`} className="flex items-center gap-2">
          <button
            onClick={() => handleAdd(event, i)}
            disabled={addedIndices.has(i) || loadingAdd.has(i)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-default"
          >
            {loadingAdd.has(i) ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding to Google Calendar…</>
            ) : addedIndices.has(i) ? (
              <><Check className="w-3.5 h-3.5" /> Added to Google Calendar</>
            ) : (
              <><CalendarPlus className="w-3.5 h-3.5" /> Add to Calendar: {event.summary}</>
            )}
          </button>
          {eventLinks[`create-${i}`] && (
            <a
              href={eventLinks[`create-${i}`]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Open in Google Calendar
            </a>
          )}
        </div>
      ))}

      {updates.map((event, i) => (
        <div key={`update-${i}`} className="flex items-center gap-2">
          <button
            onClick={() => handleUpdate(event, i)}
            disabled={updatedIndices.has(i) || loadingUpdate.has(i)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-default"
          >
            {loadingUpdate.has(i) ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…</>
            ) : updatedIndices.has(i) ? (
              <><Check className="w-3.5 h-3.5" /> Updated on Google Calendar</>
            ) : (
              <><CalendarClock className="w-3.5 h-3.5" /> Update Event: {event.summary}</>
            )}
          </button>
          {eventLinks[`update-${i}`] && (
            <a
              href={eventLinks[`update-${i}`]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-amber-500 hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Open in Google Calendar
            </a>
          )}
        </div>
      ))}

      {cancels.map((event, i) => (
        <button
          key={`cancel-${i}`}
          onClick={() => handleCancel(event, i)}
          disabled={cancelledIndices.has(i) || loadingCancel.has(i)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-default"
        >
          {loadingCancel.has(i) ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancelling on Google Calendar…</>
          ) : cancelledIndices.has(i) ? (
            <><Check className="w-3.5 h-3.5" /> Cancelled on Google Calendar</>
          ) : (
            <><CalendarX className="w-3.5 h-3.5" /> Cancel Event: {event.summary}</>
          )}
        </button>
      ))}
    </div>
  );
}
