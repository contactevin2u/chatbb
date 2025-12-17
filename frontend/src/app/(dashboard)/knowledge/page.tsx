'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  MessageSquare,
  Package,
  FileText,
  Info,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  getKnowledgeStats,
  type KnowledgeItem,
  type KnowledgeType,
  type CreateKnowledgeInput,
} from '@/lib/api/knowledge';

const typeIcons: Record<KnowledgeType, React.ReactNode> = {
  FAQ: <MessageSquare className="h-4 w-4" />,
  PRODUCT: <Package className="h-4 w-4" />,
  POLICY: <FileText className="h-4 w-4" />,
  GENERAL: <Info className="h-4 w-4" />,
};

const typeColors: Record<KnowledgeType, string> = {
  FAQ: 'bg-blue-500/10 text-blue-500',
  PRODUCT: 'bg-green-500/10 text-green-500',
  POLICY: 'bg-orange-500/10 text-orange-500',
  GENERAL: 'bg-gray-500/10 text-gray-500',
};

export default function KnowledgeBankPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<KnowledgeItem | null>(null);

  // Form state
  const [formType, setFormType] = useState<KnowledgeType>('FAQ');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formKeywords, setFormKeywords] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formPriority, setFormPriority] = useState('0');

  // Queries
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['knowledge', activeTab, searchQuery],
    queryFn: () =>
      listKnowledge({
        type: activeTab !== 'all' ? (activeTab as KnowledgeType) : undefined,
        search: searchQuery || undefined,
      }),
  });

  const { data: stats } = useQuery({
    queryKey: ['knowledge-stats'],
    queryFn: getKnowledgeStats,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createKnowledge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-stats'] });
      toast.success('Knowledge item created');
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create knowledge item');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateKnowledge(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-stats'] });
      toast.success('Knowledge item updated');
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update knowledge item');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKnowledge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-stats'] });
      toast.success('Knowledge item deleted');
      setDeleteItem(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete knowledge item');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateKnowledge(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-stats'] });
    },
  });

  // Handlers
  const openCreateDialog = () => {
    setEditingItem(null);
    setFormType('FAQ');
    setFormTitle('');
    setFormContent('');
    setFormKeywords('');
    setFormCategory('');
    setFormPriority('0');
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: KnowledgeItem) => {
    setEditingItem(item);
    setFormType(item.type);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormKeywords(item.keywords.join(', '));
    setFormCategory(item.category || '');
    setFormPriority(String(item.priority));
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('Title and content are required');
      return;
    }

    const keywords = formKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const data: CreateKnowledgeInput = {
      type: formType,
      title: formTitle.trim(),
      content: formContent.trim(),
      keywords,
      category: formCategory.trim() || undefined,
      priority: parseInt(formPriority) || 0,
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Bank</h1>
          <p className="text-muted-foreground">
            Manage FAQs, product info, and policies for AI auto-reply
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Knowledge
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Items</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.active}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.byType.FAQ || 0}</div>
              <div className="text-xs text-muted-foreground">FAQs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.byType.PRODUCT || 0}</div>
              <div className="text-xs text-muted-foreground">Products</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.byType.POLICY || 0}</div>
              <div className="text-xs text-muted-foreground">Policies</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs and Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="FAQ">FAQs</TabsTrigger>
            <TabsTrigger value="PRODUCT">Products</TabsTrigger>
            <TabsTrigger value="POLICY">Policies</TabsTrigger>
            <TabsTrigger value="GENERAL">General</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Items List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No knowledge items found</p>
            <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add your first item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id} className={!item.isActive ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={typeColors[item.type]}>
                      {typeIcons[item.type]}
                      <span className="ml-1">{item.type}</span>
                    </Badge>
                    {item.category && (
                      <Badge variant="outline">{item.category}</Badge>
                    )}
                    {item.priority > 0 && (
                      <Badge variant="secondary">Priority: {item.priority}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toggleActiveMutation.mutate({
                          id: item.id,
                          isActive: !item.isActive,
                        })
                      }
                    >
                      {item.isActive ? (
                        <ToggleRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(item)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteItem(item)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                  {item.content}
                </p>
                {item.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.keywords.map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Knowledge Item' : 'Add Knowledge Item'}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? 'Update the knowledge item details'
                : 'Add new information to your knowledge bank'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as KnowledgeType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FAQ">FAQ (Question & Answer)</SelectItem>
                    <SelectItem value="PRODUCT">Product Information</SelectItem>
                    <SelectItem value="POLICY">Policy / Terms</SelectItem>
                    <SelectItem value="GENERAL">General Information</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority (0-100)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  placeholder="Higher = more important"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                {formType === 'FAQ' ? 'Question' : 'Title'} *
              </Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={
                  formType === 'FAQ'
                    ? 'What are your payment terms?'
                    : 'Digital Blood Pressure Monitor BPM-X100'
                }
              />
            </div>

            <div className="space-y-2">
              <Label>
                {formType === 'FAQ' ? 'Answer' : 'Content'} *
              </Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder={
                  formType === 'FAQ'
                    ? 'We accept bank transfer, credit card...'
                    : 'Automatic digital blood pressure monitor with LCD display...'
                }
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label>Keywords (comma separated)</Label>
              <Input
                value={formKeywords}
                onChange={(e) => setFormKeywords(e.target.value)}
                placeholder="payment, credit, terms, bank transfer"
              />
              <p className="text-xs text-muted-foreground">
                Keywords help AI find this information when customers ask questions
              </p>
            </div>

            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Input
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="Payment, Diagnostic Equipment, Warranty..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteItem?.title}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
