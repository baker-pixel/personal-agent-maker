import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

export const Scene5CTA = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const iconScale = spring({ frame: frame - 5, fps, config: { damping: 8, stiffness: 80 } });
  const glowSize = interpolate(Math.sin(frame * 0.05), [-1, 1], [25, 55]);

  const t1Op = interpolate(frame, [18, 38], [0, 1], { extrapolateRight: "clamp" });
  const t1Y = interpolate(spring({ frame: frame - 18, fps, config: { damping: 18 } }), [0, 1], [50, 0]);

  const subOp = interpolate(frame, [40, 58], [0, 1], { extrapolateRight: "clamp" });

  const btnScale = spring({ frame: frame - 58, fps, config: { damping: 12 } });
  const btnGlow = interpolate(Math.sin(frame * 0.04), [-1, 1], [0.2, 0.5]);

  const checks = ["Free tier included", "No credit card", "Cancel anytime"];

  // Decorative ring
  const ringScale = interpolate(frame, [0, 185], [0.8, 1.2]);
  const ringOp = interpolate(Math.sin(frame * 0.02), [-1, 1], [0.03, 0.08]);

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {/* Large decorative ring */}
      <div style={{
        position: "absolute",
        width: 800, height: 800, borderRadius: "50%",
        border: `1px solid ${colors.accent}`,
        opacity: ringOp,
        transform: `scale(${ringScale})`,
      }} />

      {/* Icon with glow */}
      <div style={{ position: "relative", marginBottom: 36 }}>
        <div style={{
          position: "absolute", top: -30, left: -30,
          width: 140, height: 140, borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}30 0%, transparent 65%)`,
          filter: `blur(${glowSize}px)`,
        }} />
        <div style={{
          position: "relative", width: 80, height: 80, borderRadius: 24,
          background: `linear-gradient(135deg, ${colors.accent}25, ${colors.accent}0C)`,
          border: `1px solid ${colors.accent}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: `scale(${iconScale})`,
          boxShadow: `0 8px 32px ${colors.accent}20`,
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
          </svg>
        </div>
      </div>

      {/* Title */}
      <h2 style={{
        fontFamily: fontDisplay, fontSize: 80, color: colors.text,
        textAlign: "center", margin: 0, lineHeight: 1.1,
        opacity: t1Op, transform: `translateY(${t1Y}px)`,
      }}>
        Ready to reclaim<br />your day?
      </h2>

      <p style={{
        fontFamily: fontBody, fontSize: 22, color: colors.textMuted,
        textAlign: "center", maxWidth: 550, marginTop: 24, lineHeight: 1.6,
        opacity: subOp,
      }}>
        Join executives who've already made the switch to intelligent productivity.
      </p>

      {/* CTA button */}
      <div style={{
        marginTop: 44, transform: `scale(${btnScale})`,
        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
        borderRadius: 20, padding: "22px 64px",
        display: "flex", alignItems: "center", gap: 14,
        boxShadow: `0 12px 40px ${colors.accent}${Math.round(btnGlow * 255).toString(16).padStart(2, "0")}`,
      }}>
        <span style={{ fontFamily: fontBody, fontSize: 21, fontWeight: 700, color: colors.bg }}>Get started free</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.bg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>

      {/* Checks */}
      <div style={{ display: "flex", gap: 36, marginTop: 32 }}>
        {checks.map((c, i) => {
          const cOp = interpolate(frame, [75 + i * 10, 90 + i * 10], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ opacity: cOp, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6,
                background: `${colors.success}15`, border: `1px solid ${colors.success}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <span style={{ fontFamily: fontBody, fontSize: 15, color: colors.textMuted }}>{c}</span>
            </div>
          );
        })}
      </div>

      {/* Wordmark */}
      <div style={{
        position: "absolute", bottom: 50,
        display: "flex", alignItems: "center", gap: 12,
        opacity: interpolate(frame, [110, 135], [0, 0.5], { extrapolateRight: "clamp" }),
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `${colors.accent}15`, border: `1px solid ${colors.accent}25`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
          </svg>
        </div>
        <span style={{ fontFamily: fontDisplay, fontSize: 20, color: colors.text }}>Normy</span>
        <span style={{ fontFamily: fontBody, fontSize: 13, color: colors.textMuted, marginLeft: 8 }}>normy.ai</span>
      </div>
    </AbsoluteFill>
  );
};
