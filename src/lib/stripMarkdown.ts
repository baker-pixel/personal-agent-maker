/** Strip markdown syntax before passing text to TTS so it's spoken naturally. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")          // fenced code blocks
    .replace(/`[^`\n]+`/g, "")              // inline code
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")  // bold+italic
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")    // bold
    .replace(/\*([^*\n]+)\*/g, "$1")        // italic
    .replace(/___([^_]+)___/g, "$1")        // bold+italic underscore
    .replace(/__([^_\n]+)__/g, "$1")        // bold underscore
    .replace(/_([^_\n]+)_/g, "$1")          // italic underscore
    .replace(/~~([^~]+)~~/g, "$1")          // strikethrough
    .replace(/^#{1,6}\s+/gm, "")            // headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text only
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")   // images → remove
    .replace(/^[-*+]\s+/gm, "")             // unordered list markers
    .replace(/^\d+\.\s+/gm, "")             // ordered list markers
    .replace(/^>\s*/gm, "")                 // blockquotes
    .replace(/\n{3,}/g, "\n\n")             // collapse excess newlines
    .trim();
}
