import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2 } from "lucide-react";

interface GeofenceConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distanceMeters?: number | null;
  onConfirm: (reason: string) => void;
  isSubmitting?: boolean;
}

const PRESET_REASONS = [
  "Rider asked to be dropped here",
  "Road closed / detour",
  "Address pin was incorrect",
  "Safer drop-off nearby",
  "Other",
];

export default function GeofenceConfirmDialog({
  open,
  onOpenChange,
  distanceMeters,
  onConfirm,
  isSubmitting,
}: GeofenceConfirmDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [other, setOther] = useState("");

  const reason = selected === "Other" ? other.trim() : (selected ?? "");
  const canSubmit = reason.length > 0 && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSubmitting) onOpenChange(v); }}>
      <DialogContent className="max-w-md" data-testid="dialog-geofence-confirm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            You're not at the dropoff yet
          </DialogTitle>
          <DialogDescription>
            Our system thinks you're still {distanceMeters != null ? `${Math.round(distanceMeters)} m` : "more than 200 m"} away from the planned dropoff.
            Why are you completing the trip here?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 my-2">
          {PRESET_REASONS.map((r) => (
            <Badge
              key={r}
              variant={selected === r ? "default" : "outline"}
              className="cursor-pointer text-xs py-1.5 px-3"
              onClick={() => setSelected(r)}
              data-testid={`chip-geofence-reason-${r.replace(/\s+/g, '-').toLowerCase()}`}
            >
              {r}
            </Badge>
          ))}
        </div>
        {selected === "Other" && (
          <Textarea
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Tell us briefly what happened…"
            maxLength={200}
            data-testid="input-geofence-other-reason"
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} data-testid="button-geofence-cancel">
            Not yet
          </Button>
          <Button onClick={() => onConfirm(reason)} disabled={!canSubmit} data-testid="button-geofence-confirm">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete trip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
