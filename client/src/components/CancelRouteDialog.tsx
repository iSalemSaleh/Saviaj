import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useUserMoneyFormatter } from "@/hooks/useUserMoney";

interface AffectedBooking {
  id: number;
  riderName?: string | null;
  agreedPrice?: string | number | null;
}

interface CancelRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeLabel?: string;
  bookings: AffectedBooking[];
  onConfirm: () => void;
  isSubmitting?: boolean;
}

export default function CancelRouteDialog({
  open,
  onOpenChange,
  routeLabel,
  bookings,
  onConfirm,
  isSubmitting,
}: CancelRouteDialogProps) {
  const money = useUserMoneyFormatter();
  const [typed, setTyped] = useState("");
  const totalRefund = bookings.reduce((sum, b) => sum + parseFloat(String(b.agreedPrice ?? 0)), 0);
  const integrityFee = bookings.length * 2; // £2 per booking (queued, not charged in v1)
  const canConfirm = typed.trim().toUpperCase() === "CANCEL" && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSubmitting) { setTyped(""); onOpenChange(v); } }}>
      <DialogContent className="max-w-md" data-testid="dialog-cancel-route">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Cancel published route?
          </DialogTitle>
          <DialogDescription>
            {routeLabel ? <>Cancelling <span className="font-medium">{routeLabel}</span>. </> : null}
            This is final and notifies every booked rider.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2 my-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Affected riders</span>
            <span className="font-medium" data-testid="text-cancel-impact-bookings">{bookings.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total refunded</span>
            <span className="font-medium" data-testid="text-cancel-impact-refund">{money.formatMajor(totalRefund)}</span>
          </div>
          {bookings.length > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-amber-600">Platform integrity charge</span>
              <span className="font-medium text-amber-600" data-testid="text-cancel-impact-fee">£{integrityFee.toFixed(2)}</span>
            </div>
          )}
        </div>

        {bookings.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              Type <span className="font-mono font-bold">CANCEL</span> to confirm.
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="CANCEL"
              data-testid="input-cancel-route-confirm"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} data-testid="button-cancel-route-back">
            Keep route
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={bookings.length > 0 ? !canConfirm : isSubmitting}
            data-testid="button-cancel-route-confirm"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel route"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
