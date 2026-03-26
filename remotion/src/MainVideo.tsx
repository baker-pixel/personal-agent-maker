import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { Scene1Hero } from "./scenes/Scene1Hero";
import { Scene2EmailTriage } from "./scenes/Scene2EmailTriage";
import { Scene3MeetingPrep } from "./scenes/Scene3MeetingPrep";
import { Scene4Approval } from "./scenes/Scene4Approval";
import { Scene5CTA } from "./scenes/Scene5CTA";
import { colors } from "./theme";

export const MainVideo = () => {
  const frame = useCurrentFrame();

  // Slow rotating gradient
  const gradAngle = interpolate(frame, [0, 900], [120, 200]);
  const pulse = Math.sin(frame * 0.018) * 0.5 + 0.5;

  // Floating grid dots
  const dots: { x: number; y: number; delay: number }[] = [];
  for (let i = 0; i < 40; i++) {
    dots.push({
      x: (i * 137.5) % 1920,
      y: (i * 89.3) % 1080,
      delay: i * 0.4,
    });
  }

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {/* Deep gradient layer */}
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 10%, ${colors.accent}0D 0%, transparent 60%),
            radial-gradient(ellipse 60% 80% at 85% 90%, ${colors.accent}08 0%, transparent 50%),
            linear-gradient(${gradAngle}deg, ${colors.bgLight} 0%, ${colors.bg} 40%, ${colors.bg} 60%, ${colors.bgLight}88 100%)
          `,
        }}
      />

      {/* Animated floating particles */}
      {dots.map((dot, i) => {
        const y = dot.y + Math.sin((frame + dot.delay * 20) * 0.012) * 18;
        const x = dot.x + Math.cos((frame + dot.delay * 15) * 0.008) * 12;
        const opacity = interpolate(
          Math.sin((frame + i * 30) * 0.015),
          [-1, 1],
          [0.02, 0.08]
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: colors.accent,
              opacity,
            }}
          />
        );
      })}

      {/* Large ambient orb */}
      <div
        style={{
          position: "absolute",
          top: 200 + Math.sin(frame * 0.01) * 60,
          right: 100 + Math.cos(frame * 0.008) * 80,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}${Math.round(pulse * 10 + 4).toString(16).padStart(2, "0")} 0%, transparent 65%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 50 + Math.sin(frame * 0.013 + 2) * 40,
          left: 80 + Math.cos(frame * 0.009 + 1) * 50,
          width: 450,
          height: 450,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}06 0%, transparent 60%)`,
        }}
      />

      {/* Thin horizontal lines for texture */}
      {[180, 540, 900].map((y, i) => (
        <div
          key={`line-${i}`}
          style={{
            position: "absolute",
            top: y,
            left: 0,
            width: "100%",
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${colors.border}40 30%, ${colors.border}20 70%, transparent 100%)`,
            opacity: 0.3,
          }}
        />
      ))}

      {/* Scenes */}
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={195}>
          <Scene1Hero />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 25 })}
        />
        <TransitionSeries.Sequence durationInFrames={185}>
          <Scene2EmailTriage />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 25 })}
        />
        <TransitionSeries.Sequence durationInFrames={175}>
          <Scene3MeetingPrep />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 25 })}
        />
        <TransitionSeries.Sequence durationInFrames={185}>
          <Scene4Approval />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 25 })}
        />
        <TransitionSeries.Sequence durationInFrames={185}>
          <Scene5CTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
