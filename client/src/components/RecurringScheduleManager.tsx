import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Pause, Play, Trash2, Loader2, Repeat, Clock, MapPin, ChevronDown, ChevronUp } from "lucide-react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface ScheduleEntry {
  id: number;
  dayOfWeek: number;
  departureTime: string;
  startLocation: string;
  endLocation: string;
  offerPrice?: string | null;
  pricePerSeat?: string | null;
  availableSeats?: number | null;
}

interface Schedule {
  id: number;
  userId: string;
  type: string;
  status: string;
  lastGeneratedDate: string | null;
  createdAt: string;
  entries: ScheduleEntry[];
}

export function RecurringScheduleManager({ type }: { type: "rider" | "driver" }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/recurring-schedules"],
  });

  const filteredSchedules = schedules.filter(s => s.type === type);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/recurring-schedules/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-routes"] });
      toast({ title: "Schedule updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/recurring-schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-routes"] });
      setConfirmDelete(null);
      toast({ title: "Schedule deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (filteredSchedules.length === 0) return null;

  const groupEntriesByRoute = (entries: ScheduleEntry[]) => {
    const groups: Record<string, ScheduleEntry[]> = {};
    for (const entry of entries) {
      const key = `${entry.startLocation}|${entry.endLocation}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    return groups;
  };

  return (
    <>
      <Card className="backdrop-blur-md bg-white/90 dark:bg-slate-800/90 border-white/20 shadow-lg">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full"
          data-testid="button-toggle-recurring"
        >
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs font-semibold flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Repeat className="h-3.5 w-3.5 text-primary" />
                <span>My Recurring {type === "rider" ? "Rides" : "Routes"}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">{filteredSchedules.length}</Badge>
              </div>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
        </button>
        {expanded && (
          <CardContent className="px-3 pb-3 pt-0 space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              filteredSchedules.map((schedule) => {
                const routeGroups = groupEntriesByRoute(schedule.entries);
                return (
                  <div
                    key={schedule.id}
                    className="rounded-lg bg-white/60 dark:bg-slate-700/60 border border-white/20 p-2 space-y-1.5"
                    data-testid={`recurring-schedule-${schedule.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={schedule.status === "active" ? "default" : "secondary"}
                        className="text-[10px] h-4"
                      >
                        {schedule.status}
                      </Badge>
                      <div className="flex items-center gap-1">
                        {schedule.status === "active" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => statusMutation.mutate({ id: schedule.id, status: "paused" })}
                            data-testid={`button-pause-schedule-${schedule.id}`}
                          >
                            <Pause className="h-3 w-3 text-amber-500" />
                          </Button>
                        ) : schedule.status === "paused" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => statusMutation.mutate({ id: schedule.id, status: "active" })}
                            data-testid={`button-resume-schedule-${schedule.id}`}
                          >
                            <Play className="h-3 w-3 text-green-500" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setConfirmDelete(schedule.id)}
                          data-testid={`button-delete-schedule-${schedule.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {Object.entries(routeGroups).map(([key, entries]) => {
                      const [start, end] = key.split("|");
                      const sortedEntries = [...entries].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
                      return (
                        <div key={key} className="space-y-0.5">
                          <div className="flex items-center gap-1 text-[11px]">
                            <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                            <span className="truncate">{start}</span>
                            <span className="text-muted-foreground mx-0.5">→</span>
                            <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                            <span className="truncate">{end}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sortedEntries.map((entry) => (
                              <Badge
                                key={entry.id}
                                variant="outline"
                                className="text-[10px] h-5 gap-0.5"
                              >
                                <CalendarDays className="h-2.5 w-2.5" />
                                {DAY_NAMES[entry.dayOfWeek]}
                                <Clock className="h-2.5 w-2.5 ml-0.5" />
                                {entry.departureTime}
                              </Badge>
                            ))}
                          </div>
                          {entries[0]?.offerPrice && (
                            <div className="text-[10px] text-muted-foreground">
                              £{parseFloat(entries[0].offerPrice).toFixed(2)} per trip
                            </div>
                          )}
                          {entries[0]?.pricePerSeat && (
                            <div className="text-[10px] text-muted-foreground">
                              £{parseFloat(entries[0].pricePerSeat).toFixed(2)}/seat · {entries[0].availableSeats} seats
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Schedule</DialogTitle>
            <DialogDescription className="text-xs">
              This will cancel all future trips from this schedule. Past and in-progress trips are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-schedule"
            >
              {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface DayPickerProps {
  selectedDays: number[];
  onToggleDay: (day: number) => void;
}

export function DayPicker({ selectedDays, onToggleDay }: DayPickerProps) {
  return (
    <div className="flex gap-1">
      {DAY_NAMES.map((name, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onToggleDay(index)}
          className={`h-7 w-7 rounded-full text-[10px] font-medium transition-colors ${
            selectedDays.includes(index)
              ? "bg-primary text-white"
              : "bg-gray-100 dark:bg-slate-700 text-muted-foreground hover:bg-gray-200 dark:hover:bg-slate-600"
          }`}
          data-testid={`day-picker-${name.toLowerCase()}`}
        >
          {name.charAt(0)}
        </button>
      ))}
    </div>
  );
}

interface DriverDayEntryPickerProps {
  entries: {
    dayOfWeek: number;
    departureTime: string;
    startLocation: string;
    endLocation: string;
    startLat?: number | null;
    startLng?: number | null;
    endLat?: number | null;
    endLng?: number | null;
  }[];
  onUpdateEntry: (index: number, field: string, value: any) => void;
  onAddEntry: () => void;
  onRemoveEntry: (index: number) => void;
}

export function DriverDayEntryPicker({ entries, onUpdateEntry, onAddEntry, onRemoveEntry }: DriverDayEntryPickerProps) {
  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5 bg-white/60 dark:bg-slate-700/60 rounded-lg p-1.5" data-testid={`driver-entry-${index}`}>
          <select
            value={entry.dayOfWeek}
            onChange={(e) => onUpdateEntry(index, "dayOfWeek", parseInt(e.target.value))}
            className="h-7 text-[11px] bg-transparent border border-gray-200 dark:border-slate-600 rounded px-1 w-16"
            data-testid={`entry-day-select-${index}`}
          >
            {DAY_NAMES_FULL.map((name, i) => (
              <option key={i} value={i}>{name.slice(0, 3)}</option>
            ))}
          </select>
          <input
            type="time"
            value={entry.departureTime}
            onChange={(e) => onUpdateEntry(index, "departureTime", e.target.value)}
            className="h-7 text-[11px] bg-transparent border border-gray-200 dark:border-slate-600 rounded px-1 w-20"
            data-testid={`entry-time-input-${index}`}
          />
          <div className="flex-1 text-[10px] text-muted-foreground truncate">
            {entry.startLocation ? `${entry.startLocation.split(',')[0]} → ${entry.endLocation.split(',')[0]}` : "Uses form locations"}
          </div>
          {entries.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveEntry(index)}
              className="h-5 w-5 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"
              data-testid={`button-remove-entry-${index}`}
            >
              <span className="text-red-500 text-xs">×</span>
            </button>
          )}
        </div>
      ))}
      {entries.length < 14 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-7 text-[11px]"
          onClick={onAddEntry}
          data-testid="button-add-day-entry"
        >
          + Add another day/time
        </Button>
      )}
    </div>
  );
}
