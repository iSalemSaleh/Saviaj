import { useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getCurrentPosition } from "@/lib/nativeGeolocation";

interface SosButtonProps {
  rideId?: number;
  className?: string;
}

const HOLD_MS = 2000;

export default function SosButton({ rideId, className }: SosButtonProps) {
  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const [firing, setFiring] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const cancel = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startedRef.current = null;
    setProgress(0);
  };

  const start = () => {
    if (firing) return;
    startedRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - (startedRef.current ?? Date.now());
      const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
      setProgress(pct);
      if (elapsed >= HOLD_MS) {
        cancel();
        void fire();
      }
    }, 50);
  };

  const fire = async () => {
    setFiring(true);
    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // location not critical — server will still record the SOS
    }
    try {
      await apiRequest("POST", "/api/sos", { rideId, lat, lng });
      toast({
        title: "SOS sent",
        description: "Saviaj safety has been notified. Stay on the line if you can.",
      });
    } catch (err: any) {
      toast({
        title: "Could not send SOS",
        description: err?.message || "Please try again or call 999 directly.",
        variant: "destructive",
      });
    } finally {
      setFiring(false);
    }
  };

  return (
    <button
      type="button"
      data-testid="button-sos"
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={start}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      disabled={firing}
      className={`relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border-2 border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition active:scale-95 disabled:opacity-60 ${className ?? ""}`}
      aria-label="SOS — hold for 2 seconds to alert Saviaj safety"
    >
      <span
        className="absolute inset-y-0 left-0 bg-red-800 transition-[width]"
        style={{ width: `${progress}%` }}
        aria-hidden
      />
      <ShieldAlert className="relative h-4 w-4" />
      <span className="relative">{firing ? "Sending…" : progress > 0 ? "Hold…" : "SOS"}</span>
    </button>
  );
}
