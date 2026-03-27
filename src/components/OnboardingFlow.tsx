import { useState } from "react";
import { OnboardingWelcome } from "@/components/onboarding/OnboardingWelcome";
import { OnboardingNameAgent } from "@/components/onboarding/OnboardingNameAgent";
import { OnboardingNewsCategories } from "@/components/onboarding/OnboardingNewsCategories";
import { OnboardingPreferences } from "@/components/onboarding/OnboardingPreferences";
import { OnboardingConnect } from "@/components/onboarding/OnboardingConnect";
import { OnboardingReady } from "@/components/onboarding/OnboardingReady";

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TOTAL_STEPS = 6;

export const OnboardingFlow = ({ onComplete, onSkip }: OnboardingFlowProps) => {
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-10">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-8 bg-accent" : i < step ? "w-4 bg-accent/40" : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 0 && <OnboardingWelcome onNext={next} onSkip={onSkip} />}
        {step === 1 && <OnboardingNameAgent onNext={next} onBack={back} onSkip={onSkip} />}
        {step === 2 && <OnboardingNewsCategories onNext={next} onBack={back} onSkip={onSkip} />}
        {step === 3 && <OnboardingPreferences onNext={next} onBack={back} onSkip={onSkip} />}
        {step === 4 && <OnboardingConnect onNext={next} onBack={back} onSkip={onSkip} />}
        {step === 5 && <OnboardingReady onComplete={onComplete} />}
      </div>
    </div>
  );
};
