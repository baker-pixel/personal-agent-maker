import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { fontDisplay, fontBody } from "../fonts";
import { colors } from "../theme";

const features = [
  { icon: "🔍", title: "Follow-Up Tracking" },
  { icon: "👤", title: "Contact Intelligence" },
  { icon: "📄", title: "Document Summarization" },
  { icon: "📊", title: "Weekly Reports" },
  { icon: "📰", title: "News Monitoring" },
  { icon: "⏰", title: "Smart Scheduling" },
  { icon: "🧠", title: "Behavioral Reasoning" },
];

export const AdminScene4Intel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headingOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 100, justifyContent: "center" }}>
      {/* Section Label */}
      <div
        style={{
          opacity: headingOp,
          fontFamily: fontBody,
          fontSize: 18,
          color: colors.accent,
          letterSpacing: 4,
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        Intelligence & Insights
      </div>

      {/* Title */}
      <div
        style={{
          opacity: headingOp,
          fontFamily: fontDisplay,
          fontSize: 68,
          color: colors.text,
          lineHeight: 1.15,
          marginBottom: 50,
          textAlign: "center",
        }}
      >
        Your business, <span style={{ color: colors.accent }}>always visible.</span>
      </div>

      {/* Feature pills in flowing layout */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          justifyContent: "center",
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        {features.map((f, i) => {
          const delay = 10 + i * 8;
          const pillOp = interpolate(frame, [delay, delay + 18], [0, 1], { extrapolateRight: "clamp" });
          const pillScale = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 200 } });
          const pillY = interpolate(pillScale, [0, 1], [30, 0]);

          // Gentle float after entrance
          const floatY = frame > delay + 30 ? Math.sin((frame - delay) * 0.03 + i) * 4 : 0;

          return (
            <div
              key={i}
              style={{
                opacity: pillOp,
                transform: `translateY(${pillY + floatY}px) scale(${pillScale})`,
                background: colors.bgCard,
                border: `1px solid ${colors.border}`,
                borderRadius: 16,
                padding: "28px 40px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div style={{ fontSize: 36 }}>{f.icon}</div>
              <div style={{ fontFamily: fontBody, fontSize: 22, color: colors.text, fontWeight: 500 }}>
                {f.title}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
