import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

const attendees = [
  { name: "Sarah Chen", role: "VP Operations", initials: "SC", color: "#3B82F6" },
  { name: "Marcus Webb", role: "Managing Director", initials: "MW", color: "#8B5CF6" },
  { name: "Alex Torres", role: "Head of Product", initials: "AT", color: "#10B981" },
];

const talkingPoints = [
  "Revenue up 23% QoQ — highlight client retention impact",
  "3 deals closing this week totaling $420K",
  "New hire approval needed for engineering team",
];

export const Scene3MeetingPrep = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 140px" }}>
      {/* Section label */}
      <div style={{ opacity: headerOp, display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16,
          background: `linear-gradient(135deg, ${colors.accent}20, ${colors.accent}08)`,
          border: `1px solid ${colors.accent}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </div>
        <span style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 700, color: colors.accent, textTransform: "uppercase", letterSpacing: 2.5 }}>Meeting Prep</span>
      </div>

      <h2 style={{ fontFamily: fontDisplay, fontSize: 52, color: colors.text, textAlign: "center", margin: 0, opacity: headerOp }}>
        Walk in fully briefed. <span style={{ color: colors.textMuted }}>Every time.</span>
      </h2>

      {/* Meeting card */}
      {(() => {
        const cardScale = spring({ frame: frame - 15, fps, config: { damping: 20 } });
        const cardOp = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: "clamp" });
        return (
          <div style={{
            marginTop: 44, opacity: cardOp, transform: `scale(${cardScale})`,
            background: `linear-gradient(180deg, ${colors.bgCard}, ${colors.bgCard}CC)`,
            border: `1px solid ${colors.border}`,
            borderRadius: 24, width: 1100, overflow: "hidden",
            boxShadow: `0 20px 60px ${colors.bg}80, 0 0 0 1px ${colors.border}`,
          }}>
            {/* Header */}
            <div style={{ padding: "26px 40px", borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: fontDisplay, fontSize: 26, color: colors.text }}>Q3 Strategy Review</div>
                <div style={{ fontFamily: fontBody, fontSize: 14, color: colors.textMuted, marginTop: 6, display: "flex", alignItems: "center", gap: 16 }}>
                  <span>Today, 2:00 PM — 3:00 PM</span>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: colors.textMuted, display: "inline-block" }} />
                  <span>Conference Room A</span>
                </div>
              </div>
              <div style={{
                background: `${colors.success}18`, border: `1px solid ${colors.success}35`,
                borderRadius: 10, padding: "8px 20px",
                fontFamily: fontBody, fontSize: 13, fontWeight: 700, color: colors.success,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors.success }} />
                In 45 min
              </div>
            </div>

            {/* Two columns: Attendees + Talking Points */}
            <div style={{ display: "flex" }}>
              {/* Attendees */}
              <div style={{ flex: "0 0 380px", padding: "28px 40px", borderRight: `1px solid ${colors.border}` }}>
                <div style={{ fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 20 }}>Attendees</div>
                {attendees.map((a, i) => {
                  const d = 40 + i * 10;
                  const op = interpolate(frame, [d, d + 12], [0, 1], { extrapolateRight: "clamp" });
                  const x = interpolate(spring({ frame: frame - d, fps, config: { damping: 18 } }), [0, 1], [20, 0]);
                  return (
                    <div key={i} style={{ opacity: op, transform: `translateX(${x}px)`, display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: `linear-gradient(135deg, ${a.color}25, ${a.color}10)`,
                        border: `1px solid ${a.color}30`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: fontBody, fontSize: 13, fontWeight: 700, color: a.color,
                      }}>{a.initials}</div>
                      <div>
                        <div style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: colors.text }}>{a.name}</div>
                        <div style={{ fontFamily: fontBody, fontSize: 12, color: colors.textMuted }}>{a.role}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Talking Points */}
              <div style={{ flex: 1, padding: "28px 40px" }}>
                <div style={{ fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 20 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
                      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                    </svg>
                    AI-Generated Talking Points
                  </span>
                </div>
                {talkingPoints.map((point, i) => {
                  const d = 55 + i * 14;
                  const op = interpolate(frame, [d, d + 14], [0, 1], { extrapolateRight: "clamp" });
                  const y = interpolate(spring({ frame: frame - d, fps, config: { damping: 18 } }), [0, 1], [15, 0]);
                  return (
                    <div key={i} style={{ opacity: op, transform: `translateY(${y}px)`, display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 7, flexShrink: 0, marginTop: 1,
                        background: `${colors.accent}12`, border: `1px solid ${colors.accent}25`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: fontBody, fontSize: 11, fontWeight: 700, color: colors.accent,
                      }}>{i + 1}</div>
                      <span style={{ fontFamily: fontBody, fontSize: 16, color: colors.text, lineHeight: 1.5 }}>{point}</span>
                    </div>
                  );
                })}

                {/* Docs */}
                {(() => {
                  const d = 100;
                  const op = interpolate(frame, [d, d + 15], [0, 1], { extrapolateRight: "clamp" });
                  return (
                    <div style={{ opacity: op, marginTop: 12, display: "flex", gap: 10 }}>
                      {["Q3 Forecast.xlsx", "Pipeline Summary.pdf"].map((doc, j) => (
                        <div key={j} style={{
                          background: `${colors.bgLight}`, border: `1px solid ${colors.border}`,
                          borderRadius: 10, padding: "8px 16px",
                          fontFamily: fontBody, fontSize: 13, color: colors.textMuted,
                          display: "flex", alignItems: "center", gap: 8,
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                          </svg>
                          {doc}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};
