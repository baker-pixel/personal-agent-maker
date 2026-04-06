import { motion } from "framer-motion";

interface VoiceWaveformProps {
  isActive: boolean;
  barCount?: number;
  className?: string;
}

export function VoiceWaveform({ isActive, barCount = 5, className = "" }: VoiceWaveformProps) {
  if (!isActive) return null;

  return (
    <div className={`flex items-center gap-[3px] h-6 ${className}`}>
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-destructive"
          animate={{
            height: ["6px", `${12 + Math.random() * 12}px`, "6px"],
          }}
          transition={{
            duration: 0.5 + Math.random() * 0.3,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  );
}
