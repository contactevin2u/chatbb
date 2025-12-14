'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Zap,
  Plus,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Edit,
  Clock,
  MessageSquare,
  Image,
  Video,
  Mic,
  FileText,
  ChevronRight,
  GripVertical,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils/cn';
import {
  listSequences,
  createSequence,
  updateSequence,
  deleteSequence,
  addSequenceStep,
  deleteSequenceStep,
  type MessageSequence,
  type SequenceStep,
  type SequenceStepType,
  type SequenceStatus,
} from '@/lib/api/sequences';

const stepTypeIcons: Record<SequenceStepType, React.ReactNode> = {
  TEXT: <MessageSquare className="h-4 w-4" />,
  IMAGE: <Image className="h-4 w-4" />,
  VIDEO: <Video className="h-4 w-4" />,
  AUDIO: <Mic className="h-4 w-4" />,
  DOCUMENT: <FileText className="h-4 w-4" />,
  DELAY: <Clock className="h-4 w-4" />,
};

const stepTypeLabels: Record<SequenceStepType, string> = {
  TEXT: 'Text Message',
  IMAGE: 'Image',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  DOCUMENT: 'Document',
  DELAY: 'Wait/Delay',
};

const statusColors: Record<SequenceStatus, string> = {
  DRAFT: 'bg-gray-500',
  ACTIVE: 'bg-green-500',
  PAUSED: 'bg-yellow-500',
  ARCHIVED: 'bg-gray-400',
};

