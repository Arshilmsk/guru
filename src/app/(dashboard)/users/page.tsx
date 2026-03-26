
"use client";

import { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, setDoc, serverTimestamp, where, orderBy, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserProfile, UserRole } from '@/app/lib/types';
import { UserPlus, Trash2, Search, Users, ShieldAlert, User, ShieldCheck, Link as LinkIcon, Loader2, Coins, Edit2, AlertCircle, ExternalLink, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';

export default function UserManagementPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkingUser, setLinkingUser] = useState<UserProfile | null>(null);
  const [selectedUserForToken, setSelectedUserForToken] = useState<UserProfile | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [targetAdminId, setTargetAdminId] = useState<string | null>(null);
  const [newTokenValue, setNewTokenValue] = useState<string>('0');
  
  const [newUser, setNewUser] = useState({
    name: '', email: '', mobileNumber: '', gramPanchayat: '', block: '', role: 'User' as UserRole
  });
  const { toast } = useToast();

  const auth = getAuth();

  useEffect(() => {
    if (!profile) return;

    let q;
    if (profile.role === 'SuperAdmin') {
      q = query(collection(db, 'users'));
    } else {
      q = query(collection(db, 'users'), where('createdByUserId', '==', profile.id));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const u: UserProfile[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as UserProfile;
        if (data.role !== 'SuperAdmin') {
          u.push({ id: doc.id, ...data });
        }
      });
      
      u.sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || 0;
        const dateB = b.createdAt?.toMillis?.() || 0;
        return dateA - dateB;
      });

      setUsers(u);
    });

    return () => unsubscribe();
  }, [profile]);

  const adminsList = useMemo(() => {
    return users.filter(u => u.role === 'Admin');
  }, [users]);

  const handleAddUser = async () => {
    if (!profile) return;
    
    if (newUser.mobileNumber.length < 10) {
      toast({ variant: 'destructive', title: 'Invalid Mobile', description: 'Mobile number kam se kam 10 digits ka hona chahiye.' });
      return;
    }

    setLoading(true);
    let secondaryApp;
    try {
      const secondaryAppName = `secondary-app-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, '123456');
      const uid = userCredential.user.uid;

      await setDoc(doc(db, 'users', uid), {
        id: uid,
        ...newUser,
        tokensAvailable: 20,
        isActive: true,
        createdByUserId: profile.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setIsAddOpen(false);
      setNewUser({ name: '', email: '', mobileNumber: '', gramPanchayat: '', block: '', role: 'User' });
      toast({ 
        title: 'User Created Successfully', 
        description: `Login Email: ${newUser.email} | Default Password: 123456` 
      });
    } catch (error: any) {
      console.error("User Creation Error:", error);
      toast({ 
        variant: 'destructive', 
        title: 'Creation Failed', 
        description: error.code === 'auth/email-already-in-use' 
          ? 'This email is already registered in Firebase Auth. If you recently deleted this user, please remove them from the Firebase Console first.' 
          : error.message 
      });
    } finally {
      if (secondaryApp) await deleteApp(secondaryApp);
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    
    if (editingUser.mobileNumber && editingUser.mobileNumber.length < 10) {
      toast({ variant: 'destructive', title: 'Invalid Mobile', description: 'Mobile number 10 digits ka hona chahiye.' });
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', editingUser.id);
      await updateDoc(userRef, {
        name: editingUser.name,
        mobileNumber: editingUser.mobileNumber || '',
        gramPanchayat: editingUser.gramPanchayat,
        block: editingUser.block || '',
        role: editingUser.role,
        updatedAt: serverTimestamp()
      });
      toast({ title: 'User Updated', description: `${editingUser.name}'s details have been saved in Database.` });
      setIsEditUserOpen(false);
      setEditingUser(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (user: UserProfile) => {
    if (!confirm(`Are you sure you want to send a password reset email to ${user.name}?`)) return;
    
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      await updateDoc(doc(db, 'users', user.id), {
        updatedAt: serverTimestamp()
      });

      toast({ 
        title: 'Reset Link Sent & Database Updated', 
        description: `Reset link sent to ${user.email} and record updated in Firebase database.` 
      });
    } catch (error: any) {
      console.error("Reset Error:", error);
      toast({ 
        variant: 'destructive', 
        title: 'Failed to Send Reset Link', 
        description: error.message 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkUser = async () => {
    if (!linkingUser || !targetAdminId) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', linkingUser.id), {
        createdByUserId: targetAdminId,
        updatedAt: serverTimestamp()
      });
      toast({ title: 'Success', description: `${linkingUser.name} has been linked to the selected Admin.` });
      setIsLinkOpen(false);
      setLinkingUser(null);
      setTargetAdminId(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Linking Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTokens = async () => {
    if (!selectedUserForToken || profile?.role !== 'SuperAdmin') return;
    setLoading(true);
    try {
      const tokenAmount = parseInt(newTokenValue);
      if (isNaN(tokenAmount)) throw new Error("Invalid token amount.");

      await updateDoc(doc(db, 'users', selectedUserForToken.id), {
        tokensAvailable: tokenAmount,
        updatedAt: serverTimestamp()
      });

      toast({ 
        title: 'Tokens Updated', 
        description: `Updated ${selectedUserForToken.name}'s balance to ${tokenAmount} tokens.` 
      });
      setIsTokenModalOpen(false);
      setSelectedUserForToken(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (user: UserProfile) => {
    try {
      const newStatus = !user.isActive;
      await updateDoc(doc(db, 'users', user.id), { isActive: newStatus, updatedAt: serverTimestamp() });
      toast({ title: 'Status Updated', description: `${user.name} is now ${newStatus ? 'Active' : 'Inactive'}.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    }
  };

  const deleteUser = async (user: UserProfile) => {
    if (profile?.role !== 'SuperAdmin') return;
    if (confirm(`Are you sure you want to permanently delete ${user.name}? \n\nIMPORTANT: \n1. Firestore data clear ho jayega. \n2. Email dobara use karne ke liye aapko Firebase Console (Authentication) se manually delete karna hoga.`)) {
      setLoading(true);
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'users', user.id));
        const notifQuery = query(collection(db, 'notifications'), where('recipientUserId', '==', user.id));
        const notifSnap = await getDocs(notifQuery);
        notifSnap.forEach((d) => batch.delete(doc(db, 'notifications', d.id)));
        await batch.commit();
        toast({ 
          title: 'User Profile Deleted', 
          description: 'Profile and notifications removed. Manually delete from Auth console to reuse email.' 
        });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Delete Failed', description: error.message });
      } finally {
        setLoading(false);
      }
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const adminUsers = filteredUsers.filter(u => u.role === 'Admin');
  const regularUsers = filteredUsers.filter(u => u.role === 'User');

  const UserTable = ({ data }: { data: UserProfile[] }) => (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[80px]">S.No.</TableHead>
            <TableHead>User Detail</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Tokens</TableHead>
            <TableHead>Linked Admin</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Toggle</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? data.map((user, index) => (
            <TableRow key={user.id} className="hover:bg-muted/10 transition-colors">
              <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col text-xs font-medium">
                  <span>GP: {user.gramPanchayat}</span>
                  <span className="text-muted-foreground">Block: {user.block ?? 'N/A'}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>{user.role}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary">{user.tokensAvailable}</span>
                  {profile?.role === 'SuperAdmin' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 hover:bg-primary/10"
                      onClick={() => {
                        setSelectedUserForToken(user);
                        setNewTokenValue(user.tokensAvailable.toString());
                        setIsTokenModalOpen(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3 text-primary" />
                    </Button>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-xs font-medium">
                  {users.find(u => u.id === user.createdByUserId)?.name || 'Direct / System'}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? 'outline' : 'destructive'} className={user.isActive ? 'border-accent text-accent' : ''}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Switch checked={user.isActive} onCheckedChange={() => toggleStatus(user)} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title="Reset Password" 
                    className="text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                    onClick={() => handleResetPassword(user)}
                    disabled={loading}
                  >
                    <Key className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title="Edit User" 
                    onClick={() => { setEditingUser(user); setIsEditUserOpen(true); }}
                  >
                    <Edit2 className="h-4 w-4 text-primary" />
                  </Button>
                  {profile?.role === 'SuperAdmin' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      title="Link to Admin" 
                      onClick={() => { setLinkingUser(user); setIsLinkOpen(true); }}
                    >
                      <LinkIcon className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                  {profile?.role === 'SuperAdmin' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:bg-destructive/10" 
                      onClick={() => deleteUser(user)}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No users found.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">Monitor and manage access for Admins and Users.</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg h-11 px-6">
                <UserPlus className="h-5 w-5" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <p className="text-xs text-muted-foreground">Default password: 123456</p>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 font-bold text-xs">Auth Email Conflict Warning</AlertTitle>
                  <AlertDescription className="text-[10px] text-amber-700 leading-tight">
                    Agar email pehle kabhi delete kiya hai, toh naya banane se pehle <span className="font-bold underline">Firebase Console (Authentication)</span> se use manually delete karein.
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile Number</Label>
                    <Input 
                      value={newUser.mobileNumber} 
                      onChange={e => setNewUser({...newUser, mobileNumber: e.target.value})} 
                      required 
                      minLength={10}
                      maxLength={10}
                      placeholder="10 digit mobile"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Gram Panchayat</Label>
                    <Input value={newUser.gramPanchayat} onChange={e => setNewUser({...newUser, gramPanchayat: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Block</Label>
                    <Input value={newUser.block} onChange={e => setNewUser({...newUser, block: e.target.value})} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Assigned Role</Label>
                  <Select onValueChange={v => setNewUser({...newUser, role: v as UserRole})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {profile?.role === 'SuperAdmin' && <SelectItem value="Admin">Admin</SelectItem>}
                      <SelectItem value="User">User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="flex flex-col gap-2">
                <div className="flex w-full gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                  <Button className="flex-1" onClick={handleAddUser} disabled={loading}>{loading ? 'Creating...' : 'Create User'}</Button>
                </div>
                <Link href="https://console.firebase.google.com/" target="_blank" className="text-[10px] text-center text-primary flex items-center justify-center gap-1 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Go to Firebase Console
                </Link>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Link User to Admin</DialogTitle>
              <p className="text-sm text-muted-foreground italic">User: {linkingUser?.name}</p>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Select Target Admin</Label>
                <Select onValueChange={setTargetAdminId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an Admin" />
                  </SelectTrigger>
                  <SelectContent>
                    {adminsList.map(admin => (
                      <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsLinkOpen(false)}>Cancel</Button>
              <Button onClick={handleLinkUser} disabled={loading || !targetAdminId}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Linking'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Token Update Modal */}
        <Dialog open={isTokenModalOpen} onOpenChange={setIsTokenModalOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-accent" />
                Update Token Balance
              </DialogTitle>
              <p className="text-sm text-muted-foreground">Adjust tokens for {selectedUserForToken?.name}.</p>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>New Token Amount</Label>
                <Input 
                  type="number" 
                  value={newTokenValue} 
                  onChange={(e) => setNewTokenValue(e.target.value)} 
                  placeholder="Enter token count"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTokenModalOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateTokens} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Modal */}
        <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit User Details</DialogTitle>
            </DialogHeader>
            {editingUser && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input 
                      value={editingUser.name} 
                      onChange={e => setEditingUser({...editingUser, name: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile Number</Label>
                    <Input 
                      value={editingUser.mobileNumber || ''} 
                      onChange={e => setEditingUser({...editingUser, mobileNumber: e.target.value})} 
                      minLength={10}
                      maxLength={10}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Gram Panchayat</Label>
                    <Input 
                      value={editingUser.gramPanchayat} 
                      onChange={e => setEditingUser({...editingUser, gramPanchayat: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Block</Label>
                    <Input 
                      value={editingUser.block || ''} 
                      onChange={e => setEditingUser({...editingUser, block: e.target.value})} 
                    />
                  </div>
                </div>
                {profile?.role === 'SuperAdmin' && (
                  <div className="space-y-2">
                    <Label>Assigned Role</Label>
                    <Select 
                      value={editingUser.role} 
                      onValueChange={v => setEditingUser({...editingUser, role: v as UserRole})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="User">User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditUserOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateUser} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Details'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-1 shadow-sm max-w-md">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input 
            placeholder="Filter by name or email..." 
            className="border-none shadow-none focus-visible:ring-0 h-10" 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="bg-card border shadow-sm mb-4 h-11">
            <TabsTrigger value="all" className="gap-2"><Users className="h-4 w-4" /> All</TabsTrigger>
            {profile?.role === 'SuperAdmin' && (
              <TabsTrigger value="admins" className="gap-2"><ShieldCheck className="h-4 w-4" /> Admins</TabsTrigger>
            )}
            <TabsTrigger value="users" className="gap-2"><User className="h-4 w-4" /> Users</TabsTrigger>
          </TabsList>

          <TabsContent value="all"><UserTable data={filteredUsers} /></TabsContent>
          {profile?.role === 'SuperAdmin' && (
            <TabsContent value="admins"><UserTable data={adminUsers} /></TabsContent>
          )}
          <TabsContent value="users"><UserTable data={regularUsers} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function UserTable({ data }: { data: UserProfile[] }) {
  const { profile } = useAuth();
  const { toggleStatus, deleteUser, handleResetPassword, handleUpdateUser, setSelectedUserForToken, setNewTokenValue, setIsTokenModalOpen, setEditingUser, setIsEditUserOpen, setLinkingUser, setIsLinkOpen, users, loading } = useUserManagement();

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[80px]">S.No.</TableHead>
            <TableHead>User Detail</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Tokens</TableHead>
            <TableHead>Linked Admin</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Toggle</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? data.map((user, index) => (
            <TableRow key={user.id} className="hover:bg-muted/10 transition-colors">
              <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col text-xs font-medium">
                  <span>GP: {user.gramPanchayat}</span>
                  <span className="text-muted-foreground">Block: {user.block ?? 'N/A'}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>{user.role}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary">{user.tokensAvailable}</span>
                  {profile?.role === 'SuperAdmin' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 hover:bg-primary/10"
                      onClick={() => {
                        setSelectedUserForToken(user);
                        setNewTokenValue(user.tokensAvailable.toString());
                        setIsTokenModalOpen(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3 text-primary" />
                    </Button>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-xs font-medium">
                  {users.find(u => u.id === user.createdByUserId)?.name || 'Direct / System'}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? 'outline' : 'destructive'} className={user.isActive ? 'border-accent text-accent' : ''}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Switch checked={user.isActive} onCheckedChange={() => toggleStatus(user)} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title="Reset Password" 
                    className="text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                    onClick={() => handleResetPassword(user)}
                    disabled={loading}
                  >
                    <Key className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title="Edit User" 
                    onClick={() => { setEditingUser(user); setIsEditUserOpen(true); }}
                  >
                    <Edit2 className="h-4 w-4 text-primary" />
                  </Button>
                  {profile?.role === 'SuperAdmin' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      title="Link to Admin" 
                      onClick={() => { setLinkingUser(user); setIsLinkOpen(true); }}
                    >
                      <LinkIcon className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                  {profile?.role === 'SuperAdmin' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:bg-destructive/10" 
                      onClick={() => deleteUser(user)}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No users found.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// Custom hook to share logic between main component and sub-components
function useUserManagement() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkingUser, setLinkingUser] = useState<UserProfile | null>(null);
  const [selectedUserForToken, setSelectedUserForToken] = useState<UserProfile | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [targetAdminId, setTargetAdminId] = useState<string | null>(null);
  const [newTokenValue, setNewTokenValue] = useState<string>('0');
  const { toast } = useToast();
  const auth = getAuth();

  useEffect(() => {
    if (!profile) return;
    let q;
    if (profile.role === 'SuperAdmin') {
      q = query(collection(db, 'users'));
    } else {
      q = query(collection(db, 'users'), where('createdByUserId', '==', profile.id));
    }
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const u: UserProfile[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as UserProfile;
        if (data.role !== 'SuperAdmin') {
          u.push({ id: doc.id, ...data });
        }
      });
      u.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      setUsers(u);
    });
    return () => unsubscribe();
  }, [profile]);

  const handleResetPassword = async (user: UserProfile) => {
    if (!confirm(`Are you sure you want to send a password reset email to ${user.name}?`)) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      await updateDoc(doc(db, 'users', user.id), { updatedAt: serverTimestamp() });
      toast({ title: 'Reset Link Sent', description: `Reset link sent to ${user.email} and record updated in Firebase database.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (user: UserProfile) => {
    try {
      const newStatus = !user.isActive;
      await updateDoc(doc(db, 'users', user.id), { isActive: newStatus, updatedAt: serverTimestamp() });
      toast({ title: 'Status Updated', description: `${user.name} is now ${newStatus ? 'Active' : 'Inactive'}.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    }
  };

  const deleteUser = async (user: UserProfile) => {
    if (profile?.role !== 'SuperAdmin') return;
    if (confirm(`Permanently delete ${user.name}?`)) {
      setLoading(true);
      try {
        await deleteDoc(doc(db, 'users', user.id));
        toast({ title: 'Deleted', description: 'User record removed from database.' });
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Failed', description: err.message });
      } finally {
        setLoading(false);
      }
    }
  };

  return {
    users, searchTerm, setSearchTerm, isAddOpen, setIsAddOpen, isLinkOpen, setIsLinkOpen,
    isTokenModalOpen, setIsTokenModalOpen, isEditUserOpen, setIsEditUserOpen, loading,
    linkingUser, setLinkingUser, selectedUserForToken, setSelectedUserForToken,
    editingUser, setEditingUser, targetAdminId, setTargetAdminId, newTokenValue, setNewTokenValue,
    handleResetPassword, toggleStatus, deleteUser
  };
}
