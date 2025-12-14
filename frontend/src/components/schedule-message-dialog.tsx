'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format, addMinutes, addHours, addDays, startOfHour, setHours, setMinutes } from 'date-fns';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createScheduledMessage, ScheduledMessageContent } from '@/lib/api/scheduled-messages';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  messageContent: ScheduledMessageContent;
  onScheduled: () => void;
}

const quickOptions = [
  { label: 'In 30 minutes', getValue: () => addMinutes(new Date(), 30) },
  { label: 'In 1 hour', getValue: () => addHours(new Date(), 1) },
  { label: 'In 3 hours', getValue: () => addHours(new Date(), 3) },
  { label: 'Tomorrow 9 AM', getValue: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
  { label: 'Tomorrow 2 PM', getValue: () => setMinutes(setHours(addDays(new Date(), 1), 14), 0) },
];

export function ScheduleMessageDialog({
  open,
  onOpenChange,
  conversationId,
  messageContent,
  onScheduled,
}: ScheduleMessageDialogProps) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');

  const scheduleMutation = useMutation({
    mutationFn: createScheduledMessage,
    onSuccess: () => {
      toast.success('Message scheduled');
      queryClient.invalidateQueries({ queryKey: ['scheduledMessages', conversationId] });
      onScheduled();
      onOpenChange(false);
      setSelectedDate(null);
      setCustomDate('');
      setCustomTime('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to schedule message');
    },
  });

  const handleQuickOption = (getValue: () => Date) => {
    setSelectedDate(getValue());
    setCustomDate('');
    setCustomTime('');
  };

  const handleCustomDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomDate(e.target.value);
    setSelectedDate(null);
  };

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomTime(e.target.value);
    setSelectedDate(null);
  };

  const getScheduledAt = (): Date | null => {
    if (selectedDate) {
      return selectedDate;
    }
    if (customDate && customTime) {
      return new Date(`${customDate}T${customTime}`);
    }
    return null;
  };

  const handleSchedule = () => {
    const scheduledAt = getScheduledAt();
    if (!scheduledAt) {
      toast.error('Please select a date and time');
      return;
    }

    if (scheduledAt <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    scheduleMutation.mutate({
      conversationId,
      content: messageContent,
      scheduledAt: scheduledAt.toISOString(),
    });
  };

  const scheduledAt = getScheduledAt();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Message
          </DialogTitle>
          <DialogDescription>
            Choose when to send this message. The recipient will receive it at the scheduled time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Quick options */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quick options</Label>
            <div className="flex flex-wrap gap-2">
              {quickOptions.map((option) => (
                <Button
                  key={option.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickOption(option.getValue)}
                  className={
                    selectedDate &&
                    format(selectedDate, 'yyyy-MM-dd HH:mm') ===
                      format(option.getValue(), 'yyyy-MM-dd HH:mm')
                      ? 'border-primary bg-primary/10'
                      : ''
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom date/time */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Or choose custom date & time</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="date"
                  value={customDate}
                  onChange={handleCustomDateChange}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
              <div className="flex-1">
                <Input
                  type="time"
                  value={customTime}
                  onChange={handleCustomTimeChange}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          {scheduledAt && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">Scheduled for:</p>
              <p className="text-sm text-muted-foreground">
                {format(scheduledAt, 'EEEE, MMMM d, yyyy')} at {format(scheduledAt, 'h:mm a')}
              </p>
            </div>
          )}

          {/* Message preview */}
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">Message:</p>
            <p className="text-sm truncate">{messageContent.text || '[Media message]'}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={!scheduledAt || scheduleMutation.isPending}
          >
            {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
