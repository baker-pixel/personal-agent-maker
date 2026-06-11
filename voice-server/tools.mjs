// Agent tool definitions in Nova Sonic toolSpec format.
// Mirrors TEXT_TOOLS in supabase/functions/chat/index.ts — keep names and
// schemas in sync so voice and text agents behave identically.
const schema = (properties, required) => JSON.stringify({ type: "object", properties, required });

export const SONIC_TOOLS = [
  {
    toolSpec: {
      name: "confirm_action",
      description: "Execute the pending action after the user explicitly said confirm (or yes / send it / go ahead). Only call this AFTER the user has spoken their confirmation — never preemptively.",
      inputSchema: { json: schema({}, []) },
    },
  },
  {
    toolSpec: {
      name: "cancel_action",
      description: "Discard the pending action because the user declined or asked to cancel.",
      inputSchema: { json: schema({}, []) },
    },
  },
  {
    toolSpec: {
      name: "send_email",
      description: "Stage an email for sending. It is NOT sent until the user says confirm. Use a recipient address ONLY from CONTACTS — if unknown, ask the user for it first, never guess.",
      inputSchema: {
        json: schema({
          to_email: { type: "string", description: "Recipient email address from CONTACTS or as given by the user" },
          to_name: { type: "string", description: "Recipient display name (optional)" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body in plain text" },
        }, ["to_email", "subject", "body"]),
      },
    },
  },
  {
    toolSpec: {
      name: "create_calendar_event",
      description: "Create a new event on the user's calendar and send invites to attendees.",
      inputSchema: {
        json: schema({
          summary: { type: "string", description: "Event title" },
          start: { type: "string", description: "ISO 8601 datetime in user's local timezone e.g. 2026-06-10T14:00:00" },
          end: { type: "string", description: "ISO 8601 datetime. Defaults to 1 hour after start if omitted." },
          description: { type: "string", description: "Event notes (optional)" },
          location: { type: "string", description: "Event location (optional)" },
          allDay: { type: "boolean", description: "True for all-day events (use date-only strings for start/end)" },
          attendees: {
            type: "array",
            description: "Attendees to invite",
            items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] },
          },
        }, ["summary", "start"]),
      },
    },
  },
  {
    toolSpec: {
      name: "update_calendar_event",
      description: "Update an existing calendar event. Only use eventId values from the CALENDAR list in your instructions.",
      inputSchema: {
        json: schema({
          eventId: { type: "string", description: "Event ID from the CALENDAR list" },
          summary: { type: "string", description: "Event title — required even if unchanged" },
          start: { type: "string", description: "New ISO 8601 start datetime (optional)" },
          end: { type: "string", description: "New ISO 8601 end datetime (optional)" },
          description: { type: "string", description: "Updated notes (optional)" },
          location: { type: "string", description: "Updated location (optional)" },
          attendees: {
            type: "array",
            description: "Replacement attendee list (optional)",
            items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] },
          },
          notifyAttendees: { type: "boolean", description: "Send update emails to attendees (default true)" },
        }, ["eventId", "summary"]),
      },
    },
  },
  {
    toolSpec: {
      name: "delete_calendar_event",
      description: "Cancel and delete a calendar event. Only use eventId values from the CALENDAR list.",
      inputSchema: {
        json: schema({
          eventId: { type: "string", description: "Event ID from the CALENDAR list" },
          summary: { type: "string", description: "Event title for confirmation message" },
          notifyAttendees: { type: "boolean", description: "Send cancellation emails to attendees (default true)" },
        }, ["eventId", "summary"]),
      },
    },
  },
  {
    toolSpec: {
      name: "create_task",
      description: "Create a new action item / task for the user.",
      inputSchema: {
        json: schema({
          title: { type: "string", description: "Short task title" },
          description: { type: "string", description: "Details or context (optional)" },
          priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level (default medium)" },
          due_date: { type: "string", description: "ISO 8601 date e.g. 2026-06-10 (optional)" },
        }, ["title"]),
      },
    },
  },
  {
    toolSpec: {
      name: "save_contact",
      description: "Save a new contact to the user's contact list.",
      inputSchema: {
        json: schema({
          name: { type: "string", description: "Full name" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number (optional)" },
          company: { type: "string", description: "Company name (optional)" },
          role: { type: "string", description: "Job title (optional)" },
          is_vip: { type: "boolean", description: "Mark as VIP (default false)" },
        }, ["name"]),
      },
    },
  },
  {
    toolSpec: {
      name: "delete_email",
      description: "Move an email to trash. Only use messageId values from the INBOX list — never invent one.",
      inputSchema: {
        json: schema({
          messageId: { type: "string", description: "Message ID from the INBOX list" },
          subject: { type: "string", description: "Email subject for confirmation message" },
        }, ["messageId", "subject"]),
      },
    },
  },
  {
    toolSpec: {
      name: "delete_contact",
      description: "Permanently delete a contact. Only use contactId from the CONTACTS list — never invent one.",
      inputSchema: {
        json: schema({
          contactId: { type: "string", description: "Contact ID from the CONTACTS list" },
          name: { type: "string", description: "Contact name for confirmation message" },
        }, ["contactId", "name"]),
      },
    },
  },
];
