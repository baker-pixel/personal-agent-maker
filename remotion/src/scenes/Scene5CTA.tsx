import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

export const Scene5CTA = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const iconScale = spring({ frame: frame - 5, fps, config: { damping: 10, stiffness: 100 } });
  const titleOp = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(spring({ frame: frame - 15, fps, config: { damping: 20 } }), [0, 1], [50, 0]);
  const subOp = interpolate(frame, [35, 55], [0, 1], { extrapolateRight: "clamp" });
  const btnScale = spring({ frame: frame - 55, fps, config: { damping: 12 } });

  // Pulsing glow
  const glowIntensity = interpolate(Math.sin(frame * 0.06), [-1, 1], [20, 50]);

  // Features check list
  const checks = ["Free tier included", "No credit card", "Cancel anytime"];

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {/* Glow behind icon */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: -40,
            left: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.accent}30 0%, transparent 70%)`,
            filter: `blur(${glowIntensity}px)`,
          }}
        />
        <div
          style={{
            position: "relative",
            width: 80,
            height: 80,
            borderRadius: 24,
            background: `${colors.accent}18`,
            border: `1px solid ${colors.accent}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${iconScale})`,
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
          </svg>
        </div>
      </div>

      <h2
        style={{
          fontFamily: fontDisplay,
          fontSize: 80,
          color: colors.text,
          textAlign: "center",
          margin: 0,
          marginTop: 48,
          opacity: titleOp,
          transform: `translateY(${titleY}px)`,
          lineHeight: 1.1,
        }}
      >
        Ready to reclaim{"\n"}your day?
      </h2>

      <p
        style={{
          fontFamily: fontBody,
          fontSize: 24,
          color: colors.textMuted,
          textAlign: "center",
          maxWidth: 600,
          marginTop: 28,
          opacity: subOp,
          lineHeight: 1.6,
        }}
      >
        Join executives who've already made the switch.
      </p>

      {/* CTA button */}
      <div
        style={{
          marginTop: 50,
          transform: `scale(${btnScale})`,
          background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
          borderRadius: 20,
          padding: "22px 60px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow: `0 8px 32px ${colors.accent}40`,
        }}
      >
        <span style={{ fontFamily: fontBody, fontSize: 22, fontWeight: 700, color: colors.bg }}>
          Get started free
        </span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.bg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>

      {/* Check items */}
      <div style={{ display: "flex", gap: 40, marginTop: 36 }}>
        {checks.map((c, i) => {
          const cOp = interpolate(frame, [70 + i * 10, 85 + i * 10], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ opacity: cOp, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span style={{ fontFamily: fontBody, fontSize: 16, color: colors.textMuted }}>{c}</span>
            </div>
          );
        })}
      </div>

      {/* Normy wordmark */}
      <div style={{
        position: "absolute",
        bottom: 60,
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: interpolate(frame, [100, 120], [0, 0.6], { extrapolateRight: "clamp" }),
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
        </svg>
        <span style={{ fontFamily: fontDisplay, fontSize: 22, color: colors.text }}>Normy</span>
      </div>
    </AbsoluteFill>
  );
};
