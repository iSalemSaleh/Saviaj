import { Loader2 } from "lucide-react";

interface PullToRefreshIndicatorProps {
  isRefreshing: boolean;
  pullDistance: number;
  threshold?: number;
}

export function PullToRefreshIndicator({
  isRefreshing,
  pullDistance,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min(pullDistance / threshold, 1);
  const shouldShow = pullDistance > 0 || isRefreshing;

  if (!shouldShow) return null;

  return (
    <div
      className="absolute left-0 right-0 flex justify-center items-center pointer-events-none z-10"
      style={{
        top: -40,
        height: 40,
        opacity: isRefreshing ? 1 : progress,
      }}
    >
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full bg-background border shadow-sm ${
          isRefreshing ? "animate-spin" : ""
        }`}
        style={{
          transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)`,
        }}
      >
        <Loader2 className="h-4 w-4 text-primary" />
      </div>
    </div>
  );
}
