import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { format, addDays, isBefore, startOfDay, setHours, setMinutes } from "date-fns";
import { CalendarDays, Clock, ChevronUp, ChevronDown } from "lucide-react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  labelClassName?: string;
  className?: string;
  testId?: string;
}

const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const h = hour.toString().padStart(2, '0');
      const m = minute.toString().padStart(2, '0');
      slots.push(`${h}:${m}`);
    }
  }
  return slots;
};

const timeSlots = generateTimeSlots();

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
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        setSelectedDate(date);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = (Math.floor(date.getMinutes() / 15) * 15).toString().padStart(2, '0');
        setSelectedTime(`${hours}:${minutes}`);
        
        const tomorrow = startOfDay(addDays(new Date(), 1));
        if (date >= tomorrow) {
          setShowFutureDate(true);
        }
      }
    }
  }, []);

  const updateDateTime = (date: Date | undefined, time: string) => {
    if (!date || !time) return;
    
    const [hours, minutes] = time.split(':').map(Number);
    const newDate = setMinutes(setHours(date, hours), minutes);
    
    const now = new Date();
    if (isBefore(newDate, now)) {
      return;
    }
    
    const localISOString = format(newDate, "yyyy-MM-dd'T'HH:mm");
    onChange(localISOString);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    if (selectedTime) {
      updateDateTime(date, selectedTime);
    }
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    const dateToUse = selectedDate || (showFutureDate ? undefined : new Date());
    if (dateToUse) {
      updateDateTime(dateToUse, time);
    }
  };

  const handleFutureDateToggle = (enabled: boolean) => {
    setShowFutureDate(enabled);
    if (!enabled) {
      setSelectedDate(new Date());
      if (selectedTime) {
        updateDateTime(new Date(), selectedTime);
      }
    }
  };

  const today = startOfDay(new Date());
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const isTimeDisabled = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const dateToCheck = selectedDate || new Date();
    const timeDate = setMinutes(setHours(dateToCheck, hours), minutes);
    return isBefore(timeDate, now);
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
              <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto p-1 border rounded-md">
                {timeSlots.map((time) => {
                  const disabled = !showFutureDate || 
                    (selectedDate && startOfDay(selectedDate).getTime() === today.getTime())
                    ? isTimeDisabled(time) 
                    : false;
                  
                  return (
                    <Button
                      key={time}
                      variant={selectedTime === time ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "text-xs",
                        disabled && "opacity-40 cursor-not-allowed line-through"
                      )}
                      onClick={() => !disabled && handleTimeSelect(time)}
                      disabled={disabled}
                      data-testid={`${testId}-time-${time.replace(':', '')}`}
                    >
                      {time}
                    </Button>
                  );
                })}
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
