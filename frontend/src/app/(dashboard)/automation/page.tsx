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
  Reply,
  Hash,
  Square,
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
import {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  type QuickReply,
  type CreateQuickReplyInput,
} from '@/lib/api/quick-replies';

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
  AUDIO: 'Voice Note',
  DOCUMENT: 'Document',
  DELAY: 'Wait/Delay',
};

const statusColors: Record<SequenceStatus, string> = {
  DRAFT: 'bg-gray-500',
  ACTIVE: 'bg-green-500',
  PAUSED: 'bg-yellow-500',
  ARCHIVED: 'bg-gray-400',
};

// ============== QUICK REPLY COMPONENTS ==============

function QuickReplyCard({
  quickReply,
  onEdit,
  onDelete,
}: {
  quickReply: QuickReply;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg truncate">{quickReply.name}</CardTitle>
              {quickReply.category && (
                <Badge variant="secondary" className="text-[10px]">
                  {quickReply.category}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/{quickReply.shortcut}</span>
            </div>
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
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {quickReply.content.text}
        </p>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <span>{quickReply.usageCount} uses</span>
          {quickReply.content.media && (
            <span className="flex items-center gap-1">
              {quickReply.content.media.type === 'image' && <Image className="h-3 w-3" />}
              {quickReply.content.media.type === 'video' && <Video className="h-3 w-3" />}
              {quickReply.content.media.type === 'audio' && <Mic className="h-3 w-3" />}
              {quickReply.content.media.type === 'document' && <FileText className="h-3 w-3" />}
              + Media
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickReplyEditor({
  quickReply,
  open,
  onOpenChange,
  onSave,
}: {
  quickReply?: QuickReply | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!quickReply;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');

  // Media state
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'audio' | 'document' | null>(null);
  const [mediaMimetype, setMediaMimetype] = useState('');
  const [mediaFilename, setMediaFilename] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(quickReply?.name || '');
      setShortcut(quickReply?.shortcut || '');
      setText(quickReply?.content.text || '');
      setCategory(quickReply?.category || '');
      // Load media if exists
      if (quickReply?.content.media) {
        setMediaUrl(quickReply.content.media.url || '');
        setMediaType(quickReply.content.media.type || null);
        setMediaMimetype(quickReply.content.media.mimetype || '');
        setMediaFilename(quickReply.content.media.filename || '');
      } else {
        setMediaUrl('');
        setMediaType(null);
        setMediaMimetype('');
        setMediaFilename('');
      }
    }
  }, [open, quickReply]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine media type from file
    let type: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';

    setUploading(true);
    try {
      const result = await uploadMedia(file);
      setMediaUrl(result.url);
      setMediaType(type);
      setMediaMimetype(file.type);
      setMediaFilename(file.name);
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

  const handleRemoveMedia = () => {
    setMediaUrl('');
    setMediaType(null);
    setMediaMimetype('');
    setMediaFilename('');
  };

  const createMutation = useMutation({
    mutationFn: createQuickReply,
    onSuccess: () => {
      toast.success('Quick reply created');
      queryClient.invalidateQueries({ queryKey: ['quickReplies'] });
      onSave();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create quick reply');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateQuickReply(id, data),
    onSuccess: () => {
      toast.success('Quick reply updated');
      queryClient.invalidateQueries({ queryKey: ['quickReplies'] });
      onSave();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update quick reply');
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    if (!shortcut.trim()) {
      toast.error('Please enter a shortcut');
      return;
    }
    // Must have either text or media
    if (!text.trim() && !mediaUrl) {
      toast.error('Please enter reply text or upload media');
      return;
    }

    // Build content object
    const content: any = { text: text.trim() };
    if (mediaUrl && mediaType) {
      content.media = {
        type: mediaType,
        url: mediaUrl,
        mimetype: mediaMimetype || undefined,
        filename: mediaFilename || undefined,
      };
    }

    if (isEditing && quickReply) {
      updateMutation.mutate({
        id: quickReply.id,
        data: {
          name: name.trim(),
          shortcut: shortcut.trim(),
          content,
          category: category.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        shortcut: shortcut.trim(),
        content,
        category: category.trim() || undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Quick Reply' : 'Create Quick Reply'}</DialogTitle>
          <DialogDescription>
            Quick replies fill the chat box when triggered with /shortcut. You can edit before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="qr-name">Name</Label>
            <Input
              id="qr-name"
              placeholder="e.g., Greeting"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qr-shortcut">Shortcut</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <Input
                id="qr-shortcut"
                placeholder="e.g., hello"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qr-text">Reply Text {mediaUrl ? '(Caption)' : ''}</Label>
            <Textarea
              id="qr-text"
              placeholder={mediaUrl ? "Enter caption for media..." : "Enter the reply text..."}
              value={text}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Supports WhatsApp formatting: *bold*, _italic_, ~strikethrough~
            </p>
          </div>

          {/* Media Upload Section */}
          <div className="space-y-2">
            <Label>Media Attachment (optional)</Label>
            {mediaUrl ? (
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-start gap-3">
                  {/* Preview */}
                  <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted">
                    {mediaType === 'image' && (
                      <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                    )}
                    {mediaType === 'video' && (
                      <video src={mediaUrl} className="w-full h-full object-cover" />
                    )}
                    {mediaType === 'audio' && (
                      <div className="w-full h-full flex items-center justify-center">
                        <Mic className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    {mediaType === 'document' && (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{mediaFilename || 'Uploaded file'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{mediaType}</p>
                    {mediaType === 'audio' && (
                      <audio src={mediaUrl} className="w-full mt-2" controls />
                    )}
                  </div>
                  {/* Remove button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={handleRemoveMedia}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border border-dashed rounded-lg p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="qr-media-upload"
                />
                <label
                  htmlFor="qr-media-upload"
                  className={cn(
                    "flex flex-col items-center gap-2 cursor-pointer",
                    uploading && "pointer-events-none opacity-50"
                  )}
                >
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {uploading ? 'Uploading...' : 'Click to upload image, video, audio, or document'}
                  </span>
                </label>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Quick replies with media will send immediately when selected (text becomes caption)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qr-category">Category (optional)</Label>
            <Input
              id="qr-category"
              placeholder="e.g., Greetings, Sales, Support"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== SEQUENCE COMPONENTS ==============

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

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      setIsRecording(false);
      setRecordingTime(0);
    }
  }, [open, sequence]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Clear timer
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }

        // Create blob and upload
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });

        setUploading(true);
        try {
          const result = await uploadMedia(file);
          setUploadedMediaUrl(result.url);
          setUploadedMediaType('audio');
          toast.success('Recording uploaded');
        } catch (error: any) {
          toast.error(error.message || 'Failed to upload recording');
        } finally {
          setUploading(false);
          setIsRecording(false);
          setRecordingTime(0);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error: any) {
      toast.error('Could not access microphone');
      console.error('Recording error:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
                Sequences send all steps immediately when triggered. Use for multi-message flows.
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
                      ) : newStepType === 'AUDIO' ? (
                        <div className="space-y-3">
                          <Label>Record Voice Note</Label>

                          {/* Recording UI */}
                          {isRecording ? (
                            <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
                              <div className="flex items-center gap-2 flex-1">
                                <div className="h-3 w-3 bg-rose-500 rounded-full animate-pulse" />
                                <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
                                  Recording... {formatRecordingTime(recordingTime)}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-400 hover:text-rose-600"
                                onClick={cancelRecording}
                                title="Cancel"
                              >
                                <X className="h-5 w-5" />
                              </Button>
                              <Button
                                variant="default"
                                size="icon"
                                className="h-8 w-8 bg-rose-500 hover:bg-rose-600"
                                onClick={stopRecording}
                                title="Stop and save"
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : uploadedMediaUrl ? (
                            <div className="relative border rounded-lg overflow-hidden p-3">
                              <audio src={uploadedMediaUrl} className="w-full" controls />
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-2 right-2 h-6 w-6"
                                onClick={() => setUploadedMediaUrl('')}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <Button
                                variant="outline"
                                className="w-full h-20 flex flex-col gap-2"
                                onClick={startRecording}
                                disabled={uploading}
                              >
                                {uploading ? (
                                  <>
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                    <span className="text-sm">Uploading...</span>
                                  </>
                                ) : (
                                  <>
                                    <Mic className="h-6 w-6 text-rose-500" />
                                    <span className="text-sm">Tap to Record</span>
                                  </>
                                )}
                              </Button>
                              <p className="text-xs text-muted-foreground text-center">
                                Click to start recording your voice message
                              </p>
                            </div>
                          )}
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

// ============== MAIN PAGE ==============

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState<'sequences' | 'quickReplies'>('sequences');

  // Sequence state
  const [sequenceEditorOpen, setSequenceEditorOpen] = useState(false);
  const [editingSequence, setEditingSequence] = useState<MessageSequence | null>(null);

  // Quick reply state
  const [quickReplyEditorOpen, setQuickReplyEditorOpen] = useState(false);
  const [editingQuickReply, setEditingQuickReply] = useState<QuickReply | null>(null);

  // Queries
  const { data: sequences, isLoading: loadingSequences } = useQuery({
    queryKey: ['sequences'],
    queryFn: () => listSequences(),
  });

  const { data: quickReplies, isLoading: loadingQuickReplies } = useQuery({
    queryKey: ['quickReplies'],
    queryFn: () => listQuickReplies(),
  });

  // Sequence mutations
  const updateSequenceStatusMutation = useMutation({
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

  const deleteSequenceMutation = useMutation({
    mutationFn: deleteSequence,
    onSuccess: () => {
      toast.success('Sequence deleted');
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete sequence');
    },
  });

  // Quick reply mutations
  const deleteQuickReplyMutation = useMutation({
    mutationFn: deleteQuickReply,
    onSuccess: () => {
      toast.success('Quick reply deleted');
      queryClient.invalidateQueries({ queryKey: ['quickReplies'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete quick reply');
    },
  });

  const handleEditSequence = (sequence: MessageSequence) => {
    setEditingSequence(sequence);
    setSequenceEditorOpen(true);
  };

  const handleCreateSequence = () => {
    setEditingSequence(null);
    setSequenceEditorOpen(true);
  };

  const handleEditQuickReply = (quickReply: QuickReply) => {
    setEditingQuickReply(quickReply);
    setQuickReplyEditorOpen(true);
  };

  const handleCreateQuickReply = () => {
    setEditingQuickReply(null);
    setQuickReplyEditorOpen(true);
  };

  const activeSequences = sequences?.filter((s) => s.status === 'ACTIVE') || [];
  const draftSequences = sequences?.filter((s) => s.status === 'DRAFT') || [];
  const pausedSequences = sequences?.filter((s) => s.status === 'PAUSED') || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Automation</h1>
          <p className="text-muted-foreground mt-1">
            Manage quick replies and message sequences
          </p>
        </div>
      </div>

      {/* Main Tabs: Sequences vs Quick Replies */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="sequences" className="gap-2">
              <Zap className="h-4 w-4" />
              Sequences ({sequences?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="quickReplies" className="gap-2">
              <Reply className="h-4 w-4" />
              Quick Replies ({quickReplies?.length || 0})
            </TabsTrigger>
          </TabsList>

          {mainTab === 'sequences' ? (
            <Button onClick={handleCreateSequence}>
              <Plus className="h-4 w-4 mr-2" />
              New Sequence
            </Button>
          ) : (
            <Button onClick={handleCreateQuickReply}>
              <Plus className="h-4 w-4 mr-2" />
              New Quick Reply
            </Button>
          )}
        </div>

        {/* Sequences Tab */}
        <TabsContent value="sequences" className="space-y-4">
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

            {loadingSequences ? (
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
                        <Zap className="h-16 w-16 text-muted-foreground mb-4" />
                        <h2 className="text-xl font-semibold mb-2">No sequences yet</h2>
                        <p className="text-muted-foreground text-center max-w-md mb-4">
                          Sequences send multiple messages at once. Great for welcome flows, product info, etc.
                        </p>
                        <Button onClick={handleCreateSequence}>
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
                          onEdit={() => handleEditSequence(sequence)}
                          onDelete={() => deleteSequenceMutation.mutate(sequence.id)}
                          onStatusChange={(status) =>
                            updateSequenceStatusMutation.mutate({ id: sequence.id, status })
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
                        onEdit={() => handleEditSequence(sequence)}
                        onDelete={() => deleteSequenceMutation.mutate(sequence.id)}
                        onStatusChange={(status) =>
                          updateSequenceStatusMutation.mutate({ id: sequence.id, status })
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
                        onEdit={() => handleEditSequence(sequence)}
                        onDelete={() => deleteSequenceMutation.mutate(sequence.id)}
                        onStatusChange={(status) =>
                          updateSequenceStatusMutation.mutate({ id: sequence.id, status })
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
                        onEdit={() => handleEditSequence(sequence)}
                        onDelete={() => deleteSequenceMutation.mutate(sequence.id)}
                        onStatusChange={(status) =>
                          updateSequenceStatusMutation.mutate({ id: sequence.id, status })
                        }
                      />
                    ))}
                  </div>
                </TabsContent>
              </>
            )}
          </Tabs>
        </TabsContent>

        {/* Quick Replies Tab */}
        <TabsContent value="quickReplies" className="space-y-4">
          {loadingQuickReplies ? (
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
          ) : quickReplies?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Reply className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">No quick replies yet</h2>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Quick replies fill the chat box when triggered with /shortcut. You can edit before sending.
                </p>
                <Button onClick={handleCreateQuickReply}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Quick Reply
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {quickReplies?.map((quickReply) => (
                <QuickReplyCard
                  key={quickReply.id}
                  quickReply={quickReply}
                  onEdit={() => handleEditQuickReply(quickReply)}
                  onDelete={() => deleteQuickReplyMutation.mutate(quickReply.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Editors */}
      <SequenceEditor
        sequence={editingSequence}
        open={sequenceEditorOpen}
        onOpenChange={setSequenceEditorOpen}
        onSave={() => queryClient.invalidateQueries({ queryKey: ['sequences'] })}
      />

      <QuickReplyEditor
        quickReply={editingQuickReply}
        open={quickReplyEditorOpen}
        onOpenChange={setQuickReplyEditorOpen}
        onSave={() => queryClient.invalidateQueries({ queryKey: ['quickReplies'] })}
      />
    </div>
  );
}
