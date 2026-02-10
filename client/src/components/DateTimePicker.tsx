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
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { format, addDays, isBefore, startOfDay, setHours, setMinutes, isToday, isTomorrow, startOfToday } from "date-fns";
import { Clock, CalendarDays } from "lucide-react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  labelClassName?: string;
  className?: string;
  buttonClassName?: string;
  testId?: string;
  compact?: boolean;
}

export function DateTimePicker({ 
  value, 
  onChange, 
  label,
  labelClassName,
  className,
  buttonClassName,
  testId,
  compact = false,
}: DateTimePickerProps) {
  const [timeInput, setTimeInput] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [timeError, setTimeError] = useState<string>("");
  const [pendingDateTime, setPendingDateTime] = useState<Date | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        setTimeInput(`${hours}:${minutes}`);
        if (!isToday(date) && !isTomorrow(date)) {
          setSelectedDate(date);
          setShowCalendar(true);
        }
      }
    }
  }, [value]);

  const calculateDateTime = (time: string, customDate?: Date): Date | null => {
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) return null;
    
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    
    const currentNow = new Date();
    
    if (customDate) {
      const dateTime = setMinutes(setHours(startOfDay(customDate), hours), minutes);
      if (isBefore(dateTime, currentNow)) {
        return null;
      }
      return dateTime;
    }
    
    const currentToday = startOfDay(currentNow);
    const currentTomorrow = startOfDay(addDays(currentNow, 1));
    
    let dateTime = setMinutes(setHours(currentToday, hours), minutes);
    
    if (isBefore(dateTime, currentNow)) {
      dateTime = setMinutes(setHours(currentTomorrow, hours), minutes);
    }
    
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
    
    const dateTime = calculateDateTime(time, showCalendar ? selectedDate : undefined);
    
    if (!dateTime) {
      setTimeError("Please enter a valid future time");
      return;
    }
    
    if (!showCalendar && isTomorrow(dateTime)) {
      setPendingDateTime(dateTime);
      setShowConfirmDialog(true);
    } else {
      const localISOString = format(dateTime, "yyyy-MM-dd'T'HH:mm");
      onChange(localISOString);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    
    if (timeInput && timeInput.match(/^\d{1,2}:\d{2}$/)) {
      const dateTime = calculateDateTime(timeInput, date);
      if (dateTime) {
        const localISOString = format(dateTime, "yyyy-MM-dd'T'HH:mm");
        onChange(localISOString);
      } else {
        setTimeError("Please enter a valid future time for the selected date");
      }
    }
  };

  const handleCalendarToggle = (checked: boolean) => {
    setShowCalendar(checked);
    if (!checked) {
      setSelectedDate(undefined);
      if (timeInput && timeInput.match(/^\d{1,2}:\d{2}$/)) {
        const dateTime = calculateDateTime(timeInput);
        if (dateTime) {
          if (isTomorrow(dateTime)) {
            setPendingDateTime(dateTime);
            setShowConfirmDialog(true);
          } else {
            const localISOString = format(dateTime, "yyyy-MM-dd'T'HH:mm");
            onChange(localISOString);
          }
        }
      }
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
                "w-full justify-start text-left font-normal bg-white dark:bg-slate-900 border-gray-200",
                compact ? "h-8 text-xs px-2" : "h-11",
                !value && "text-muted-foreground",
                buttonClassName
              )}
              data-testid={testId}
            >
              <Clock className={cn(compact ? "mr-1 h-3 w-3" : "mr-2 h-4 w-4")} />
              <span className="truncate">{getDisplayValue()}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0 max-h-[70vh] overflow-y-auto" align="start">
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Select departure time</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 px-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Future dates</span>
                </div>
                <Switch
                  checked={showCalendar}
                  onCheckedChange={handleCalendarToggle}
                  data-testid={`${testId}-calendar-toggle`}
                />
              </div>

              {showCalendar && (
                <div className="bg-white dark:bg-slate-900 rounded-lg border">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    disabled={(date) => isBefore(date, startOfToday())}
                    className="w-full p-1"
                    classNames={{
                      months: "flex flex-col",
                      month: "space-y-1",
                      caption: "flex justify-center relative items-center h-7",
                      caption_label: "text-xs font-semibold",
                      nav: "space-x-1 flex items-center",
                      nav_button: "h-5 w-5 bg-transparent p-0 opacity-50 hover:opacity-100",
                      nav_button_previous: "absolute left-1",
                      nav_button_next: "absolute right-1",
                      table: "w-full border-collapse",
                      head_row: "flex justify-between",
                      head_cell: "text-muted-foreground w-7 font-medium text-[10px]",
                      row: "flex w-full justify-between",
                      cell: "h-7 w-7 text-center text-xs p-0 relative",
                      day: "h-7 w-7 p-0 text-xs font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md flex items-center justify-center",
                      day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                      day_today: "bg-accent text-accent-foreground",
                      day_outside: "text-muted-foreground opacity-50",
                      day_disabled: "text-muted-foreground opacity-50",
                      day_hidden: "invisible",
                    }}
                    data-testid={`${testId}-calendar`}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Time</label>
                <Input
                  type="time"
                  value={timeInput}
                  onChange={handleTimeChange}
                  className={cn(
                    "h-9 text-sm text-center font-mono bg-white dark:bg-slate-900",
                    timeError && "border-red-500 focus-visible:ring-red-500"
                  )}
                  data-testid={`${testId}-time-input`}
                />
                {timeError && (
                  <p className="text-xs text-red-500 text-center">{timeError}</p>
                )}
              </div>

              {value && (
                <div className="py-2 px-3 bg-primary/10 rounded-lg">
                  <p className="text-xs text-center">
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
                className="w-full h-8 text-sm" 
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
