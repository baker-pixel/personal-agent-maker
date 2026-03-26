import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { fontDisplay, fontBody } from "../fonts";

const drafts = [
  { to: "Marcus Chen", subject: "Re: Q3 partnership proposal", preview: "Thanks for sharing the proposal, Marcus. I've reviewed the terms and...", status: "pending" },
  { to: "Sarah Kim", subject: "Re: Contract timeline", preview: "Hi Sarah, I'd be happy to move the timeline up. Let's aim for...", status: "approving" },
  { to: "David Park", subject: "Re: Product demo next week", preview: "Looking forward to the demo! I'll bring the updated specs and...", status: "sent" },
];

export const Scene4Approval = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ display: "flex", padding: "80px 100px", gap: 80 }}>
      {/* Left */}
      <div style={{ flex: "0 0 480px", display: "flex", flexDirection: "column", justifyContent: "center", opacity: titleOp }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `${colors.success}15`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${colors.success}30` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: colors.success, textTransform: "uppercase", letterSpacing: 2 }}>
            Approval Inbox
          </span>
        </div>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 56, color: colors.text, lineHeight: 1.1, margin: 0 }}>
          AI drafts it.{"\n"}
          <span style={{ color: colors.textMuted }}>You approve it.</span>
        </h2>
        <p style={{ fontFamily: fontBody, fontSize: 20, color: colors.textMuted, lineHeight: 1.6, marginTop: 24 }}>
          Nothing is ever sent without your explicit permission. Edit, approve, or dismiss with one tap.
        </p>

        {/* Shield badge */}
        <div style={{
          marginTop: 36,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: `${colors.success}12`,
          border: `1px solid ${colors.success}25`,
          borderRadius: 12,
          padding: "12px 20px",
          width: "fit-content",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 500, color: colors.success }}>
            Approval mode — nothing sent without your permission
          </span>
        </div>
      </div>

      {/* Right — draft cards */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        {drafts.map((draft, i) => {
          const delay = 15 + i * 18;
          const cardOp = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: "clamp" });
          const cardX = interpolate(spring({ frame: frame - delay, fps, config: { damping: 18 } }), [0, 1], [60, 0]);

          // Animate the "approving" card checkmark
          const isApproving = draft.status === "approving";
          const checkFrame = 90;
          const checkOp = isApproving ? interpolate(frame, [checkFrame, checkFrame + 10], [0, 1], { extrapolateRight: "clamp" }) : 0;
          const checkScale = isApproving ? spring({ frame: frame - checkFrame, fps, config: { damping: 10 } }) : 0;

          const isSent = draft.status === "sent";

          return (
            <div
              key={i}
              style={{
                opacity: cardOp,
                transform: `translateX(${cardX}px)`,
                background: isSent ? `${colors.success}08` : colors.bgCard,
                borderRadius: 20,
                padding: "24px 28px",
                border: `1px solid ${isSent ? `${colors.success}30` : colors.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <span style={{ fontFamily: fontBody, fontSize: 17, fontWeight: 600, color: colors.text }}>{draft.to}</span>
                  <span style={{ fontFamily: fontBody, fontSize: 14, color: colors.textMuted, marginLeft: 12 }}>{draft.subject}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {isSent ? (
                    <div style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: colors.success, display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Sent
                    </div>
                  ) : isApproving ? (
                    <div style={{ position: "relative" }}>
                      <div style={{ opacity: 1 - checkOp, display: "flex", gap: 8 }}>
                        <div style={{ background: colors.bgLight, borderRadius: 10, padding: "8px 16px", fontFamily: fontBody, fontSize: 13, fontWeight: 500, color: colors.textMuted }}>Edit</div>
                        <div style={{ background: colors.accent, borderRadius: 10, padding: "8px 16px", fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: colors.bg }}>Approve</div>
                      </div>
                      <div style={{ opacity: checkOp, transform: `scale(${checkScale})`, position: "absolute", right: 0, top: 0, fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: colors.success, display: "flex", alignItems: "center", gap: 6, height: "100%" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Approved!
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ background: colors.bgLight, borderRadius: 10, padding: "8px 16px", fontFamily: fontBody, fontSize: 13, fontWeight: 500, color: colors.textMuted }}>Edit</div>
                      <div style={{ background: colors.accent, borderRadius: 10, padding: "8px 16px", fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: colors.bg }}>Approve</div>
                    </div>
                  )}
                </div>
              </div>
              <p style={{ fontFamily: fontBody, fontSize: 15, color: colors.textMuted, margin: 0, lineHeight: 1.5 }}>
                {draft.preview}
              </p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
