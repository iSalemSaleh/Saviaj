import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { format, addDays, isBefore, startOfDay, setHours, setMinutes } from "date-fns";
import { CalendarDays, Clock } from "lucide-react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  labelClassName?: string;
  className?: string;
  testId?: string;
}

export function DateTimePicker({ 
  value, 
  onChange, 
  label,
  labelClassName,
  className,
  testId 
}: DateTimePickerProps) {
  const [showFutureDate, setShowFutureDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [timeInput, setTimeInput] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [timeError, setTimeError] = useState<string>("");

  useEffect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        setSelectedDate(date);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        setTimeInput(`${hours}:${minutes}`);
        
        const tomorrow = startOfDay(addDays(new Date(), 1));
        if (date >= tomorrow) {
          setShowFutureDate(true);
        }
      }
    }
  }, []);

  const validateAndUpdateDateTime = (date: Date | undefined, time: string) => {
    if (!date || !time) return false;
    
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      setTimeError("Use format HH:MM");
      return false;
    }
    
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      setTimeError("Invalid time");
      return false;
    }
    
    const newDate = setMinutes(setHours(date, hours), minutes);
    const now = new Date();
    
    if (isBefore(newDate, now)) {
      setTimeError("Time must be in the future");
      return false;
    }
    
    setTimeError("");
    const localISOString = format(newDate, "yyyy-MM-dd'T'HH:mm");
    onChange(localISOString);
    return true;
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    if (timeInput) {
      validateAndUpdateDateTime(date, timeInput);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value;
    setTimeInput(time);
    const dateToUse = selectedDate || (showFutureDate ? undefined : new Date());
    if (dateToUse && time.match(/^\d{1,2}:\d{2}$/)) {
      validateAndUpdateDateTime(dateToUse, time);
    }
  };

  const handleFutureDateToggle = (enabled: boolean) => {
    setShowFutureDate(enabled);
    if (!enabled) {
      setSelectedDate(new Date());
      if (timeInput) {
        validateAndUpdateDateTime(new Date(), timeInput);
      }
    }
  };

  const today = startOfDay(new Date());
  const now = new Date();

  const getMinTime = () => {
    if (!showFutureDate || (selectedDate && startOfDay(selectedDate).getTime() === today.getTime())) {
      const oneMinuteLater = new Date(now.getTime() + 60000);
      const hours = oneMinuteLater.getHours().toString().padStart(2, '0');
      const minutes = oneMinuteLater.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return "00:00";
  };

  const displayValue = value 
    ? format(new Date(value), showFutureDate ? "EEE, d MMM 'at' HH:mm" : "HH:mm 'today'")
    : "Select time";

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className={cn("text-sm font-medium text-muted-foreground", labelClassName)}>
          {label}
        </label>
      )}
      
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-11",
              !value && "text-muted-foreground"
            )}
            data-testid={testId}
          >
            <Clock className="mr-2 h-4 w-4" />
            {displayValue}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Pick a future date</span>
              </div>
              <Switch
                checked={showFutureDate}
                onCheckedChange={handleFutureDateToggle}
                data-testid={`${testId}-future-toggle`}
              />
            </div>

            {showFutureDate && (
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={(date) => isBefore(date, today)}
                className="rounded-md border"
              />
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {showFutureDate && selectedDate 
                    ? `Time on ${format(selectedDate, 'EEE, d MMM')}`
                    : "Time today"
                  }
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <Input
                  type="time"
                  value={timeInput}
                  onChange={handleTimeChange}
                  min={getMinTime()}
                  className={cn(
                    "h-12 text-lg text-center font-mono",
                    timeError && "border-red-500 focus-visible:ring-red-500"
                  )}
                  data-testid={`${testId}-time-input`}
                />
                {timeError && (
                  <p className="text-xs text-red-500 text-center">{timeError}</p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Enter any time (e.g., 14:30)
                </p>
              </div>
            </div>

            {value && (
              <div className="pt-2 border-t">
                <p className="text-sm text-center text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">
                    {format(new Date(value), "EEEE, d MMMM 'at' HH:mm")}
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
  );
}
