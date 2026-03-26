import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

const drafts = [
  { to: "Marcus Chen", subject: "Re: Q3 partnership proposal", preview: "Thanks for sharing the proposal, Marcus. I've reviewed the terms and the pricing structure looks competitive...", initials: "MC" },
  { to: "Sarah Kim", subject: "Re: Contract timeline", preview: "Hi Sarah, I'd be happy to move the timeline up. Let's aim for signing by end of next week...", initials: "SK" },
  { to: "David Park", subject: "Re: Product demo next week", preview: "Looking forward to the demo! I'll bring the updated specs and competitive analysis...", initials: "DP" },
];

export const Scene4Approval = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const leftX = interpolate(spring({ frame, fps, config: { damping: 22 } }), [0, 1], [-60, 0]);

  // Animate approval of second card at frame 95
  const approveFrame = 95;
  const checkOp = interpolate(frame, [approveFrame, approveFrame + 12], [0, 1], { extrapolateRight: "clamp" });
  const checkScale = spring({ frame: frame - approveFrame, fps, config: { damping: 8 } });

  // Third card shows sent status
  const sentGlowOp = interpolate(Math.sin((frame - 40) * 0.05), [-1, 1], [0.3, 0.7]);

  return (
    <AbsoluteFill style={{ display: "flex", padding: "80px 110px", gap: 80, alignItems: "center" }}>
      {/* Left */}
      <div style={{ flex: "0 0 460px", opacity: leftOp, transform: `translateX(${leftX}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: `linear-gradient(135deg, ${colors.success}20, ${colors.success}08)`,
            border: `1px solid ${colors.success}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 700, color: colors.success, textTransform: "uppercase", letterSpacing: 2.5 }}>Approval Inbox</span>
        </div>

        <h2 style={{ fontFamily: fontDisplay, fontSize: 56, color: colors.text, lineHeight: 1.1, margin: 0 }}>AI drafts it.</h2>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 56, color: colors.textMuted, lineHeight: 1.1, margin: 0 }}>You approve it.</h2>

        <p style={{ fontFamily: fontBody, fontSize: 19, color: colors.textMuted, lineHeight: 1.7, marginTop: 28 }}>
          Nothing is ever sent without your explicit permission. Edit, approve, or dismiss with one tap.
        </p>

        {/* Shield badge */}
        <div style={{
          marginTop: 32, display: "flex", alignItems: "center", gap: 10,
          background: `linear-gradient(135deg, ${colors.success}10, ${colors.success}05)`,
          border: `1px solid ${colors.success}25`, borderRadius: 14, padding: "14px 22px",
          width: "fit-content",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: colors.success }}>
            Approval mode — nothing sent without you
          </span>
        </div>
      </div>

      {/* Right — draft cards */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {drafts.map((draft, i) => {
          const delay = 12 + i * 16;
          const cardOp = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: "clamp" });
          const cardX = interpolate(spring({ frame: frame - delay, fps, config: { damping: 18 } }), [0, 1], [80, 0]);

          const isSecond = i === 1;
          const isThird = i === 2;

          return (
            <div key={i} style={{
              opacity: cardOp, transform: `translateX(${cardX}px)`,
              background: isThird
                ? `linear-gradient(135deg, ${colors.success}08, ${colors.success}04)`
                : `linear-gradient(135deg, ${colors.bgCard}, ${colors.bgCard}DD)`,
              borderRadius: 18, padding: "22px 26px",
              border: `1px solid ${isThird ? `${colors.success}25` : colors.border}`,
              boxShadow: `0 4px 20px ${colors.bg}60`,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 12,
                    background: `linear-gradient(135deg, ${colors.accent}20, ${colors.accent}08)`,
                    border: `1px solid ${colors.accent}25`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: colors.accent,
                  }}>{draft.initials}</div>
                  <div>
                    <span style={{ fontFamily: fontBody, fontSize: 16, fontWeight: 600, color: colors.text }}>{draft.to}</span>
                    <span style={{ fontFamily: fontBody, fontSize: 13, color: colors.textMuted, marginLeft: 12 }}>{draft.subject}</span>
                  </div>
                </div>

                {/* Action buttons / status */}
                {isThird ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: fontBody, fontSize: 13, fontWeight: 700, color: colors.success }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    Sent
                  </div>
                ) : isSecond ? (
                  <div style={{ position: "relative" }}>
                    <div style={{ opacity: 1 - checkOp, display: "flex", gap: 8 }}>
                      <div style={{ background: colors.bgLight, borderRadius: 10, padding: "8px 18px", fontFamily: fontBody, fontSize: 12, fontWeight: 600, color: colors.textMuted }}>Edit</div>
                      <div style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, borderRadius: 10, padding: "8px 18px", fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: colors.bg }}>Approve</div>
                    </div>
                    <div style={{ opacity: checkOp, transform: `scale(${checkScale})`, position: "absolute", right: 0, top: 0, height: "100%", display: "flex", alignItems: "center", gap: 8, fontFamily: fontBody, fontSize: 13, fontWeight: 700, color: colors.success }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      Approved!
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ background: colors.bgLight, borderRadius: 10, padding: "8px 18px", fontFamily: fontBody, fontSize: 12, fontWeight: 600, color: colors.textMuted }}>Edit</div>
                    <div style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, borderRadius: 10, padding: "8px 18px", fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: colors.bg }}>Approve</div>
                  </div>
                )}
              </div>
              <p style={{ fontFamily: fontBody, fontSize: 14, color: colors.textMuted, margin: 0, lineHeight: 1.6 }}>{draft.preview}</p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
