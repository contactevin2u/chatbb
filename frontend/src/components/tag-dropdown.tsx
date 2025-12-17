'use client';

import { useState, useEffect } from 'react';
import { Tag as TagIcon, Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  addConversationTag,
  removeConversationTag,
  Tag,
  ConversationTagRelation,
} from '@/lib/api/conversations';

interface TagDropdownProps {
  conversationId: string;
  currentTags: ConversationTagRelation[];
  onTagsChange?: () => void;
}

const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
];

export function TagDropdown({ conversationId, currentTags, onTagsChange }: TagDropdownProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [recentTagIds, setRecentTagIds] = useState<string[]>([]);

  // Load recent tags from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentTagIds');
    if (stored) {
      setRecentTagIds(JSON.parse(stored));
    }
  }, []);

  // Fetch all tags
  const { data: allTags } = useQuery({
    queryKey: ['tags'],
    queryFn: listTags,
  });

  // Get current tag IDs for comparison
  const currentTagIds = currentTags.filter((t) => t.tag?.id).map((t) => t.tag.id);

  // Add tag mutation
  const addTagMutation = useMutation({
    mutationFn: (tagId: string) => addConversationTag(conversationId, tagId),
    onSuccess: (_, tagId) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Update recent tags
      const newRecent = [tagId, ...recentTagIds.filter((id) => id !== tagId)].slice(0, 5);
      setRecentTagIds(newRecent);
      localStorage.setItem('recentTagIds', JSON.stringify(newRecent));
      onTagsChange?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add tag');
    },
  });

  // Remove tag mutation
  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) => removeConversationTag(conversationId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onTagsChange?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove tag');
    },
  });

  // Create tag mutation
  const createTagMutation = useMutation({
    mutationFn: createTag,
    onSuccess: (newTag) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      // Automatically add the new tag to the conversation
      addTagMutation.mutate(newTag.id);
      setNewTagName('');
      setShowNewTagForm(false);
      toast.success('Tag created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create tag');
    },
  });

  // Update tag mutation
  const updateTagMutation = useMutation({
    mutationFn: ({ tagId, data }: { tagId: string; data: { name?: string; color?: string } }) =>
      updateTag(tagId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setEditingTag(null);
      toast.success('Tag updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update tag');
    },
  });

  // Delete tag mutation
  const deleteTagMutation = useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setEditingTag(null);
      toast.success('Tag deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete tag');
    },
  });

  const toggleTag = (tagId: string) => {
    if (currentTagIds.includes(tagId)) {
      removeTagMutation.mutate(tagId);
    } else {
      addTagMutation.mutate(tagId);
    }
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
  };

  // Sort tags: recent first, then alphabetically
  const sortedTags = allTags
    ? [...allTags].filter((tag) => tag?.id).sort((a, b) => {
        const aRecent = recentTagIds.indexOf(a.id);
        const bRecent = recentTagIds.indexOf(b.id);
        if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
        if (aRecent !== -1) return -1;
        if (bRecent !== -1) return 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <TagIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        {editingTag ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Edit Tag</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingTag(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              placeholder="Tag name"
              value={editingTag.name}
              onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
              className="h-8"
            />
            <div className="flex gap-1 flex-wrap">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: editingTag.color === color ? 'white' : 'transparent',
                    boxShadow: editingTag.color === color ? `0 0 0 2px ${color}` : 'none',
                  }}
                  onClick={() => setEditingTag({ ...editingTag, color })}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() =>
                  updateTagMutation.mutate({
                    tagId: editingTag.id,
                    data: { name: editingTag.name, color: editingTag.color },
                  })
                }
                disabled={updateTagMutation.isPending}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (confirm('Delete this tag? It will be removed from all conversations.')) {
                    deleteTagMutation.mutate(editingTag.id);
                  }
                }}
                disabled={deleteTagMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : showNewTagForm ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">New Tag</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewTagForm(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              placeholder="Tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="h-8"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
            />
            <div className="flex gap-1 flex-wrap">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: newTagColor === color ? 'white' : 'transparent',
                    boxShadow: newTagColor === color ? `0 0 0 2px ${color}` : 'none',
                  }}
                  onClick={() => setNewTagColor(color)}
                />
              ))}
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || createTagMutation.isPending}
            >
              Create Tag
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {sortedTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer group/tag"
                    onClick={() => toggleTag(tag.id)}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color || '#6b7280' }}
                    />
                    <span className="flex-1 text-sm truncate">{tag.name}</span>
                    {currentTagIds.includes(tag.id) && (
                      <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover/tag:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTag(tag);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {sortedTags.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No tags yet</p>
                )}
              </div>
            </ScrollArea>
            <div className="border-t mt-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setShowNewTagForm(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Create new tag
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
