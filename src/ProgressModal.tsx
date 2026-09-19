import { useEffect, useState } from "react";

// Ported from the web app's own ProgressModal.tsx — full-screen blocking overlay shown during a
// heavy export, with the exact same spinner/progress treatment (smoothed RAF interpolation, ring +
// tank-fill, cancel-with-confirm). Two token substitutions only: web's glow gradient references
// --color-coral/--color-lime, which don't exist in this app's (smaller) palette — swapped for
// --color-amber/--color-rose, the closest equivalents already defined in src/index.css.
export function ProgressModal({
  label,
  pct,
  onCancel,
  onBackground,
}: {
  label: string;
  pct: number;
  onCancel: () => void;
  onBackground?: () => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const target = Math.max(0, Math.min(100, pct));
  const [displayedPct, setDisplayedPct] = useState(target);
  useEffect(() => {
    const CREEP_CEILING_AHEAD = 4;
    let rafId: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setDisplayedPct((prev) => {
        if (target < prev - 5) return target;
        const ceiling = target >= 100 ? 100 : Math.min(99.5, target + CREEP_CEILING_AHEAD);
        if (prev < target) {
          const catchUp = (target - prev) * (1 - Math.exp(-dt / 0.9));
          return Math.min(target, prev + Math.max(0.75 * dt, catchUp));
        }
        if (prev < ceiling) return Math.min(ceiling, prev + 0.25 * dt);
        return prev;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target]);
  const clamped = displayedPct;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(20,24,20,0.55)" }}>
      <div className="relative w-64 rounded-3xl overflow-hidden shadow-sheet" style={{ background: "#201f33" }}>
        <div className="absolute inset-x-0 bottom-0" style={{ height: `${clamped}%`, background: "#1f4d36" }} />
        {!confirmingCancel && (
          <button
            onClick={() => setConfirmingCancel(true)}
            aria-label="ביטול הפעולה"
            className="absolute top-3 left-3 z-10 h-7 w-7 rounded-full flex items-center justify-center bg-rose text-white"
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {confirmingCancel ? (
          <div className="relative flex flex-col items-center gap-4 px-6 py-9 text-white text-center">
            <div className="text-sm font-semibold">לבטל את הפעולה?</div>
            <div className="text-xs opacity-70">{label} עדיין באמצע — הביטול לא ניתן לשחזור.</div>
            <div className="flex gap-2 w-full mt-2">
              <button onClick={() => setConfirmingCancel(false)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white/10">
                המשך
              </button>
              <button onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-rose text-white">
                ביטול הפעולה
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-4 px-6 py-9 text-white text-center">
            <div className="relative" style={{ width: 112, height: 112 }}>
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full"
                style={{
                  background: "conic-gradient(from 180deg, var(--color-rose), var(--color-amber), var(--color-amber-bg), var(--color-rose))",
                  filter: "blur(20px)",
                  opacity: 0.55,
                }}
              />
              <svg viewBox="0 0 100 100" width={112} height={112} style={{ position: "relative", transform: "rotate(-90deg)" }}>
                <circle cx={50} cy={50} r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={8} />
                <circle
                  cx={50}
                  cy={50}
                  r={radius}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
                <text x={50} y={51} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={700} fill="#fff" style={{ transform: "rotate(90deg)", transformOrigin: "50px 50px" }}>
                  {clamped.toFixed(2)}%
                </text>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold">המערכת מבצעת {label}</div>
              <div className="text-xs opacity-70 mt-1">החלון ייסגר אוטומטית בסיום הפעולה</div>
            </div>
            {onBackground && (
              <button onClick={onBackground} className="text-xs font-semibold underline underline-offset-2 opacity-80">
                המשך ברקע
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
