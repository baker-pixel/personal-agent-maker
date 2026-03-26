import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

export const Scene1Hero = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Sparkle icon entrance
  const iconScale = spring({ frame, fps, config: { damping: 10, stiffness: 120 } });
  const iconGlow = interpolate(Math.sin(frame * 0.06), [-1, 1], [15, 40]);

  // Badge
  const badgeOp = interpolate(frame, [5, 22], [0, 1], { extrapolateRight: "clamp" });
  const badgeY = interpolate(spring({ frame: frame - 5, fps, config: { damping: 20 } }), [0, 1], [20, 0]);

  // Title line 1
  const t1Op = interpolate(frame, [18, 38], [0, 1], { extrapolateRight: "clamp" });
  const t1Y = interpolate(spring({ frame: frame - 18, fps, config: { damping: 18, stiffness: 100 } }), [0, 1], [70, 0]);

  // Title line 2 (gradient)
  const t2Op = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });
  const t2Y = interpolate(spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 100 } }), [0, 1], [70, 0]);

  // Subtitle
  const subOp = interpolate(frame, [48, 68], [0, 1], { extrapolateRight: "clamp" });
  const subY = interpolate(spring({ frame: frame - 48, fps, config: { damping: 22 } }), [0, 1], [30, 0]);

  // Divider line
  const lineWidth = interpolate(spring({ frame: frame - 65, fps, config: { damping: 25 } }), [0, 1], [0, 400]);

  // Stats
  const stats = [
    { value: "12h", label: "Saved / week" },
    { value: "94%", label: "Accuracy" },
    { value: "3×", label: "Faster prep" },
    { value: "0", label: "Dropped threads" },
  ];

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {/* Sparkle icon with glow */}
      <div style={{ position: "relative", marginBottom: 28 }}>
        <div style={{
          position: "absolute", top: -20, left: -20,
          width: 100, height: 100, borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}25 0%, transparent 70%)`,
          filter: `blur(${iconGlow}px)`,
        }} />
        <div style={{
          position: "relative", width: 60, height: 60, borderRadius: 18,
          background: `linear-gradient(135deg, ${colors.accent}22, ${colors.accent}0A)`,
          border: `1px solid ${colors.accent}35`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: `scale(${iconScale})`,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
          </svg>
        </div>
      </div>

      {/* Badge */}
      <div style={{
        opacity: badgeOp, transform: `translateY(${badgeY}px)`,
        display: "flex", alignItems: "center", gap: 10,
        background: `linear-gradient(135deg, ${colors.accent}14, ${colors.accent}08)`,
        border: `1px solid ${colors.accent}28`,
        borderRadius: 100, padding: "10px 28px", marginBottom: 36,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors.accent, boxShadow: `0 0 8px ${colors.accent}60` }} />
        <span style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 600, color: colors.accent, letterSpacing: 2, textTransform: "uppercase" }}>
          AI-Powered Executive Assistant
        </span>
      </div>

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1 style={{
          fontFamily: fontDisplay, fontSize: 110, color: colors.text,
          lineHeight: 1.05, margin: 0, opacity: t1Op, transform: `translateY(${t1Y}px)`,
        }}>
          Your day,
        </h1>
        <h1 style={{
          fontFamily: fontDisplay, fontSize: 110, lineHeight: 1.05, margin: 0,
          opacity: t2Op, transform: `translateY(${t2Y}px)`,
          background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight}, #F4C26B)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          brilliantly managed.
        </h1>
      </div>

      {/* Subtitle */}
      <p style={{
        fontFamily: fontBody, fontSize: 26, color: colors.textMuted,
        maxWidth: 680, textAlign: "center", lineHeight: 1.65, marginTop: 32,
        opacity: subOp, transform: `translateY(${subY}px)`,
      }}>
        Normy triages your inbox, preps your meetings, tracks follow-ups, and keeps you ahead — all from a single conversation.
      </p>

      {/* Decorative line */}
      <div style={{
        width: lineWidth, height: 1, marginTop: 44,
        background: `linear-gradient(90deg, transparent, ${colors.accent}40, transparent)`,
      }} />

      {/* Stats row */}
      <div style={{ display: "flex", gap: 56, marginTop: 44 }}>
        {stats.map((s, i) => {
          const delay = 78 + i * 10;
          const sOp = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: "clamp" });
          const sScale = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 130 } });
          return (
            <div key={i} style={{ textAlign: "center", opacity: sOp, transform: `scale(${sScale})` }}>
              <div style={{
                fontFamily: fontDisplay, fontSize: 48, color: colors.accent,
                textShadow: `0 0 30px ${colors.accent}20`,
              }}>{s.value}</div>
              <div style={{
                fontFamily: fontBody, fontSize: 13, color: colors.textMuted,
                marginTop: 6, textTransform: "uppercase", letterSpacing: 2.5, fontWeight: 500,
              }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