function SequenceCard({
  sequence,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  sequence: MessageSequence;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: SequenceStatus) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg truncate">{sequence.name}</CardTitle>
              <Badge
                variant="secondary"
                className={cn('text-white text-[10px]', statusColors[sequence.status])}
              >
                {sequence.status}
              </Badge>
            </div>
            {sequence.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {sequence.description}
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {sequence.status === 'ACTIVE' ? (
                <DropdownMenuItem onClick={() => onStatusChange('PAUSED')}>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </DropdownMenuItem>
              ) : sequence.status !== 'ARCHIVED' ? (
                <DropdownMenuItem onClick={() => onStatusChange('ACTIVE')}>
                  <Play className="h-4 w-4 mr-2" />
                  Activate
                </DropdownMenuItem>
              ) : null}
              {sequence.status !== 'ARCHIVED' && (
                <DropdownMenuItem onClick={() => onStatusChange('ARCHIVED')}>
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {sequence.shortcut && (
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/{sequence.shortcut}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Zap className="h-4 w-4" />
            <span>{sequence.steps.length} steps</span>
          </div>
          <div className="flex items-center gap-1">
            <Play className="h-4 w-4" />
            <span>{sequence._count?.executions || 0} runs</span>
          </div>
        </div>
        {/* Step preview */}
        <div className="mt-3 flex items-center gap-1 overflow-hidden">
          {sequence.steps.slice(0, 5).map((step, index) => (
            <div
              key={step.id}
              className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs"
              title={stepTypeLabels[step.type]}
            >
              {stepTypeIcons[step.type]}
              {index < sequence.steps.length - 1 && index < 4 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground ml-1" />
              )}
            </div>
          ))}
          {sequence.steps.length > 5 && (
            <span className="text-xs text-muted-foreground">+{sequence.steps.length - 5}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SequenceEditor({
  sequence,
  open,
  onOpenChange,
  onSave,
}: {
  sequence?: MessageSequence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!sequence;

  const [name, setName] = useState(sequence?.name || '');
  const [shortcut, setShortcut] = useState(sequence?.shortcut || '');
  const [description, setDescription] = useState(sequence?.description || '');
  const [steps, setSteps] = useState<SequenceStep[]>(sequence?.steps || []);
  const [addingStep, setAddingStep] = useState(false);
  const [newStepType, setNewStepType] = useState<SequenceStepType>('TEXT');
  const [newStepContent, setNewStepContent] = useState('');
  const [newStepDelay, setNewStepDelay] = useState(5);

  // Reset form when dialog opens or sequence changes
  useEffect(() => {
    if (open) {
      setName(sequence?.name || '');
      setShortcut(sequence?.shortcut || '');
      setDescription(sequence?.description || '');
      setSteps(sequence?.steps || []);
      setAddingStep(false);
      setNewStepContent('');
      setNewStepDelay(5);
    }
  }, [open, sequence]);

  const createMutation = useMutation({
    mutationFn: createSequence,
    onSuccess: () => {
      toast.success('Sequence created');
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
      onSave();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create sequence');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateSequence(id, data),
    onSuccess: () => {
      toast.success('Sequence updated');
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
      onSave();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update sequence');
    },
  });

  const addStepMutation = useMutation({
    mutationFn: ({ sequenceId, step }: { sequenceId: string; step: any }) =>
      addSequenceStep(sequenceId, step),
    onSuccess: (newStep) => {
      setSteps([...steps, newStep]);
      setAddingStep(false);
      setNewStepContent('');
      setNewStepDelay(5);
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add step');
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: deleteSequenceStep,
    onSuccess: (_, stepId) => {
      setSteps(steps.filter((s) => s.id !== stepId));
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete step');
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Please enter a sequence name');
      return;
    }

    // Validate shortcut format
    if (shortcut && !/^[a-zA-Z0-9_-]+$/.test(shortcut)) {
      toast.error('Shortcut can only contain letters, numbers, dashes and underscores');
      return;
    }

    if (isEditing && sequence) {
      updateMutation.mutate({
        id: sequence.id,
        data: {
          name: name.trim(),
          shortcut: shortcut.trim() || null,
          description: description.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        shortcut: shortcut.trim() || undefined,
        description: description.trim() || undefined,
        steps: steps.map((s, i) => ({
          order: i,
          type: s.type,
          content: s.content,
        })),
      });
    }
  };

  const handleAddStep = () => {
    const content: any = {};

    if (newStepType === 'DELAY') {
      content.delayMinutes = newStepDelay;
    } else if (newStepType === 'TEXT') {
      content.text = newStepContent;
    } else {
      content.mediaUrl = newStepContent;
    }

    if (isEditing && sequence) {
      addStepMutation.mutate({
        sequenceId: sequence.id,
        step: {
          order: steps.length,
          type: newStepType,
          content,
        },
      });
    } else {
      // For new sequences, just add to local state
      setSteps([
        ...steps,
        {
          id: `temp-${Date.now()}`,
          sequenceId: '',
          order: steps.length,
          type: newStepType,
          content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      setAddingStep(false);
      setNewStepContent('');
      setNewStepDelay(5);
    }
  };

  const handleRemoveStep = (stepId: string) => {
    if (stepId.startsWith('temp-')) {
      setSteps(steps.filter((s) => s.id !== stepId));
    } else {
      deleteStepMutation.mutate(stepId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Sequence' : 'Create Sequence'}</DialogTitle>
          <DialogDescription>
            Build an automated message sequence with multiple steps.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Sequence Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Welcome Series"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortcut">
                  Shortcut (optional)
                  <span className="text-xs text-muted-foreground ml-2">Use in chat with /shortcut</span>
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">/</span>
                  <Input
                    id="shortcut"
                    placeholder="e.g., welcome"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this sequence does..."
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddingStep(true)}
                  disabled={addingStep}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>

              {steps.length === 0 && !addingStep && (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No steps yet</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setAddingStep(true)}
                  >
                    Add your first step
                  </Button>
                </div>
              )}

              {/* Existing steps */}
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg group"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      <span className="text-xs font-medium w-6">{index + 1}.</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="p-1.5 bg-background rounded">
                        {stepTypeIcons[step.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{stepTypeLabels[step.type]}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {step.type === 'DELAY'
                            ? `Wait ${step.content.delayMinutes} minutes`
                            : step.content.text || step.content.mediaUrl || 'No content'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => handleRemoveStep(step.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Add step form */}
              {addingStep && (
                <div className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>New Step</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setAddingStep(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Step Type</Label>
                      <Select
                        value={newStepType}
                        onValueChange={(v) => setNewStepType(v as SequenceStepType)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(stepTypeLabels).map(([type, label]) => (
                            <SelectItem key={type} value={type}>
                              <div className="flex items-center gap-2">
                                {stepTypeIcons[type as SequenceStepType]}
                                {label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {newStepType === 'DELAY' ? (
                      <div className="space-y-2">
                        <Label>Delay (minutes)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={newStepDelay}
                          onChange={(e) => setNewStepDelay(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    ) : newStepType === 'TEXT' ? (
                      <div className="space-y-2">
                        <Label>Message Text</Label>
                        <Textarea
                          placeholder="Enter your message..."
                          value={newStepContent}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewStepContent(e.target.value)}
                          rows={3}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Media URL</Label>
                        <Input
                          placeholder="https://example.com/media.jpg"
                          value={newStepContent}
                          onChange={(e) => setNewStepContent(e.target.value)}
                        />
                      </div>
                    )}

                    <Button
                      onClick={handleAddStep}
                      disabled={
                        (newStepType !== 'DELAY' && !newStepContent.trim()) ||
                        addStepMutation.isPending
                      }
                      className="w-full"
                    >
                      Add Step
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSequence, setEditingSequence] = useState<MessageSequence | null>(null);

  const { data: sequences, isLoading } = useQuery({
    queryKey: ['sequences'],
    queryFn: () => listSequences(),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SequenceStatus }) =>
      updateSequence(id, { status }),
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSequence,
    onSuccess: () => {
      toast.success('Sequence deleted');
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete sequence');
    },
  });

  const handleEdit = (sequence: MessageSequence) => {
    setEditingSequence(sequence);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingSequence(null);
    setEditorOpen(true);
  };

  const activeSequences = sequences?.filter((s) => s.status === 'ACTIVE') || [];
  const draftSequences = sequences?.filter((s) => s.status === 'DRAFT') || [];
  const pausedSequences = sequences?.filter((s) => s.status === 'PAUSED') || [];
  const archivedSequences = sequences?.filter((s) => s.status === 'ARCHIVED') || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Automation</h1>
          <p className="text-muted-foreground mt-1">
            Create message sequences and automated workflows
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Sequence
        </Button>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">
            All ({sequences?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="active">
            Active ({activeSequences.length})
          </TabsTrigger>
          <TabsTrigger value="draft">
            Draft ({draftSequences.length})
          </TabsTrigger>
          <TabsTrigger value="paused">
            Paused ({pausedSequences.length})
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 w-32 bg-muted rounded" />
                  <div className="h-4 w-48 bg-muted rounded mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 w-24 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="all" className="space-y-4">
              {sequences?.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <Bot className="h-16 w-16 text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">No sequences yet</h2>
                    <p className="text-muted-foreground text-center max-w-md mb-4">
                      Create your first message sequence to automate customer engagement.
                    </p>
                    <Button onClick={handleCreate}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Sequence
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sequences?.map((sequence) => (
                    <SequenceCard
                      key={sequence.id}
                      sequence={sequence}
                      onEdit={() => handleEdit(sequence)}
                      onDelete={() => deleteMutation.mutate(sequence.id)}
                      onStatusChange={(status) =>
                        updateStatusMutation.mutate({ id: sequence.id, status })
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="active">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeSequences.map((sequence) => (
                  <SequenceCard
                    key={sequence.id}
                    sequence={sequence}
                    onEdit={() => handleEdit(sequence)}
                    onDelete={() => deleteMutation.mutate(sequence.id)}
                    onStatusChange={(status) =>
                      updateStatusMutation.mutate({ id: sequence.id, status })
                    }
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="draft">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {draftSequences.map((sequence) => (
                  <SequenceCard
                    key={sequence.id}
                    sequence={sequence}
                    onEdit={() => handleEdit(sequence)}
                    onDelete={() => deleteMutation.mutate(sequence.id)}
                    onStatusChange={(status) =>
                      updateStatusMutation.mutate({ id: sequence.id, status })
                    }
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="paused">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pausedSequences.map((sequence) => (
                  <SequenceCard
                    key={sequence.id}
                    sequence={sequence}
                    onEdit={() => handleEdit(sequence)}
                    onDelete={() => deleteMutation.mutate(sequence.id)}
                    onStatusChange={(status) =>
                      updateStatusMutation.mutate({ id: sequence.id, status })
                    }
                  />
                ))}
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>

      <SequenceEditor
        sequence={editingSequence}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={() => queryClient.invalidateQueries({ queryKey: ['sequences'] })}
      />
    </div>
  );
}
