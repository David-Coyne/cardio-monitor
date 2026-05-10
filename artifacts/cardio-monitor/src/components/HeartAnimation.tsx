import { motion } from "framer-motion";

export function HeartAnimation() {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <motion.svg
        width="120"
        height="160"
        viewBox="0 0 100 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={{
          scale: [1, 0.9, 1.05, 1],
          filter: [
            "drop-shadow(0 0 4px rgba(220, 20, 60, 0.4))",
            "drop-shadow(0 0 12px rgba(220, 20, 60, 0.8))",
            "drop-shadow(0 0 8px rgba(220, 20, 60, 0.6))",
            "drop-shadow(0 0 4px rgba(220, 20, 60, 0.4))",
          ]
        }}
        transition={{
          duration: 0.833, // 72 bpm = 833ms
          ease: "easeInOut",
          repeat: Infinity,
          times: [0, 0.15, 0.3, 1]
        }}
        className="text-rose-600"
      >
        {/* Superior Vena Cava */}
        <path d="M30 20 L30 40 L40 40 L40 20 Z" fill="currentColor" opacity="0.8" />
        {/* Aorta */}
        <path d="M45 10 C 45 10, 65 5, 70 30 L55 35 C 55 20, 45 20, 45 20 Z" fill="currentColor" opacity="0.9" />
        {/* Pulmonary Artery */}
        <path d="M60 25 L80 15 L85 25 L65 35 Z" fill="currentColor" opacity="0.8" />
        {/* Right Atrium */}
        <path d="M25 40 C 15 50, 15 70, 30 75 L45 60 L45 40 Z" fill="currentColor" />
        {/* Left Atrium */}
        <path d="M70 30 C 85 35, 90 50, 80 60 L60 55 L55 35 Z" fill="currentColor" />
        {/* Right Ventricle */}
        <path d="M30 75 C 25 90, 35 110, 50 120 L60 80 L45 60 Z" fill="currentColor" />
        {/* Left Ventricle */}
        <path d="M50 120 C 70 125, 90 90, 80 60 L60 80 Z" fill="currentColor" />
        
        {/* Dividers / detail lines */}
        <path d="M45 60 L60 80" stroke="#4c0519" strokeWidth="2" />
        <path d="M45 40 L45 60" stroke="#4c0519" strokeWidth="2" />
        <path d="M70 30 L60 55 L80 60" stroke="#4c0519" strokeWidth="2" fill="none" />
      </motion.svg>
      <div className="mt-4 text-xs font-mono text-gray-400 flex flex-col items-center">
        <span>Anatomical Heart</span>
        <span>72 BPM</span>
      </div>
    </div>
  );
}
