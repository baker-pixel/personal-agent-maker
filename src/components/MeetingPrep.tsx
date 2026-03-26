import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import {
  CalendarClock,
  RefreshCw,
  Users,
  MapPin,
  Mail,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Sparkles,
  Send,
} from "lucide-react";

interface Attendee {
  email: string;
  displayName?: string;
  responseStatus: string;
}

interface RelatedEmail {
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

interface Meeting {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  location: string;
  attendees: Attendee[];
  htmlLink: string;
  relatedEmails: RelatedEmail[];
  prep: string;
  error: boolean;
}

export const MeetingPrep = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [emailsExpandedId, setEmailsExpandedId] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchPrep = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Please sign in to view meeting prep.");
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("meeting-prep", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setMeetings(data.meetings || []);
      setFetched(true);
      if (data.meetings?.length > 0) {
        setExpandedId(data.meetings[0].id);
      }
      const totalActions = (data.meetings || []).reduce((sum: number, m: any) => sum + (m.actionItemsCreated || 0), 0);
      if (totalActions > 0) {
        toast({
          title: `${totalActions} action item${totalActions > 1 ? "s" : ""} created`,
          description: "Extracted from your meeting prep",
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch meeting prep");
    } finally {
      setLoading(false);
    }
  };

  const emailSummary = async (meeting: Meeting) => {
    setSendingId(meeting.id);
    const attendeeEmails = meeting.attendees
      .map((a) => a.email)
      .filter((e) => e && !e.includes("calendar.google.com"))
      .join(", ");

    const { data, error: err } = await supabase.functions.invoke("draft-followup", {
      body: {
        type: "meeting_summary",
        meetingSummary: meeting.summary,
        meetingAttendees: attendeeEmails,
      },
    });

    if (err || data?.error) {
      toast({ title: "Failed to draft", description: data?.error || "Something went wrong", variant: "destructive" });
    } else {
      toast({
        title: `${data.draftsCreated || 1} draft${(data.draftsCreated || 1) > 1 ? "s" : ""} created`,
        description: "Check your Inbox to review and send",
      });
    }
    setSendingId(null);
  };

    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted": return "bg-success/10 text-success border-success/20";
      case "declined": return "bg-destructive/10 text-destructive border-destructive/20";
      case "tentative": return "bg-warning/10 text-warning border-warning/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Meeting Prep
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered prep cards with email context and talking points
          </p>
        </div>
        <Button onClick={fetchPrep} disabled={loading} variant="outline" className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {fetched ? "Refresh" : "Load Prep"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!fetched && !loading && (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <CalendarClock className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <div>
              <p className="text-foreground font-medium">Ready to prep for today's meetings</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Load Prep" to analyze your calendar and email threads
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {fetched && meetings.length === 0 && !loading && (
        <Card>
          <CardContent className="p-12 text-center space-y-2">
            <CalendarClock className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <p className="text-foreground font-medium">No meetings with attendees today</p>
            <p className="text-sm text-muted-foreground">Enjoy the focus time!</p>
          </CardContent>
        </Card>
      )}

      {/* Meeting Cards */}
      <div className="space-y-4">
        {meetings.map((meeting) => {
          const isExpanded = expandedId === meeting.id;
          const isEmailsExpanded = emailsExpandedId === meeting.id;

          return (
            <Card key={meeting.id} className="overflow-hidden transition-all">
              {/* Meeting Header */}
              <CardHeader
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {meeting.summary}
                      {meeting.error && <Badge variant="destructive" className="text-xs">Error</Badge>}
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" />
                        {formatTime(meeting.start)} – {formatTime(meeting.end)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {meeting.attendees.length} attendee{meeting.attendees.length !== 1 ? "s" : ""}
                      </span>
                      {meeting.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {meeting.location}
                        </span>
                      )}
                      {meeting.relatedEmails.length > 0 && (
                        <span className="flex items-center gap-1 text-primary">
                          <Mail className="w-3.5 h-3.5" />
                          {meeting.relatedEmails.length} related email{meeting.relatedEmails.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {meeting.htmlLink && (
                      <a
                        href={meeting.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Attendee badges */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {meeting.attendees.slice(0, 6).map((a, i) => (
                    <Badge key={i} variant="outline" className={`text-xs ${getStatusColor(a.responseStatus)}`}>
                      {a.displayName || a.email.split("@")[0]}
                    </Badge>
                  ))}
                  {meeting.attendees.length > 6 && (
                    <Badge variant="outline" className="text-xs">+{meeting.attendees.length - 6} more</Badge>
                  )}
                </div>
              </CardHeader>

              {/* Expanded Content */}
              {isExpanded && (
                <CardContent className="space-y-4 border-t border-border pt-4">
                  {/* AI Prep */}
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{meeting.prep}</ReactMarkdown>
                  </div>

                  {/* Related Emails */}
                  {meeting.relatedEmails.length > 0 && (
                    <div className="border-t border-border pt-4">
                      <button
                        onClick={() => setEmailsExpandedId(isEmailsExpanded ? null : meeting.id)}
                        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                      >
                        <Mail className="w-4 h-4" />
                        Related Email Threads ({meeting.relatedEmails.length})
                        {isEmailsExpanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                      </button>
                      {isEmailsExpanded && (
                        <div className="mt-3 space-y-2">
                          {meeting.relatedEmails.map((email, i) => (
                            <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border text-sm">
                              <div className="font-medium text-foreground">{email.subject || "(No subject)"}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {email.from} · {email.date}
                              </div>
                              <div className="text-muted-foreground mt-1 text-xs line-clamp-2">{email.snippet}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
