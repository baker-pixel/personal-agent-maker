import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

const emails = [
  { from: "Sarah Chen", subject: "Q3 Partnership Proposal — action needed", category: "Urgent", color: "#EF4444", initials: "SC" },
  { from: "Marcus Webb", subject: "Re: Atlas Capital quarterly review", category: "Needs Reply", color: colors.accent, initials: "MW" },
  { from: "Priya Sharma", subject: "Team offsite agenda draft", category: "FYI", color: "#3B82F6", initials: "PS" },
  { from: "TechCrunch", subject: "Morning Digest — AI funding roundup", category: "Newsletter", color: "#6B7280", initials: "TC" },
];

export const Scene2EmailTriage = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Left side entrance
  const leftOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const leftX = interpolate(spring({ frame, fps, config: { damping: 22 } }), [0, 1], [-80, 0]);

  return (
    <AbsoluteFill style={{ display: "flex", padding: "80px 120px", gap: 80, alignItems: "center" }}>
      {/* Left side */}
      <div style={{ flex: "0 0 480px", opacity: leftOp, transform: `translateX(${leftX}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: `linear-gradient(135deg, ${colors.accent}20, ${colors.accent}08)`,
            border: `1px solid ${colors.accent}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <span style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 700, color: colors.accent, textTransform: "uppercase", letterSpacing: 2.5 }}>
            Smart Email Triage
          </span>
        </div>

        <h2 style={{ fontFamily: fontDisplay, fontSize: 58, color: colors.text, lineHeight: 1.1, margin: 0 }}>
          Every email,
        </h2>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 58, color: colors.textMuted, lineHeight: 1.1, margin: 0 }}>
          instantly sorted.
        </h2>

        <p style={{ fontFamily: fontBody, fontSize: 19, color: colors.textMuted, lineHeight: 1.7, marginTop: 28, maxWidth: 400 }}>
          AI categorizes your inbox into Urgent, Needs Reply, FYI, and Newsletter — with draft responses ready to go.
        </p>

        {/* Mini stats */}
        <div style={{ display: "flex", gap: 32, marginTop: 36 }}>
          {[{ v: "47", l: "Emails triaged" }, { v: "12", l: "Drafts ready" }].map((s, i) => {
            const d = 60 + i * 15;
            const op = interpolate(frame, [d, d + 15], [0, 1], { extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ opacity: op }}>
                <div style={{ fontFamily: fontDisplay, fontSize: 36, color: colors.accent }}>{s.v}</div>
                <div style={{ fontFamily: fontBody, fontSize: 12, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginTop: 2 }}>{s.l}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right side — email cards */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {emails.map((email, i) => {
          const delay = 15 + i * 14;
          const cardOp = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateRight: "clamp" });
          const cardX = interpolate(spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 140 } }), [0, 1], [100, 0]);
          const badgeDelay = delay + 22;
          const badgeScale = spring({ frame: frame - badgeDelay, fps, config: { damping: 10 } });
          const badgeOp = interpolate(frame, [badgeDelay, badgeDelay + 10], [0, 1], { extrapolateRight: "clamp" });

          return (
            <div
              key={i}
              style={{
                opacity: cardOp, transform: `translateX(${cardX}px)`,
                background: `linear-gradient(135deg, ${colors.bgCard}, ${colors.bgCard}DD)`,
                borderRadius: 18, padding: "24px 28px",
                border: `1px solid ${colors.border}`,
                display: "flex", alignItems: "center", gap: 18,
                boxShadow: `0 4px 20px ${colors.bg}80`,
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                background: `linear-gradient(135deg, ${email.color}25, ${email.color}10)`,
                border: `1px solid ${email.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: fontBody, fontSize: 14, fontWeight: 700, color: email.color,
              }}>
                {email.initials}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: fontBody, fontSize: 17, fontWeight: 600, color: colors.text }}>{email.from}</div>
                <div style={{ fontFamily: fontBody, fontSize: 14, color: colors.textMuted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email.subject}</div>
              </div>

              {/* Category badge */}
              <div style={{
                opacity: badgeOp, transform: `scale(${badgeScale})`,
                background: `${email.color}15`, border: `1px solid ${email.color}35`,
                borderRadius: 10, padding: "7px 16px",
                fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: email.color,
                letterSpacing: 0.5, whiteSpace: "nowrap",
              }}>
                {email.category}
              </div>
            </div>
          );
        })}

        {/* AI summary bar at bottom */}
        {(() => {
          const barDelay = 85;
          const barOp = interpolate(frame, [barDelay, barDelay + 20], [0, 1], { extrapolateRight: "clamp" });
          const barY = interpolate(spring({ frame: frame - barDelay, fps, config: { damping: 20 } }), [0, 1], [20, 0]);
          return (
            <div style={{
              opacity: barOp, transform: `translateY(${barY}px)`,
              background: `linear-gradient(135deg, ${colors.accent}12, ${colors.accent}06)`,
              border: `1px solid ${colors.accent}20`,
              borderRadius: 14, padding: "16px 24px",
              display: "flex", alignItems: "center", gap: 12, marginTop: 8,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
              </svg>
              <span style={{ fontFamily: fontBody, fontSize: 14, color: colors.accent, fontWeight: 500 }}>
                1 urgent, 1 needs reply — 2 draft responses ready for your approval
              </span>
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
