export const VOICE_TOOLS = [
  {
    type: "function",
    name: "confirm_action",
    description: "Execute the staged action after the user explicitly confirmed. Only call after the user responds to your 'just say handle it' prompt.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "cancel_action",
    description: "Discard the pending action — user declined or cancelled.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "read_email",
    description: "Fetch full email text. Executes immediately, no confirmation. Use only messageId values from INBOX.",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string" },
      },
      required: ["messageId"],
    },
  },
  {
    type: "function",
    name: "send_email",
    description: "Stage an email for sending (not sent until confirmed). Use recipient email from CONTACTS only — never guess.",
    parameters: {
      type: "object",
      properties: {
        to_email: { type: "string" },
        to_name: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to_email", "subject", "body"],
    },
  },
  {
    type: "function",
    name: "create_calendar_event",
    description: "Stage a new calendar event (not created until confirmed).",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        start: { type: "string", description: "ISO 8601 in user's local tz, no Z or offset e.g. 2026-06-10T14:00:00" },
        end: { type: "string", description: "ISO 8601. Defaults to 1h after start." },
        description: { type: "string" },
        location: { type: "string" },
        allDay: { type: "boolean" },
        attendees: {
          type: "array",
          items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] },
        },
      },
      required: ["summary", "start"],
    },
  },
  {
    type: "function",
    name: "update_calendar_event",
    description: "Stage a calendar event update (not applied until confirmed). Use only eventId from CALENDAR list.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        summary: { type: "string", description: "Required even if unchanged" },
        start: { type: "string" },
        end: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        attendees: {
          type: "array",
          items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] },
        },
        notifyAttendees: { type: "boolean" },
      },
      required: ["eventId", "summary"],
    },
  },
  {
    type: "function",
    name: "delete_calendar_event",
    description: "Stage a calendar event deletion (not deleted until confirmed). Use only eventId from CALENDAR list.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        summary: { type: "string" },
        notifyAttendees: { type: "boolean" },
      },
      required: ["eventId", "summary"],
    },
  },
  {
    type: "function",
    name: "create_task",
    description: "Stage a new task (not saved until confirmed).",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        due_date: { type: "string", description: "ISO 8601 date e.g. 2026-06-10" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "save_contact",
    description: "Stage a new contact save (not saved until confirmed).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        company: { type: "string" },
        role: { type: "string" },
        is_vip: { type: "boolean" },
      },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "delete_email",
    description: "Stage email deletion (not deleted until confirmed). Use only messageId from INBOX.",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string" },
        subject: { type: "string" },
      },
      required: ["messageId", "subject"],
    },
  },
  {
    type: "function",
    name: "delete_contact",
    description: "Stage contact deletion (not deleted until confirmed). Use only contactId from CONTACTS.",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        name: { type: "string" },
      },
      required: ["contactId", "name"],
    },
  },
];
