'use client';

import { useState, useEffect, useRef } from 'react';
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
  Upload,
  Smartphone,
  Loader2,
  Check,
  CheckCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadMedia } from '@/lib/api/conversations';

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

// WhatsApp Phone Preview Component
function WhatsAppPreview({ steps }: { steps: SequenceStep[] }) {
  return (
    <div className="w-[280px] flex-shrink-0 bg-gradient-to-b from-pink-100 to-purple-100 dark:from-purple-950 dark:to-pink-950 rounded-[2rem] p-2 shadow-xl">
      {/* Phone frame */}
      <div className="bg-[#e5ddd5] dark:bg-[#0b141a] rounded-[1.5rem] h-[480px] flex flex-col overflow-hidden">
        {/* WhatsApp header */}
        <div className="bg-[#075e54] dark:bg-[#1f2c34] px-3 py-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="flex-1">
            <p className="text-white text-sm font-medium">Customer</p>
            <p className="text-white/70 text-[10px]">online</p>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 p-2 overflow-y-auto space-y-2">
          {steps.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-4">
                Add steps to preview your sequence
              </p>
            </div>
          ) : (
            steps.map((step, index) => {
              if (step.type === 'DELAY') {
                return (
                  <div key={step.id} className="flex justify-center">
                    <span className="bg-[#fcf4cb] dark:bg-[#1d282f] text-[10px] px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                      Wait {step.content.delayMinutes}m
                    </span>
                  </div>
                );
              }

              return (
                <div key={step.id} className="flex justify-end">
                  <div className="max-w-[85%] bg-[#dcf8c6] dark:bg-[#005c4b] rounded-lg p-2 shadow-sm">
                    {step.type !== 'TEXT' && step.content.mediaUrl && (
                      <div className="mb-1 rounded overflow-hidden">
                        {step.type === 'IMAGE' ? (
                          <img
                            src={step.content.mediaUrl}
                            alt="Media"
                            className="w-full h-24 object-cover"
                          />
                        ) : step.type === 'VIDEO' ? (
                          <div className="w-full h-24 bg-black/20 flex items-center justify-center">
                            <Play className="h-8 w-8 text-white" />
                          </div>
                        ) : step.type === 'AUDIO' ? (
                          <div className="flex items-center gap-2 py-2">
                            <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                              <Mic className="h-4 w-4" />
                            </div>
                            <div className="flex-1 h-1 bg-gray-300 dark:bg-gray-600 rounded" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 py-1">
                            <FileText className="h-6 w-6 text-red-500" />
                            <span className="text-xs truncate">{step.content.mediaFilename || 'Document'}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {step.content.text && (
                      <p className="text-[11px] text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">
                        {step.content.text}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[9px] text-gray-500 dark:text-gray-400">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <CheckCheck className="h-3 w-3 text-blue-500" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input bar */}
        <div className="bg-[#f0f0f0] dark:bg-[#1f2c34] px-2 py-2 flex items-center gap-2">
          <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-full px-3 py-1.5">
            <span className="text-xs text-gray-400">Type a message</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#075e54] dark:bg-[#00a884] flex items-center justify-center">
            <Mic className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>
    </div>
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(sequence?.name || '');
  const [shortcut, setShortcut] = useState(sequence?.shortcut || '');
  const [description, setDescription] = useState(sequence?.description || '');
  const [steps, setSteps] = useState<SequenceStep[]>(sequence?.steps || []);
  const [addingStep, setAddingStep] = useState(false);
  const [newStepType, setNewStepType] = useState<SequenceStepType>('TEXT');
  const [newStepContent, setNewStepContent] = useState('');
  const [newStepDelay, setNewStepDelay] = useState(5);
  const [uploading, setUploading] = useState(false);
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState('');
  const [uploadedMediaType, setUploadedMediaType] = useState<'image' | 'video' | 'audio' | 'document'>('image');
  const [showPreview, setShowPreview] = useState(false);

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
      setUploadedMediaUrl('');
      setShowPreview(false);
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
      setUploadedMediaUrl('');
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine media type from file
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    setUploading(true);
    try {
      const result = await uploadMedia(file);
      setUploadedMediaUrl(result.url);
      setUploadedMediaType(mediaType);

      // Auto-set the step type based on uploaded file
      if (mediaType === 'image') setNewStepType('IMAGE');
      else if (mediaType === 'video') setNewStepType('VIDEO');
      else if (mediaType === 'audio') setNewStepType('AUDIO');
      else setNewStepType('DOCUMENT');

      toast.success('Media uploaded');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload media');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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
      content.mediaUrl = uploadedMediaUrl || newStepContent;
      content.mediaType = uploadedMediaType;
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
      setUploadedMediaUrl('');
    }
  };

  const handleRemoveStep = (stepId: string) => {
    if (stepId.startsWith('temp-')) {
      setSteps(steps.filter((s) => s.id !== stepId));
    } else {
      deleteStepMutation.mutate(stepId);
    }
  };

  const getAcceptTypes = () => {
    switch (newStepType) {
      case 'IMAGE': return 'image/*';
      case 'VIDEO': return 'video/*';
      case 'AUDIO': return 'audio/*';
      case 'DOCUMENT': return '.pdf,.doc,.docx,.xls,.xlsx,.txt';
      default: return '*/*';
    }
  };

  const isMediaStep = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'].includes(newStepType);
  const canAddStep = newStepType === 'DELAY' ||
    (newStepType === 'TEXT' && newStepContent.trim()) ||
    (isMediaStep && (uploadedMediaUrl || newStepContent.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "flex flex-col p-0 gap-0",
        showPreview ? "max-w-4xl" : "max-w-2xl",
        "max-h-[90vh]"
      )}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{isEditing ? 'Edit Sequence' : 'Create Sequence'}</DialogTitle>
              <DialogDescription>
                Build an automated message sequence with multiple steps.
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="gap-2"
            >
              <Smartphone className="h-4 w-4" />
              {showPreview ? 'Hide Preview' : 'Preview'}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Editor Panel */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
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
                  <Label>Steps ({steps.length})</Label>
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
                        {step.content.mediaUrl && step.type === 'IMAGE' && (
                          <img
                            src={step.content.mediaUrl}
                            alt=""
                            className="h-10 w-10 object-cover rounded"
                          />
                        )}
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
                  <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">New Step</Label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setAddingStep(false);
                          setUploadedMediaUrl('');
                          setNewStepContent('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Step Type</Label>
                        <Select
                          value={newStepType}
                          onValueChange={(v) => {
                            setNewStepType(v as SequenceStepType);
                            setUploadedMediaUrl('');
                            setNewStepContent('');
                          }}
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
                          <p className="text-xs text-muted-foreground">
                            The sequence will wait this long before sending the next message
                          </p>
                        </div>
                      ) : newStepType === 'TEXT' ? (
                        <div className="space-y-2">
                          <Label>Message Text</Label>
                          <Textarea
                            placeholder="Enter your message..."
                            value={newStepContent}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewStepContent(e.target.value)}
                            rows={4}
                            className="resize-none"
                          />
                          <p className="text-xs text-muted-foreground">
                            Supports WhatsApp formatting: *bold*, _italic_, ~strikethrough~
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <Label>Upload {stepTypeLabels[newStepType]}</Label>

                          {/* Upload button */}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploading}
                            >
                              {uploading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 mr-2" />
                                  Choose File
                                </>
                              )}
                            </Button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept={getAcceptTypes()}
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                          </div>

                          {/* Preview uploaded media */}
                          {uploadedMediaUrl && (
                            <div className="relative border rounded-lg overflow-hidden">
                              {newStepType === 'IMAGE' ? (
                                <img src={uploadedMediaUrl} alt="Preview" className="w-full h-40 object-cover" />
                              ) : newStepType === 'VIDEO' ? (
                                <video src={uploadedMediaUrl} className="w-full h-40 object-cover" controls />
                              ) : newStepType === 'AUDIO' ? (
                                <audio src={uploadedMediaUrl} className="w-full" controls />
                              ) : (
                                <div className="p-4 flex items-center gap-2">
                                  <FileText className="h-8 w-8 text-muted-foreground" />
                                  <span className="text-sm">Document uploaded</span>
                                </div>
                              )}
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-2 right-2 h-6 w-6"
                                onClick={() => setUploadedMediaUrl('')}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}

                          {/* Or URL input */}
                          {!uploadedMediaUrl && (
                            <>
                              <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                  <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                  <span className="bg-background px-2 text-muted-foreground">or paste URL</span>
                                </div>
                              </div>
                              <Input
                                placeholder="https://example.com/media.jpg"
                                value={newStepContent}
                                onChange={(e) => setNewStepContent(e.target.value)}
                              />
                            </>
                          )}
                        </div>
                      )}

                      <Button
                        onClick={handleAddStep}
                        disabled={!canAddStep || addStepMutation.isPending}
                        className="w-full"
                      >
                        {addStepMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Add Step
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          {showPreview && (
            <div className="border-l p-4 bg-muted/30 flex items-center justify-center">
              <WhatsAppPreview steps={steps} />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Sequence'
            )}
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
