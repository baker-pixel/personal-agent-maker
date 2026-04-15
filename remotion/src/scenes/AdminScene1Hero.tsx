import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { fontDisplay, fontBody } from "../fonts";
import { colors } from "../theme";

export const AdminScene1Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = interpolate(spring({ frame, fps, config: { damping: 18, stiffness: 120 } }), [0, 1], [80, 0]);
  const titleOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  const subtitleOp = interpolate(frame, [20, 45], [0, 1], { extrapolateRight: "clamp" });
  const subtitleY = interpolate(spring({ frame: frame - 15, fps, config: { damping: 20 } }), [0, 1], [40, 0]);

  const badgeScale = spring({ frame: frame - 35, fps, config: { damping: 12, stiffness: 180 } });
  const badgeOp = interpolate(frame, [35, 50], [0, 1], { extrapolateRight: "clamp" });

  // Pulsing accent ring
  const ringScale = 1 + Math.sin(frame * 0.04) * 0.05;
  const ringOp = interpolate(frame, [40, 60], [0, 0.15], { extrapolateRight: "clamp" });

  // Feature count reveal
  const countOp = interpolate(frame, [55, 75], [0, 1], { extrapolateRight: "clamp" });
  const countY = interpolate(spring({ frame: frame - 50, fps, config: { damping: 20 } }), [0, 1], [30, 0]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Decorative accent ring */}
      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: "50%",
          border: `2px solid ${colors.accent}`,
          opacity: ringOp,
          transform: `scale(${ringScale})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          borderRadius: "50%",
          border: `1px solid ${colors.accent}40`,
          opacity: ringOp * 0.5,
          transform: `scale(${ringScale * 0.98})`,
        }}
      />

      {/* Content */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, zIndex: 1 }}>
        {/* Badge */}
        <div
          style={{
            opacity: badgeOp,
            transform: `scale(${badgeScale})`,
            background: `${colors.accent}20`,
            border: `1px solid ${colors.accent}40`,
            borderRadius: 999,
            padding: "10px 28px",
            fontSize: 18,
            fontFamily: fontBody,
            fontWeight: 500,
            color: colors.accentLight,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          Admin Agent
        </div>

        {/* Title */}
        <div
          style={{
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
            fontFamily: fontDisplay,
            fontSize: 96,
            fontWeight: 400,
            color: colors.text,
            textAlign: "center",
            lineHeight: 1.1,
            maxWidth: 1200,
          }}
        >
          Your AI Executive
          <br />
          <span style={{ color: colors.accent }}>Assistant</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            opacity: subtitleOp,
            transform: `translateY(${subtitleY}px)`,
            fontFamily: fontBody,
            fontSize: 28,
            color: colors.textMuted,
            textAlign: "center",
            maxWidth: 700,
            lineHeight: 1.5,
          }}
        >
          15 powerful capabilities that handle your daily operations — so you can focus on growing your business.
        </div>

        {/* Feature count */}
        <div
          style={{
            opacity: countOp,
            transform: `translateY(${countY}px)`,
            display: "flex",
            gap: 40,
            marginTop: 20,
          }}
        >
          {[
            { num: "15", label: "Features" },
            { num: "24/7", label: "Availability" },
            { num: "$20", label: "Per Month" },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: fontDisplay, fontSize: 48, color: colors.accent, fontWeight: 400 }}>
                {item.num}
              </div>
              <div style={{ fontFamily: fontBody, fontSize: 16, color: colors.textMuted, letterSpacing: 1 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
