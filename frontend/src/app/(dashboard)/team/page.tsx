'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UsersRound,
  Plus,
  MoreVertical,
  Crown,
  Trash2,
  UserPlus,
  Link,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  listTeams,
  createTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  setTeamLeader,
  assignChannelToTeam,
  unassignChannelFromTeam,
  listUsers,
  createUser,
  deleteUser,
  getAgentStats,
  setAvailability,
  Team,
  AgentAvailability,
} from '@/lib/api/team';
import { listChannels } from '@/lib/api/channels';
import { useAuthStore } from '@/stores/auth-store';

// ==================== STATUS INDICATORS ====================

function AvailabilityBadge({ status }: { status: AgentAvailability }) {
  const config = {
    ONLINE: { color: 'bg-green-500', label: 'Online' },
    AWAY: { color: 'bg-yellow-500', label: 'Away' },
    BUSY: { color: 'bg-red-500', label: 'Busy' },
    OFFLINE: { color: 'bg-gray-400', label: 'Offline' },
  };

  const { color, label } = config[status] || config.OFFLINE;

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

// ==================== MEMBERS TAB ====================

function MembersTab() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{ id: string; name: string } | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'ADMIN' | 'SUPERVISOR' | 'AGENT'>('AGENT');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  });

  const { data: stats = [] } = useQuery({
    queryKey: ['agent-stats'],
    queryFn: getAgentStats,
    refetchInterval: 30000,
  });

  const availabilityMutation = useMutation({
    mutationFn: (status: AgentAvailability) => setAvailability(status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['agent-stats'] });
      toast.success('Availability updated');
      setAvailabilityDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update availability');
    },
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      createUser({
        email: newUserEmail,
        password: newUserPassword,
        firstName: newUserFirstName,
        lastName: newUserLastName,
        role: newUserRole,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['agent-stats'] });
      toast.success('User created');
      setCreateUserDialogOpen(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFirstName('');
      setNewUserLastName('');
      setNewUserRole('AGENT');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create user');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['agent-stats'] });
      toast.success('User deleted');
      setDeleteConfirmUser(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });

  const usersWithStats = users.map((user) => {
    const stat = stats.find((s) => s.id === user.id);
    return {
      ...user,
      openConversations: stat?.openConversations || 0,
    };
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex items-center space-x-4 p-4">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Team Members</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAvailabilityDialogOpen(true)}>
            Set My Status
          </Button>
          <Button onClick={() => setCreateUserDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Chats</TableHead>
              <TableHead>Teams</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersWithStats.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatarUrl} />
                      <AvatarFallback>
                        {user.firstName[0]}
                        {user.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {user.firstName} {user.lastName}
                        {user.id === currentUser?.id && (
                          <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="capitalize text-sm">{user.role.toLowerCase()}</span>
                </TableCell>
                <TableCell>
                  <AvailabilityBadge status={user.availabilityStatus} />
                </TableCell>
                <TableCell>
                  <span className="font-medium">{user.openConversations}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.teams?.slice(0, 2).map((team) => (
                      <span
                        key={team.id}
                        className="text-xs bg-muted px-2 py-0.5 rounded-full"
                      >
                        {team.name}
                        {team.isLeader && ' *'}
                      </span>
                    ))}
                    {(user.teams?.length || 0) > 2 && (
                      <span className="text-xs text-muted-foreground">
                        +{(user.teams?.length || 0) - 2}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View Profile</DropdownMenuItem>
                      <DropdownMenuItem>View Conversations</DropdownMenuItem>
                      {user.role !== 'OWNER' && user.id !== currentUser?.id && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() =>
                              setDeleteConfirmUser({
                                id: user.id,
                                name: `${user.firstName} ${user.lastName}`,
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Availability Dialog */}
      <Dialog open={availabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Your Availability</DialogTitle>
            <DialogDescription>
              Choose your availability status to let your team know you&apos;re available.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {(['ONLINE', 'AWAY', 'BUSY', 'OFFLINE'] as AgentAvailability[]).map((status) => (
              <Button
                key={status}
                variant="outline"
                className="justify-start gap-2 h-auto py-3"
                onClick={() => availabilityMutation.mutate(status)}
                disabled={availabilityMutation.isPending}
              >
                <AvailabilityBadge status={status} />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account for your team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={newUserFirstName}
                  onChange={(e) => setNewUserFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={newUserLastName}
                  onChange={(e) => setNewUserLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as typeof newUserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AGENT">Agent</SelectItem>
                  <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createUserMutation.mutate()}
              disabled={
                !newUserEmail ||
                !newUserPassword ||
                !newUserFirstName ||
                !newUserLastName ||
                newUserPassword.length < 8 ||
                createUserMutation.isPending
              }
            >
              {createUserMutation.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deleteConfirmUser?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmUser && deleteUserMutation.mutate(deleteConfirmUser.id)}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== TEAMS TAB ====================

function TeamsTab() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [assignChannelDialogOpen, setAssignChannelDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: listTeams,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: listChannels,
  });

  const createMutation = useMutation({
    mutationFn: () => createTeam({ name: newTeamName, description: newTeamDescription }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setCreateDialogOpen(false);
      setNewTeamName('');
      setNewTeamDescription('');
      toast.success('Team created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create team');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => deleteTeam(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete team');
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: () => addTeamMember(selectedTeam!.id, selectedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setAddMemberDialogOpen(false);
      setSelectedUserId('');
      toast.success('Member added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add member');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      removeTeamMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Member removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove member');
    },
  });

  const setLeaderMutation = useMutation({
    mutationFn: ({ teamId, userId, isLeader }: { teamId: string; userId: string; isLeader: boolean }) =>
      setTeamLeader(teamId, userId, isLeader),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team leader updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to set team leader');
    },
  });

  const assignChannelMutation = useMutation({
    mutationFn: () => assignChannelToTeam(selectedTeam!.id, selectedChannelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setAssignChannelDialogOpen(false);
      setSelectedChannelId('');
      toast.success('Channel assigned');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign channel');
    },
  });

  const unassignChannelMutation = useMutation({
    mutationFn: ({ teamId, channelId }: { teamId: string; channelId: string }) =>
      unassignChannelFromTeam(teamId, channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Channel unassigned');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to unassign channel');
    },
  });

  const availableUsers = selectedTeam
    ? users.filter((u) => !selectedTeam.members.some((m) => m.user.id === u.id))
    : [];

  const availableChannels = selectedTeam
    ? channels.filter((c) => !selectedTeam.channels.some((tc) => tc.channel.id === c.id))
    : [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Teams</h2>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UsersRound className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create teams to organize your agents and assign channel access
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {teams.map((team) => {
            const leader = team.members.find((m) => m.isLeader);
            return (
              <Card key={team.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{team.name}</CardTitle>
                      <CardDescription>
                        {team.members.length} members · {team.channels.length} channels
                        {leader && ` · Lead: ${leader.user.firstName} ${leader.user.lastName}`}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedTeam(team);
                            setAddMemberDialogOpen(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Member
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedTeam(team);
                            setAssignChannelDialogOpen(true);
                          }}
                        >
                          <Link className="h-4 w-4 mr-2" />
                          Assign Channel
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(team.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Members */}
                  <div className="mb-4">
                    <p className="text-sm font-medium mb-2">Members</p>
                    <div className="flex flex-wrap gap-2">
                      {team.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-2 bg-muted px-2 py-1 rounded-full text-sm"
                        >
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={member.user.avatarUrl} />
                            <AvatarFallback className="text-xs">
                              {member.user.firstName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span>
                            {member.user.firstName} {member.user.lastName}
                          </span>
                          {member.isLeader && <Crown className="h-3 w-3 text-yellow-500" />}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-5 w-5">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  setLeaderMutation.mutate({
                                    teamId: team.id,
                                    userId: member.user.id,
                                    isLeader: !member.isLeader,
                                  })
                                }
                              >
                                <Crown className="h-4 w-4 mr-2" />
                                {member.isLeader ? 'Remove as Leader' : 'Set as Leader'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() =>
                                  removeMemberMutation.mutate({
                                    teamId: team.id,
                                    userId: member.user.id,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Channels */}
                  {team.channels.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Channel Access</p>
                      <div className="flex flex-wrap gap-2">
                        {team.channels.map((tc) => (
                          <div
                            key={tc.id}
                            className="flex items-center gap-2 bg-muted px-2 py-1 rounded-full text-sm"
                          >
                            <span>{tc.channel.name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() =>
                                unassignChannelMutation.mutate({
                                  teamId: team.id,
                                  channelId: tc.channel.id,
                                })
                              }
                            >
                              <Unlink className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Create a new team to organize agents and assign channel access
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Sales Team"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
                placeholder="Handles incoming sales inquiries"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newTeamName || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member to {selectedTeam?.name}</DialogTitle>
            <DialogDescription>Select a user to add to this team</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstName} {user.lastName} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addMemberMutation.mutate()}
              disabled={!selectedUserId || addMemberMutation.isPending}
            >
              {addMemberMutation.isPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Channel Dialog */}
      <Dialog open={assignChannelDialogOpen} onOpenChange={setAssignChannelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Channel to {selectedTeam?.name}</DialogTitle>
            <DialogDescription>
              Team members will have access to conversations from this channel
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a channel" />
              </SelectTrigger>
              <SelectContent>
                {availableChannels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name} ({channel.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignChannelDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => assignChannelMutation.mutate()}
              disabled={!selectedChannelId || assignChannelMutation.isPending}
            >
              {assignChannelMutation.isPending ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function TeamPage() {
  const [activeTab, setActiveTab] = useState('members');

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Team Management</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-2">
            <UsersRound className="h-4 w-4" />
            Teams
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <MembersTab />
        </TabsContent>

        <TabsContent value="teams">
          <TeamsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
