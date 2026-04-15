import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { fontDisplay, fontBody } from "../fonts";
import { colors } from "../theme";

export const AdminScene5Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const priceScale = spring({ frame: frame - 5, fps, config: { damping: 10, stiffness: 120 } });
  const priceOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  const tagOp = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" });
  const tagY = interpolate(spring({ frame: frame - 25, fps, config: { damping: 20 } }), [0, 1], [30, 0]);

  const ctaOp = interpolate(frame, [45, 65], [0, 1], { extrapolateRight: "clamp" });
  const ctaScale = spring({ frame: frame - 45, fps, config: { damping: 12 } });

  // Pulsing glow behind price
  const glowPulse = 0.15 + Math.sin(frame * 0.05) * 0.08;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent} 0%, transparent 70%)`,
          opacity: glowPulse,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, zIndex: 1 }}>
        {/* Price */}
        <div
          style={{
            opacity: priceOp,
            transform: `scale(${priceScale})`,
            fontFamily: fontDisplay,
            fontSize: 140,
            color: colors.text,
            fontWeight: 400,
          }}
        >
          <span style={{ color: colors.accent }}>$20</span>
          <span style={{ fontSize: 40, color: colors.textMuted }}>/mo</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            opacity: tagOp,
            transform: `translateY(${tagY}px)`,
            fontFamily: fontBody,
            fontSize: 28,
            color: colors.textMuted,
            textAlign: "center",
            maxWidth: 600,
            lineHeight: 1.5,
          }}
        >
          15 features. No contracts. Cancel anytime.
          <br />
          <span style={{ color: colors.text }}>Your AI admin starts working today.</span>
        </div>

        {/* CTA pill */}
        <div
          style={{
            opacity: ctaOp,
            transform: `scale(${ctaScale})`,
            background: colors.accent,
            borderRadius: 999,
            padding: "20px 60px",
            fontFamily: fontBody,
            fontSize: 24,
            fontWeight: 700,
            color: colors.bg,
            marginTop: 16,
          }}
        >
          Get Started with Normy →
        </div>
      </div>
    </AbsoluteFill>
  );
};
