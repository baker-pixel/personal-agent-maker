import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Scene1Hero } from "./scenes/Scene1Hero";
import { Scene2EmailTriage } from "./scenes/Scene2EmailTriage";
import { Scene3MeetingPrep } from "./scenes/Scene3MeetingPrep";
import { Scene4Approval } from "./scenes/Scene4Approval";
import { Scene5CTA } from "./scenes/Scene5CTA";
import { colors } from "./theme";

export const MainVideo = () => {
  const frame = useCurrentFrame();

  // Persistent animated background
  const gradAngle = interpolate(frame, [0, 750], [135, 165]);
  const accentOp = interpolate(
    Math.sin(frame * 0.02),
    [-1, 1],
    [0.03, 0.08]
  );

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {/* Animated gradient overlay */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${gradAngle}deg, ${colors.accent}${Math.round(accentOp * 255).toString(16).padStart(2, "0")} 0%, transparent 40%, ${colors.bgLight}33 100%)`,
        }}
      />

      {/* Floating accent orbs */}
      <div
        style={{
          position: "absolute",
          top: 120 + Math.sin(frame * 0.015) * 30,
          right: 200 + Math.cos(frame * 0.012) * 40,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}12 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 100 + Math.sin(frame * 0.018 + 2) * 25,
          left: 150 + Math.cos(frame * 0.014 + 1) * 35,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}08 0%, transparent 70%)`,
        }}
      />

      {/* Scene transitions */}
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={170}>
          <Scene1Hero />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={160}>
          <Scene2EmailTriage />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={150}>
          <Scene3MeetingPrep />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={160}>
          <Scene4Approval />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={170}>
          <Scene5CTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
