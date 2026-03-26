import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

export const Scene1Hero = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Sparkle icon scale
  const iconScale = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const iconRotate = interpolate(frame, [0, 170], [0, 360]);

  // Title reveal
  const titleY = interpolate(
    spring({ frame: frame - 15, fps, config: { damping: 20, stiffness: 120 } }),
    [0, 1],
    [60, 0]
  );
  const titleOp = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: "clamp" });

  // Subtitle
  const subOp = interpolate(frame, [35, 55], [0, 1], { extrapolateRight: "clamp" });
  const subY = interpolate(
    spring({ frame: frame - 35, fps, config: { damping: 20 } }),
    [0, 1],
    [40, 0]
  );

  // Badge
  const badgeScale = spring({ frame: frame - 5, fps, config: { damping: 15 } });

  // Stats row
  const stats = [
    { value: "12h", label: "Saved / week" },
    { value: "94%", label: "Accuracy" },
    { value: "3×", label: "Faster prep" },
  ];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Badge */}
      <div
        style={{
          transform: `scale(${badgeScale})`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: `${colors.accent}18`,
          border: `1px solid ${colors.accent}30`,
          borderRadius: 100,
          padding: "10px 24px",
          marginBottom: 40,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
        </svg>
        <span style={{ fontFamily: fontBody, fontSize: 16, fontWeight: 600, color: colors.accent, letterSpacing: 1 }}>
          AI-POWERED EXECUTIVE ASSISTANT
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          transform: `translateY(${titleY}px)`,
          opacity: titleOp,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: fontDisplay,
            fontSize: 120,
            color: colors.text,
            lineHeight: 1,
            margin: 0,
          }}
        >
          Your day,
        </h1>
        <h1
          style={{
            fontFamily: fontDisplay,
            fontSize: 120,
            lineHeight: 1,
            margin: 0,
            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          brilliantly managed.
        </h1>
      </div>

      {/* Subtitle */}
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 28,
          color: colors.textMuted,
          maxWidth: 700,
          textAlign: "center",
          lineHeight: 1.6,
          marginTop: 36,
          opacity: subOp,
          transform: `translateY(${subY}px)`,
        }}
      >
        Normy triages your inbox, preps your meetings, and keeps you ahead — all from a single conversation.
      </p>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          gap: 60,
          marginTop: 70,
        }}
      >
        {stats.map((s, i) => {
          const sOp = interpolate(frame, [60 + i * 12, 80 + i * 12], [0, 1], { extrapolateRight: "clamp" });
          const sY = interpolate(
            spring({ frame: frame - 60 - i * 12, fps, config: { damping: 18 } }),
            [0, 1],
            [30, 0]
          );
          return (
            <div
              key={i}
              style={{
                textAlign: "center",
                opacity: sOp,
                transform: `translateY(${sY}px)`,
              }}
            >
              <div style={{ fontFamily: fontDisplay, fontSize: 56, color: colors.accent }}>{s.value}</div>
              <div style={{ fontFamily: fontBody, fontSize: 16, color: colors.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: 2 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
