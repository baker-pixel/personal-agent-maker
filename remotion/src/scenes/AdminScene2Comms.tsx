import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { fontDisplay, fontBody } from "../fonts";
import { colors } from "../theme";

const features = [
  { icon: "✉️", title: "Email Triage", desc: "AI-powered priority sorting" },
  { icon: "✍️", title: "Draft Replies", desc: "In your voice & tone" },
  { icon: "📱", title: "SMS & Voice", desc: "Text or call your agent" },
  { icon: "🔔", title: "Slack Alerts", desc: "Real-time notifications" },
];

export const AdminScene2Comms: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headingOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const headingX = interpolate(spring({ frame, fps, config: { damping: 20 } }), [0, 1], [-60, 0]);

  return (
    <AbsoluteFill style={{ padding: 100, justifyContent: "center" }}>
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
        }}
      >
        Communication
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
          maxWidth: 800,
        }}
      >
        Every message,
        <br />
        <span style={{ color: colors.accent }}>handled.</span>
      </div>

      {/* Feature Cards Grid */}
      <div style={{ display: "flex", gap: 24 }}>
        {features.map((f, i) => {
          const delay = 15 + i * 12;
          const cardOp = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateRight: "clamp" });
          const cardY = interpolate(
            spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 150 } }),
            [0, 1],
            [60, 0]
          );
          const cardScale = interpolate(
            spring({ frame: frame - delay, fps, config: { damping: 12 } }),
            [0, 1],
            [0.9, 1]
          );

          return (
            <div
              key={i}
              style={{
                opacity: cardOp,
                transform: `translateY(${cardY}px) scale(${cardScale})`,
                background: colors.bgCard,
                border: `1px solid ${colors.border}`,
                borderRadius: 20,
                padding: "40px 36px",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ fontSize: 48 }}>{f.icon}</div>
              <div style={{ fontFamily: fontDisplay, fontSize: 28, color: colors.text }}>
                {f.title}
              </div>
              <div style={{ fontFamily: fontBody, fontSize: 18, color: colors.textMuted, lineHeight: 1.5 }}>
                {f.desc}
              </div>

              {/* Animated accent bar */}
              <div
                style={{
                  marginTop: 8,
                  height: 3,
                  borderRadius: 2,
                  background: colors.accent,
                  width: interpolate(frame, [delay + 15, delay + 45], [0, 100], { extrapolateRight: "clamp" }),
                  opacity: 0.6,
                }}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
