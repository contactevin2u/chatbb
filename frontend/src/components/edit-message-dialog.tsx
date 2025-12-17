'use client';

import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { editMessage } from '@/lib/api/conversations';

interface EditMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  currentText: string;
  conversationId: string;
}

export function EditMessageDialog({
  open,
  onOpenChange,
  messageId,
  currentText,
  conversationId,
}: EditMessageDialogProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(currentText);

  useEffect(() => {
    setText(currentText);
  }, [currentText, open]);

  const editMutation = useMutation({
    mutationFn: () => editMessage(messageId, text),
    onSuccess: () => {
      toast.success('Message edited');
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to edit message');
    },
  });

  const handleSubmit = () => {
    if (!text.trim()) {
      toast.error('Message cannot be empty');
      return;
    }
    if (text === currentText) {
      onOpenChange(false);
      return;
    }
    editMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Message
          </DialogTitle>
          <DialogDescription>
            Edit your message. The recipient will see that the message was edited.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter your message..."
            className="min-h-[100px]"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={editMutation.isPending}>
            {editMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
