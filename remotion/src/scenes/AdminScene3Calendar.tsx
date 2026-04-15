import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { fontDisplay, fontBody } from "../fonts";
import { colors } from "../theme";

const features = [
  { icon: "📅", title: "Calendar Management", desc: "Scheduling & coordination" },
  { icon: "📋", title: "Meeting Prep", desc: "Auto-generated briefs" },
  { icon: "🌅", title: "Morning Briefing", desc: "Daily agenda synthesis" },
  { icon: "🌙", title: "EOD Wrap-Up", desc: "End-of-day summaries" },
];

export const AdminScene3Calendar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headingOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const headingX = interpolate(spring({ frame, fps, config: { damping: 20 } }), [0, 1], [60, 0]);

  return (
    <AbsoluteFill style={{ padding: 100, justifyContent: "center", alignItems: "flex-end" }}>
      {/* Right-aligned content for variety */}
      <div style={{ maxWidth: 1720, width: "100%" }}>
        {/* Section Label */}
        <div
          style={{
            opacity: headingOp,
            transform: `translateX(${headingX}px)`,
            fontFamily: fontBody,
            fontSize: 18,
            color: colors.accent,
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 16,
            textAlign: "right",
          }}
        >
          Scheduling & Prep
        </div>

        {/* Title */}
        <div
          style={{
            opacity: headingOp,
            transform: `translateX(${headingX}px)`,
            fontFamily: fontDisplay,
            fontSize: 72,
            color: colors.text,
            lineHeight: 1.15,
            marginBottom: 60,
            textAlign: "right",
          }}
        >
          Start sharp,
          <br />
          <span style={{ color: colors.accent }}>end organized.</span>
        </div>

        {/* Staggered horizontal cards */}
        <div style={{ display: "flex", gap: 24, justifyContent: "flex-end" }}>
          {features.map((f, i) => {
            const delay = 15 + i * 14;
            const cardOp = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateRight: "clamp" });
            const cardX = interpolate(
              spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 140 } }),
              [0, 1],
              [80, 0]
            );

            return (
              <div
                key={i}
                style={{
                  opacity: cardOp,
                  transform: `translateX(${cardX}px)`,
                  background: colors.bgCard,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 20,
                  padding: "40px 36px",
                  width: 380,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div style={{ fontSize: 44 }}>{f.icon}</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 26, color: colors.text }}>
                  {f.title}
                </div>
                <div style={{ fontFamily: fontBody, fontSize: 17, color: colors.textMuted, lineHeight: 1.5 }}>
                  {f.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
