import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

const emails = [
  { from: "Sarah Chen", subject: "Q3 Partnership Proposal — action needed", category: "Urgent", color: "#EF4444" },
  { from: "Marcus Webb", subject: "Re: Atlas Capital quarterly review", category: "Needs Reply", color: colors.accent },
  { from: "Priya Sharma", subject: "Team offsite agenda draft", category: "FYI", color: "#3B82F6" },
  { from: "Newsletter", subject: "TechCrunch Morning Digest", category: "Newsletter", color: colors.textMuted },
];

export const Scene2EmailTriage = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const titleX = interpolate(spring({ frame, fps, config: { damping: 20 } }), [0, 1], [-60, 0]);

  return (
    <AbsoluteFill style={{ display: "flex", padding: 100, gap: 80 }}>
      {/* Left side — title */}
      <div style={{ flex: "0 0 500px", display: "flex", flexDirection: "column", justifyContent: "center", opacity: titleOp, transform: `translateX(${titleX}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `${colors.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${colors.accent}30` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <span style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: 2 }}>
            Email Triage
          </span>
        </div>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 64, color: colors.text, lineHeight: 1.1, margin: 0 }}>
          Every email,{"\n"}
          <span style={{ color: colors.textMuted }}>instantly sorted.</span>
        </h2>
        <p style={{ fontFamily: fontBody, fontSize: 20, color: colors.textMuted, lineHeight: 1.6, marginTop: 24, maxWidth: 420 }}>
          AI categorizes your inbox into Urgent, Needs Reply, FYI, and Newsletter — with draft responses ready to go.
        </p>
      </div>

      {/* Right side — email cards */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        {emails.map((email, i) => {
          const delay = 20 + i * 15;
          const cardOp = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: "clamp" });
          const cardX = interpolate(
            spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 150 } }),
            [0, 1],
            [80, 0]
          );
          // Category badge slides in after card
          const badgeOp = interpolate(frame, [delay + 20, delay + 35], [0, 1], { extrapolateRight: "clamp" });
          const badgeScale = spring({ frame: frame - delay - 20, fps, config: { damping: 12 } });

          return (
            <div
              key={i}
              style={{
                opacity: cardOp,
                transform: `translateX(${cardX}px)`,
                background: colors.bgCard,
                borderRadius: 20,
                padding: "28px 32px",
                border: `1px solid ${colors.border}`,
                display: "flex",
                alignItems: "center",
                gap: 20,
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${email.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: email.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: fontBody, fontSize: 18, fontWeight: 600, color: colors.text }}>{email.from}</div>
                <div style={{ fontFamily: fontBody, fontSize: 15, color: colors.textMuted, marginTop: 4 }}>{email.subject}</div>
              </div>
              <div
                style={{
                  opacity: badgeOp,
                  transform: `scale(${badgeScale})`,
                  background: `${email.color}20`,
                  border: `1px solid ${email.color}40`,
                  borderRadius: 10,
                  padding: "8px 16px",
                  fontFamily: fontBody,
                  fontSize: 13,
                  fontWeight: 600,
                  color: email.color,
                  whiteSpace: "nowrap",
                }}
              >
                {email.category}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
