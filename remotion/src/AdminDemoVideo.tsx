import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { AdminScene1Hero } from "./scenes/AdminScene1Hero";
import { AdminScene2Comms } from "./scenes/AdminScene2Comms";
import { AdminScene3Calendar } from "./scenes/AdminScene3Calendar";
import { AdminScene4Intel } from "./scenes/AdminScene4Intel";
import { AdminScene5Close } from "./scenes/AdminScene5Close";
import { colors } from "./theme";

export const AdminDemoVideo = () => {
  const frame = useCurrentFrame();

  const gradAngle = interpolate(frame, [0, 750], [120, 220]);
  const pulse = Math.sin(frame * 0.02) * 0.5 + 0.5;

  // Floating particles
  const dots: { x: number; y: number; delay: number }[] = [];
  for (let i = 0; i < 30; i++) {
    dots.push({
      x: (i * 137.5) % 1920,
      y: (i * 89.3) % 1080,
      delay: i * 0.4,
    });
  }

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {/* Gradient background */}
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 10%, ${colors.accent}0D 0%, transparent 60%),
            radial-gradient(ellipse 60% 80% at 85% 90%, ${colors.accent}08 0%, transparent 50%),
            linear-gradient(${gradAngle}deg, ${colors.bgLight} 0%, ${colors.bg} 40%, ${colors.bg} 60%, ${colors.bgLight}88 100%)
          `,
        }}
      />

      {/* Particles */}
      {dots.map((dot, i) => {
        const y = dot.y + Math.sin((frame + dot.delay * 20) * 0.012) * 18;
        const x = dot.x + Math.cos((frame + dot.delay * 15) * 0.008) * 12;
        const opacity = interpolate(Math.sin((frame + i * 30) * 0.015), [-1, 1], [0.02, 0.07]);
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

      {/* Ambient orb */}
      <div
        style={{
          position: "absolute",
          top: 200 + Math.sin(frame * 0.01) * 60,
          right: 100 + Math.cos(frame * 0.008) * 80,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}${Math.round(pulse * 8 + 4).toString(16).padStart(2, "0")} 0%, transparent 65%)`,
        }}
      />

      {/* Scenes */}
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={150}>
          <AdminScene1Hero />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={140}>
          <AdminScene2Comms />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={140}>
          <AdminScene3Calendar />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={140}>
          <AdminScene4Intel />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={150}>
          <AdminScene5Close />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
