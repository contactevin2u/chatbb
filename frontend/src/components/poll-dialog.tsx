'use client';

import { useState } from 'react';
import { Plus, X, BarChart3 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { sendPoll } from '@/lib/api/conversations';

interface PollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

export function PollDialog({ open, onOpenChange, conversationId }: PollDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [selectableCount, setSelectableCount] = useState(1);

  const sendPollMutation = useMutation({
    mutationFn: sendPoll,
    onSuccess: () => {
      toast.success('Poll sent!');
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send poll');
    },
  });

  const resetForm = () => {
    setName('');
    setOptions(['', '']);
    setSelectableCount(1);
  };

  const handleAddOption = () => {
    if (options.length < 12) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = () => {
    const filledOptions = options.filter((opt) => opt.trim());
    if (!name.trim()) {
      toast.error('Please enter a poll question');
      return;
    }
    if (filledOptions.length < 2) {
      toast.error('Please enter at least 2 options');
      return;
    }

    sendPollMutation.mutate({
      conversationId,
      name: name.trim(),
      options: filledOptions,
      selectableCount,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Create Poll
          </DialogTitle>
          <DialogDescription>
            Create an interactive poll for your conversation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              placeholder="Ask a question..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={256}
            />
          </div>

          <div className="space-y-2">
            <Label>Options</Label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    maxLength={100}
                  />
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={() => handleRemoveOption(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 12 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleAddOption}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Option
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="selectable-count">Allow multiple answers</Label>
            <select
              id="selectable-count"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={selectableCount}
              onChange={(e) => setSelectableCount(Number(e.target.value))}
            >
              <option value={1}>Single choice</option>
              {options.filter((o) => o.trim()).length > 1 &&
                Array.from({ length: Math.min(options.filter((o) => o.trim()).length, 12) - 1 }, (_, i) => (
                  <option key={i + 2} value={i + 2}>
                    Up to {i + 2} choices
                  </option>
                ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={sendPollMutation.isPending}>
            {sendPollMutation.isPending ? 'Sending...' : 'Send Poll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
