import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountdownChipProps {
  expiresAt: string | Date | null | undefined;
  onExpire?: () => void;
  prefix?: string;
  className?: string;
  testId?: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CountdownChip({ expiresAt, onExpire, prefix, className, testId }: CountdownChipProps) {
  const [now, setNow] = useState(() => Date.now());
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : null;

  useEffect(() => {
    if (!expiresMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresMs]);

  useEffect(() => {
    if (!expiresMs) return;
    if (now >= expiresMs && onExpire) onExpire();
  }, [now, expiresMs, onExpire]);

  if (!expiresMs) return null;
  const remaining = expiresMs - now;
  const expired = remaining <= 0;
  const urgent = !expired && remaining < 60_000;

  return (
    <Badge
      variant="outline"
      data-testid={testId}
      className={cn(
        "gap-1 text-[10px] font-mono",
        expired && "border-muted text-muted-foreground",
        !expired && !urgent && "border-amber-500 text-amber-600 dark:text-amber-400",
        urgent && "border-red-500 text-red-600 dark:text-red-400 animate-pulse",
        className,
      )}
    >
      <Clock className="h-2.5 w-2.5" />
      {expired ? "expired" : `${prefix ?? ""}${formatRemaining(remaining)}`}
    </Badge>
  );
}
