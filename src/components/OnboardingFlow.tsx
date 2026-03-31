import { useState } from "react";
import { OnboardingWelcome } from "@/components/onboarding/OnboardingWelcome";
import { OnboardingNameAgent } from "@/components/onboarding/OnboardingNameAgent";
import { OnboardingConnect } from "@/components/onboarding/OnboardingConnect";

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TOTAL_STEPS = 3;

export const OnboardingFlow = ({ onComplete, onSkip }: OnboardingFlowProps) => {
  const [step, setStep] = useState(0);

  const next = () => {
    if (step >= TOTAL_STEPS - 1) {
      onComplete();
      return;
    }
    setStep((s) => s + 1);
  };

  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6 overflow-y-auto">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-accent/[0.04] blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl translate-y-1/3 -translate-x-1/4" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Step indicator */}
        <div className="flex justify-center gap-2 mb-10">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ${
                i === step
                  ? "w-10 bg-accent"
                  : i < step
                  ? "w-6 bg-accent/30"
                  : "w-6 bg-muted/60"
              }`}
            />
          ))}
        </div>

        {/* Step label */}
        <p className="text-center text-xs font-medium text-muted-foreground/50 uppercase tracking-widest mb-6">
          Step {step + 1} of {TOTAL_STEPS}
        </p>

        {step === 0 && <OnboardingWelcome onNext={next} onSkip={onSkip} />}
        {step === 1 && <OnboardingNameAgent onNext={next} onBack={back} onSkip={onSkip} />}
        {step === 2 && <OnboardingConnect onNext={next} onBack={back} onSkip={onSkip} />}
      </div>
    </div>
  );
};
