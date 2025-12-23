import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, addDays, isBefore, startOfDay, setHours, setMinutes, isToday, isTomorrow } from "date-fns";
import { Clock } from "lucide-react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  labelClassName?: string;
  className?: string;
  testId?: string;
  compact?: boolean;
}

export function DateTimePicker({ 
  value, 
  onChange, 
  label,
  labelClassName,
  className,
  testId,
  compact = false,
}: DateTimePickerProps) {
  const [timeInput, setTimeInput] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [timeError, setTimeError] = useState<string>("");
  const [pendingDateTime, setPendingDateTime] = useState<Date | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        setTimeInput(`${hours}:${minutes}`);
      }
    }
  }, []);

  const calculateDateTime = (time: string): Date | null => {
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) return null;
    
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    
    // Get fresh timestamps at validation time
    const currentNow = new Date();
    const currentToday = startOfDay(currentNow);
    const currentTomorrow = startOfDay(addDays(currentNow, 1));
    
    // Try today first
    let dateTime = setMinutes(setHours(currentToday, hours), minutes);
    
    // If time is in the past, try tomorrow
    if (isBefore(dateTime, currentNow)) {
      dateTime = setMinutes(setHours(currentTomorrow, hours), minutes);
    }
    
    // Always allow times within 24 hours - no strict cutoff needed
    // since we already ensure it's either today (future) or tomorrow
    if (isBefore(dateTime, currentNow)) {
      return null;
    }
    
    return dateTime;
  };

  const now = new Date();

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value;
    setTimeInput(time);
    setTimeError("");
    
    if (!time.match(/^\d{1,2}:\d{2}$/)) {
      return;
    }
    
    const dateTime = calculateDateTime(time);
    
    if (!dateTime) {
      setTimeError("Please enter a valid future time");
      return;
    }
    
    // If the time is tomorrow, show confirmation
    if (isTomorrow(dateTime)) {
      setPendingDateTime(dateTime);
      setShowConfirmDialog(true);
    } else {
      // Today - apply directly
      const localISOString = format(dateTime, "yyyy-MM-dd'T'HH:mm");
      onChange(localISOString);
    }
  };

  const confirmTomorrowSelection = () => {
    if (pendingDateTime) {
      const localISOString = format(pendingDateTime, "yyyy-MM-dd'T'HH:mm");
      onChange(localISOString);
    }
    setShowConfirmDialog(false);
    setPendingDateTime(null);
  };

  const cancelTomorrowSelection = () => {
    setShowConfirmDialog(false);
    setPendingDateTime(null);
    setTimeInput("");
  };

  const getDisplayValue = () => {
    if (!value) return "Select time";
    
    const date = new Date(value);
    if (isToday(date)) {
      return format(date, "HH:mm 'today'");
    } else if (isTomorrow(date)) {
      return format(date, "HH:mm 'tomorrow'");
    } else {
      return format(date, "EEE, d MMM 'at' HH:mm");
    }
  };

  const getMinTime = () => {
    const oneMinuteLater = new Date(now.getTime() + 60000);
    const hours = oneMinuteLater.getHours().toString().padStart(2, '0');
    const minutes = oneMinuteLater.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <>
      <div className={cn(compact ? "space-y-1" : "space-y-2", className)}>
        {label && (
          <label className={cn(compact ? "text-xs" : "text-sm", "font-medium text-muted-foreground", labelClassName)}>
            {label}
          </label>
        )}
        
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                compact ? "h-8 text-xs px-2" : "h-11",
                !value && "text-muted-foreground"
              )}
              data-testid={testId}
            >
              <Clock className={cn(compact ? "mr-1 h-3 w-3" : "mr-2 h-4 w-4")} />
              <span className="truncate">{getDisplayValue()}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Select departure time</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick any time within the next 24 hours
                </p>
              </div>

              <div className="space-y-2">
                <Input
                  type="time"
                  value={timeInput}
                  onChange={handleTimeChange}
                  className={cn(
                    "h-14 text-xl text-center font-mono",
                    timeError && "border-red-500 focus-visible:ring-red-500"
                  )}
                  data-testid={`${testId}-time-input`}
                />
                {timeError && (
                  <p className="text-xs text-red-500 text-center">{timeError}</p>
                )}
              </div>

              {value && (
                <div className="pt-2 border-t bg-muted/50 -mx-4 px-4 pb-0 -mb-4 rounded-b-lg">
                  <p className="text-sm text-center py-3">
                    <span className="text-muted-foreground">Departing: </span>
                    <span className="font-semibold text-foreground">
                      {isToday(new Date(value)) 
                        ? format(new Date(value), "HH:mm 'today'")
                        : isTomorrow(new Date(value))
                          ? format(new Date(value), "HH:mm 'tomorrow' (EEE, d MMM)")
                          : format(new Date(value), "EEEE, d MMMM 'at' HH:mm")
                      }
                    </span>
                  </p>
                </div>
              )}

              <Button 
                className="w-full" 
                onClick={() => setIsOpen(false)}
                disabled={!value}
              >
                Confirm
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tomorrow's ride?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDateTime && (
                <>
                  You selected <span className="font-semibold">{format(pendingDateTime, "HH:mm")}</span>. Your ride will be scheduled for tomorrow ({format(pendingDateTime, "EEEE, d MMMM")}).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelTomorrowSelection}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmTomorrowSelection}>
              Yes, book for tomorrow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
