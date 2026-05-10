import { motion } from "framer-motion";

export function HeartAnimation() {
  const transitionProps = {
    duration: 0.833,
    ease: "easeInOut" as const,
    repeat: Infinity,
  };

  const laTimes = [0, 0.12, 0.22, 0.28, 0.38, 0.75, 1.0];
  const raTimes = [0, 0.10, 0.20, 0.27, 0.37, 0.72, 1.0];
  const ventTimes = [0, 0.12, 0.28, 0.38, 0.45, 0.56, 0.78, 1.0];

  return (
    <div className="flex flex-col items-center">
      <motion.svg
        width="160"
        height="176"
        viewBox="0 0 200 220"
        className="overflow-visible"
        animate={{
          filter: [
            "drop-shadow(0 0 4px rgba(231,76,60,0.3))",
            "drop-shadow(0 0 4px rgba(231,76,60,0.3))",
            "drop-shadow(0 0 6px rgba(231,76,60,0.5))",
            "drop-shadow(0 0 16px rgba(231,76,60,0.9))",
            "drop-shadow(0 0 20px rgba(231,76,60,1.0))",
            "drop-shadow(0 0 10px rgba(231,76,60,0.6))",
            "drop-shadow(0 0 4px rgba(231,76,60,0.3))",
            "drop-shadow(0 0 4px rgba(231,76,60,0.3))",
          ],
        }}
        transition={{ ...transitionProps, times: ventTimes }}
      >
        <defs>
          <radialGradient id="lv-gradient" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ff7675" />
            <stop offset="100%" stopColor="#e74c3c" />
          </radialGradient>
        </defs>

        {/* --- Great Vessels (Subtly animated or static) --- */}
        {/* Superior Vena Cava */}
        <path
          d="M 120,15 C 120,30 125,45 130,55 C 140,45 140,30 140,15 Z"
          fill="#5a1812"
          stroke="#3e110d"
          strokeWidth="1.5"
        />
        {/* Inferior Vena Cava */}
        <path
          d="M 125,120 C 125,135 125,145 130,155 C 140,145 140,135 140,120 Z"
          fill="#5a1812"
          stroke="#3e110d"
          strokeWidth="1.5"
        />
        {/* Pulmonary Trunk */}
        <path
          d="M 110,80 C 100,50 80,40 55,45 C 55,30 80,25 110,50 C 130,40 140,50 140,65 Z"
          fill="#962d22"
          stroke="#7b241c"
          strokeWidth="1.5"
        />
        {/* Aortic Arch */}
        <path
          d="M 85,60 C 85,20 120,15 130,40 C 140,60 140,80 135,90 C 120,80 115,50 105,45 C 95,40 90,45 90,60 Z"
          fill="#e74c3c"
          stroke="#cb4335"
          strokeWidth="1.5"
        />

        {/* --- Chambers --- */}
        
        {/* LA (Left Atrium) */}
        <motion.g
          style={{ transformOrigin: "72px 70px" }}
          animate={{ scale: [1.0, 1.0, 0.82, 0.88, 1.0, 1.04, 1.0] }}
          transition={{ ...transitionProps, times: laTimes }}
        >
          <path
            d="M 50,65 C 50,45 85,45 90,65 C 90,85 75,95 65,95 C 50,95 50,85 50,65 Z"
            fill="#c0392b"
            stroke="#922b21"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* RA (Right Atrium) */}
        <motion.g
          style={{ transformOrigin: "128px 70px" }}
          animate={{ scale: [1.0, 1.0, 0.83, 0.89, 1.0, 1.03, 1.0] }}
          transition={{ ...transitionProps, times: raTimes }}
        >
          <path
            d="M 105,65 C 105,40 150,40 155,65 C 155,85 135,95 120,95 C 105,95 105,85 105,65 Z"
            fill="#7b241c"
            stroke="#641e16"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* RV (Right Ventricle) */}
        <motion.g
          style={{ transformOrigin: "128px 145px" }}
          animate={{ scale: [1.0, 1.0, 1.0, 0.84, 0.82, 0.90, 1.01, 1.0] }}
          transition={{ ...transitionProps, times: ventTimes }}
        >
          <path
            d="M 95,95 C 110,85 150,95 150,145 C 150,175 125,190 105,200 C 105,160 95,130 95,95 Z"
            fill="#962d22"
            stroke="#7b241c"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* LV (Left Ventricle) */}
        <motion.g
          style={{ transformOrigin: "75px 155px" }}
          animate={{
            scale: [1.0, 1.0, 1.0, 0.80, 0.78, 0.86, 1.02, 1.0],
            fill: [
              "url(#lv-gradient)",
              "url(#lv-gradient)",
              "url(#lv-gradient)",
              "#ff6b6b",
              "#ff4040",
              "url(#lv-gradient)",
              "url(#lv-gradient)",
              "url(#lv-gradient)",
            ],
          }}
          transition={{ ...transitionProps, times: ventTimes }}
        >
          <path
            d="M 55,95 C 35,120 45,185 95,210 C 100,185 100,120 85,95 C 75,85 65,85 55,95 Z"
            stroke="#cb4335"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* --- Septa --- */}
        {/* Interatrial septum */}
        <path d="M 90,65 C 95,75 100,85 105,95" stroke="#4a1511" strokeWidth="2" fill="none" opacity="0.6" />
        {/* Interventricular septum */}
        <path d="M 95,95 C 90,130 95,170 95,210" stroke="#4a1511" strokeWidth="2" fill="none" opacity="0.6" />

        {/* --- Labels --- */}
        <g fontSize="7" fontFamily="monospace" fill="#ffffff" opacity="0.9">
          <text x="30" y="70">LA</text>
          <line x1="42" y1="68" x2="52" y2="68" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />

          <text x="165" y="70">RA</text>
          <line x1="152" y1="68" x2="162" y2="68" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />

          <text x="25" y="155">LV</text>
          <line x1="37" y1="153" x2="55" y2="153" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />

          <text x="165" y="155">RV</text>
          <line x1="145" y1="153" x2="162" y2="153" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />

          <text x="110" y="25">Ao</text>
          <line x1="108" y1="28" x2="103" y2="45" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />

          <text x="50" y="30">PA</text>
          <line x1="56" y1="33" x2="70" y2="45" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />
        </g>
      </motion.svg>
      
      <div className="text-xs font-mono text-gray-500 mt-1">
        72 BPM · SINUS RHYTHM
      </div>
    </div>
  );
}
