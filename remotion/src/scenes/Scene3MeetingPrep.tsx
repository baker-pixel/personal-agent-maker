import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

export const Scene3MeetingPrep = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  // Meeting card
  const cardScale = spring({ frame: frame - 10, fps, config: { damping: 18 } });
  const cardOp = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" });

  const items = [
    { icon: "👥", label: "Attendees", value: "Sarah Chen, Marcus Webb, Alex Torres" },
    { icon: "📋", label: "Agenda", value: "Q3 pipeline review, budget allocation, new hires" },
    { icon: "💡", label: "Talking Points", value: "Revenue up 23% QoQ, 3 deals closing this week" },
    { icon: "📎", label: "Relevant Docs", value: "Q3 Forecast.xlsx, Pipeline Summary.pdf" },
  ];

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {/* Section label */}
      <div style={{ opacity: titleOp, display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${colors.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${colors.accent}30` }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </div>
        <span style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: 2 }}>
          Meeting Prep
        </span>
      </div>

      <h2 style={{ fontFamily: fontDisplay, fontSize: 56, color: colors.text, textAlign: "center", margin: 0, opacity: titleOp }}>
        Walk in fully briefed.{" "}
        <span style={{ color: colors.textMuted }}>Every time.</span>
      </h2>

      {/* Meeting prep card */}
      <div
        style={{
          marginTop: 50,
          opacity: cardOp,
          transform: `scale(${cardScale})`,
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: 24,
          padding: 0,
          width: 1000,
          overflow: "hidden",
        }}
      >
        {/* Card header */}
        <div style={{ padding: "28px 40px", borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: fontDisplay, fontSize: 28, color: colors.text }}>Q3 Strategy Review</div>
            <div style={{ fontFamily: fontBody, fontSize: 15, color: colors.textMuted, marginTop: 6 }}>Today, 2:00 PM — 3:00 PM · Conference Room A</div>
          </div>
          <div style={{ background: `${colors.success}20`, border: `1px solid ${colors.success}40`, borderRadius: 10, padding: "8px 18px", fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: colors.success }}>
            In 45 min
          </div>
        </div>

        {/* Items */}
        <div style={{ padding: "12px 40px 28px" }}>
          {items.map((item, i) => {
            const delay = 40 + i * 14;
            const iOp = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateRight: "clamp" });
            const iY = interpolate(
              spring({ frame: frame - delay, fps, config: { damping: 20 } }),
              [0, 1],
              [20, 0]
            );
            return (
              <div
                key={i}
                style={{
                  opacity: iOp,
                  transform: `translateY(${iY}px)`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: "20px 0",
                  borderBottom: i < items.length - 1 ? `1px solid ${colors.border}` : "none",
                }}
              >
                <span style={{ fontSize: 24 }}>{item.icon}</span>
                <div>
                  <div style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>{item.label}</div>
                  <div style={{ fontFamily: fontBody, fontSize: 18, color: colors.text, marginTop: 6, lineHeight: 1.5 }}>{item.value}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
