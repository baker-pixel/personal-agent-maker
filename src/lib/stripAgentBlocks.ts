/**
 * Strips action JSON blocks from agent message text before rendering to the user.
 * Handles both properly-fenced blocks AND bare JSON the model emits without fences.
 */

const FENCED_TAGS = ["draft-json", "calendar-json", "update-event-json", "cancel-event-json", "contact-json"];

function stripFencedBlocks(text: string): string {
  let result = text;
  for (const tag of FENCED_TAGS) {
    result = result.replace(new RegExp("```" + tag + "[\\s\\S]*?```", "g"), "");
  }
  return result;
}

function looksLikeActionBlock(obj: Record<string, unknown>): boolean {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  // Email draft: has (to_email or to) + subject + body
  if ((keys.includes("to_email") || keys.includes("to")) && keys.includes("subject") && keys.includes("body")) return true;
  // Calendar event: has summary + start + attendees
  if (keys.includes("summary") && keys.includes("start") && keys.includes("attendees")) return true;
  // Update/cancel event: has eventId + summary
  if (keys.includes("eventId") && keys.includes("summary")) return true;
  // Contact: has name + (email or phone or company)
  if (keys.includes("name") && (keys.includes("email") || keys.includes("phone") || keys.includes("company"))) return true;
  return false;
}

function stripBareJsonBlocks(text: string): string {
  let result = "";
  let depth = 0;
  let start = -1;
  let buf = "";
  let lastEnd = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) { start = i; buf = ""; }
      depth++;
    }
    if (depth > 0) buf += c;
    if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const parsed = JSON.parse(buf);
          if (looksLikeActionBlock(parsed)) {
            result += text.slice(lastEnd, start);
            lastEnd = i + 1;
          }
        } catch { /* not valid JSON, keep as-is */ }
        start = -1;
        buf = "";
      }
    }
  }
  result += text.slice(lastEnd);
  return result;
}

export function stripAgentBlocks(text: string): string {
  return stripBareJsonBlocks(stripFencedBlocks(text)).trim();
}
