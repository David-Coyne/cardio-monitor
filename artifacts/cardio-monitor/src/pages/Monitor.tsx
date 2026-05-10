import { useMemo } from "react";
import { WaveformCanvas } from "@/components/WaveformCanvas";
import { HeartAnimation } from "@/components/HeartAnimation";

// Helper to generate a Gaussian bump
const gaussian = (x: number, center: number, width: number, height: number) => {
  return height * Math.exp(-Math.pow(x - center, 2) / (2 * Math.pow(width, 2)));
};

export default function Monitor() {
  const SAMPLES = 900; // 15 seconds at 60fps
  const BEATS = 18; // 72 bpm for 15 seconds
  const SAMPLES_PER_BEAT = SAMPLES / BEATS;

  const { ecgData, abpData, coData } = useMemo(() => {
    const ecg = new Array(SAMPLES).fill(0);
    const abp = new Array(SAMPLES).fill(0);
    const co = new Array(SAMPLES).fill(0);

    for (let i = 0; i < SAMPLES; i++) {
      const beatProgress = (i % SAMPLES_PER_BEAT) / SAMPLES_PER_BEAT;
      
      // ECG generation
      let ecgVal = 0;
      // P wave
      ecgVal += gaussian(beatProgress, 0.15, 0.02, 0.15);
      // QRS complex
      ecgVal += gaussian(beatProgress, 0.28, 0.005, -0.15); // Q
      ecgVal += gaussian(beatProgress, 0.30, 0.008, 1.0);  // R
      ecgVal += gaussian(beatProgress, 0.32, 0.006, -0.25); // S
      // T wave
      ecgVal += gaussian(beatProgress, 0.55, 0.04, 0.25);
      ecg[i] = ecgVal;

      // ABP generation (starts rising after QRS)
      let abpVal = 80; // Baseline diastolic
      if (beatProgress > 0.32 && beatProgress < 0.8) {
        // Systolic upstroke and peak
        abpVal += gaussian(beatProgress, 0.45, 0.05, 40);
        // Dicrotic notch
        if (beatProgress > 0.55 && beatProgress < 0.6) {
          abpVal -= 5;
        }
        // Diastolic runoff
        abpVal += gaussian(beatProgress, 0.65, 0.08, 15);
      }
      abp[i] = abpVal;

      // CO generation
      let coVal = 0;
      if (beatProgress > 0.35 && beatProgress < 0.7) {
        coVal = gaussian(beatProgress, 0.5, 0.08, 5.0);
      }
      co[i] = coVal;
    }

    return { ecgData: ecg, abpData: abp, coData: co };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0e14] text-white p-4 font-mono select-none">
      <header className="flex justify-between items-end mb-4 border-b border-gray-800 pb-2">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-gray-300">CLINICAL MONITOR</h1>
          <div className="text-xs text-gray-500">ICU BED 04 - ADULT</div>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-end">
            <span className="text-gray-500">SpO2</span>
            <span className="text-2xl font-bold text-cyan-100">98%</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-gray-500">RR</span>
            <span className="text-2xl font-bold text-white">14</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-100px)]">
        {/* Waveforms Column */}
        <div className="col-span-9 flex flex-col gap-4">
          <div className="flex-1">
            <WaveformCanvas 
              data={ecgData} 
              color="#00ff41" 
              label="ECG II" 
              value="72" 
              unit="bpm" 
              minY={-0.5} 
              maxY={1.5} 
            />
          </div>
          <div className="flex-1">
            <WaveformCanvas 
              data={abpData} 
              color="#ffd700" 
              label="ABP" 
              value="120/80" 
              unit="(93)" 
              minY={60} 
              maxY={140} 
            />
          </div>
          <div className="flex-1">
            <WaveformCanvas 
              data={coData} 
              color="#00e5ff" 
              label="CO" 
              value="5.0" 
              unit="L/min" 
              minY={0} 
              maxY={6} 
            />
          </div>
        </div>

        {/* Side Panel Column */}
        <div className="col-span-3 flex flex-col gap-4">
          <div className="bg-[#0a0e14] border border-gray-800 rounded p-4 flex-1 flex flex-col justify-center">
            <HeartAnimation />
          </div>
          
          <div className="bg-[#111822] border border-gray-800 rounded p-4 flex-1">
            <h2 className="text-sm text-gray-400 mb-4 border-b border-gray-700 pb-1">EDUCATIONAL LABELS</h2>
            <div className="space-y-4 text-xs text-gray-300">
              <div>
                <strong className="text-[#00ff41]">ECG (Green)</strong>
                <ul className="mt-1 space-y-1 ml-2 list-disc list-inside">
                  <li>P wave: Atrial depolarization</li>
                  <li>QRS: Ventricular depolarization</li>
                  <li>T wave: Ventricular repolarization</li>
                </ul>
              </div>
              <div>
                <strong className="text-[#ffd700]">ABP (Yellow)</strong>
                <ul className="mt-1 space-y-1 ml-2 list-disc list-inside">
                  <li>Rapid upstroke: Systole</li>
                  <li>Dicrotic notch: Aortic valve closure</li>
                  <li>Runoff: Diastole</li>
                </ul>
              </div>
              <div>
                <strong className="text-[#00e5ff]">CO (Cyan)</strong>
                <ul className="mt-1 space-y-1 ml-2 list-disc list-inside">
                  <li>Stroke volume per beat</li>
                  <li>Total ~5.0 L/min at rest</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
