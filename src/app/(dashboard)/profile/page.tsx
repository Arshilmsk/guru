
"use client";

import { useAuth } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Shield, MapPin, Mail, Phone, Calendar, Key, Camera, Trash2, Loader2, UserCircle, User, Check, X, Edit2, Lock } from 'lucide-react';
import { auth, db, storage } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password Change States
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  const [formData, setFormData] = useState({
    name: '',
    mobileNumber: '',
    gramPanchayat: '',
    block: ''
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        mobileNumber: profile.mobileNumber || '',
        gramPanchayat: profile.gramPanchayat || '',
        block: profile.block || ''
      });
    }
  }, [profile]);

  if (!profile || !user) return null;

  const isSuperAdmin = profile.role === 'SuperAdmin';

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleUpdateProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', profile.id);
      await updateDoc(userRef, {
        ...formData,
        updatedAt: serverTimestamp()
      });
      toast({ title: 'Profile Updated', description: 'Your personal information has been saved.' });
      setIsEditing(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) {
      toast({ variant: 'destructive', title: 'Error', description: 'Naya password aur confirm password match nahi kar rahe.' });
      return;
    }

    if (passwords.new.length < 10) {
      toast({ variant: 'destructive', title: 'Error', description: 'Password kam se kam 10 characters ka hona chahiye.' });
      return;
    }

    setPasswordLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email!, passwords.current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwords.new);
      
      toast({ title: 'Success', description: 'Aapka password kamyabi se badal diya gaya hai.' });
      setIsPasswordOpen(false);
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (error: any) {
      console.error(error);
      let msg = error.message;
      if (error.code === 'auth/wrong-password') msg = 'Purana password galat hai.';
      toast({ variant: 'destructive', title: 'Failed', description: msg });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid File', description: 'Please select an image file.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Please select an image under 2MB.' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    
    try {
      const storagePath = `profiles/${profile.id}/avatar_${Date.now()}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        }, 
        (error) => {
          toast({ variant: 'destructive', title: 'Upload Failed', description: error.message });
          setUploading(false);
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const userRef = doc(db, 'users', profile.id);
          await updateDoc(userRef, {
            photoURL: downloadURL,
            updatedAt: serverTimestamp()
          });

          toast({ title: 'Photo Uploaded', description: 'Aapki profile image Firebase Storage mein save ho gayi hai.' });
          setUploading(false);
          setUploadProgress(0);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      );
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!profile || !profile.photoURL) return;
    if (!confirm('Are you sure you want to remove your profile picture?')) return;

    setUploading(true);
    try {
      await updateDoc(doc(db, 'users', profile.id), {
        photoURL: "",
        updatedAt: serverTimestamp()
      });
      toast({ title: 'Photo Removed', description: 'Your profile picture has been removed.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row items-center gap-6 p-8 rounded-3xl bg-primary text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
             <img src="https://picsum.photos/seed/profile-bg/1200/400" alt="bg" className="object-cover w-full h-full" />
          </div>
          
          <div className="relative group z-10">
            <Avatar key={profile.photoURL} className="h-32 w-32 border-4 border-accent shadow-2xl transition-transform group-hover:scale-105 overflow-hidden">
              <AvatarImage src={profile.photoURL} className="object-cover" />
              <AvatarFallback className="text-4xl font-bold bg-white text-primary">
                {getInitials(profile.name)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 flex gap-1">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*" 
              />
              <Button 
                size="icon" 
                className="h-10 w-10 rounded-full bg-accent text-accent-foreground shadow-lg hover:scale-110 transition-all"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </Button>
              {profile.photoURL && (
                <Button 
                  size="icon" 
                  variant="destructive"
                  className="h-10 w-10 rounded-full shadow-lg hover:scale-110 transition-all"
                  onClick={handleRemovePhoto}
                  disabled={uploading}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              )}
            </div>
            {uploading && uploadProgress > 0 && (
              <div className="absolute -bottom-4 left-0 w-full px-2">
                <Progress value={uploadProgress} className="h-1.5 bg-white/20" />
              </div>
            )}
          </div>

          <div className="z-10 text-center md:text-left flex-1">
            <div className="flex flex-col md:flex-row items-center gap-3">
              <h1 className="text-4xl font-extrabold tracking-tight">{profile.name}</h1>
              <Badge variant="secondary" className="bg-accent text-accent-foreground font-black px-4 py-1 uppercase tracking-widest text-[10px]">{profile.role}</Badge>
            </div>
            <p className="opacity-90 mt-2 flex items-center justify-center md:justify-start gap-2 font-medium">
              <MapPin className="h-4 w-4 text-accent" /> {profile.gramPanchayat}, {profile.block ?? 'Main Block'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-4">
               <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                  <p className="text-[10px] uppercase font-bold text-white/60 tracking-tighter">Tokens</p>
                  <p className="font-black text-xl">{isSuperAdmin ? 'Unlimited' : profile.tokensAvailable}</p>
               </div>
               <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                  <p className="text-[10px] uppercase font-bold text-white/60 tracking-tighter">Status</p>
                  <p className="font-black text-xl text-accent">{profile.isActive ? 'ACTIVE' : 'INACTIVE'}</p>
               </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="col-span-2 shadow-2xl border-border/40 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserCircle className="h-5 w-5 text-primary" />
                  Personal Information
                </CardTitle>
                <CardDescription>Update your contact settings and account details.</CardDescription>
              </div>
              {!isEditing && (
                <Button variant="ghost" size="sm" className="gap-2" onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4" /> Edit
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-muted-foreground tracking-widest">Full Name</Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      disabled={!isEditing} 
                      className={`bg-muted/30 pl-10 border-none font-semibold ${isEditing ? 'ring-2 ring-primary/20' : ''}`} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-muted-foreground tracking-widest">Email Address</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input value={profile.email} disabled className="bg-muted/30 pl-10 border-none font-semibold opacity-60" />
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">Email cannot be changed.</p>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-muted-foreground tracking-widest">Mobile Number</Label>
                  <div className="relative group">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input 
                      value={formData.mobileNumber} 
                      onChange={e => setFormData({...formData, mobileNumber: e.target.value})}
                      disabled={!isEditing} 
                      className={`bg-muted/30 pl-10 border-none font-semibold ${isEditing ? 'ring-2 ring-primary/20' : ''}`} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-muted-foreground tracking-widest">Gram Panchayat</Label>
                  <div className="relative group">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input 
                      value={formData.gramPanchayat} 
                      onChange={e => setFormData({...formData, gramPanchayat: e.target.value})}
                      disabled={!isEditing} 
                      className={`bg-muted/30 pl-10 border-none font-semibold ${isEditing ? 'ring-2 ring-primary/20' : ''}`} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-muted-foreground tracking-widest">Block</Label>
                  <div className="relative group">
                    <Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input 
                      value={formData.block} 
                      onChange={e => setFormData({...formData, block: e.target.value})}
                      disabled={!isEditing} 
                      className={`bg-muted/30 pl-10 border-none font-semibold ${isEditing ? 'ring-2 ring-primary/20' : ''}`} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-muted-foreground tracking-widest">Account Created</Label>
                  <div className="relative group">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input 
                      value={profile.createdAt?.toDate ? profile.createdAt.toDate().toLocaleDateString() : 'New Account'} 
                      disabled 
                      className="bg-muted/30 pl-10 border-none font-semibold opacity-60" 
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 p-6 border-t flex flex-col sm:flex-row gap-3">
               {isEditing ? (
                 <>
                   <Button 
                    className="w-full sm:w-auto h-11 px-8 font-bold gap-2" 
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setFormData({
                        name: profile.name,
                        mobileNumber: profile.mobileNumber || '',
                        gramPanchayat: profile.gramPanchayat,
                        block: profile.block || ''
                      });
                    }}
                   >
                      <X className="h-4 w-4" /> Cancel
                   </Button>
                   <Button 
                    className="w-full sm:w-auto h-11 px-8 font-bold gap-2 bg-accent text-accent-foreground shadow-lg" 
                    onClick={handleUpdateProfile}
                    disabled={saving}
                   >
                     {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                     Save Changes
                   </Button>
                 </>
               ) : (
                 <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
                   <DialogTrigger asChild>
                     <Button 
                      className="w-full sm:w-auto h-11 px-8 font-bold gap-2 bg-primary text-white shadow-lg"
                     >
                       <Lock className="h-4 w-4" /> Change Password
                     </Button>
                   </DialogTrigger>
                   <DialogContent className="sm:max-w-[400px]">
                     <DialogHeader>
                       <DialogTitle className="flex items-center gap-2">
                         <Key className="h-5 w-5 text-accent" />
                         Apna Password Badlein
                       </DialogTitle>
                       <DialogDescription>
                         Password badalne ke liye aapko purana password dena hoga. (Minimum 10 characters)
                       </DialogDescription>
                     </DialogHeader>
                     <div className="py-4 space-y-4">
                       <div className="space-y-2">
                         <Label>Current Password</Label>
                         <Input 
                           type="password" 
                           placeholder="••••••••" 
                           value={passwords.current} 
                           onChange={e => setPasswords({...passwords, current: e.target.value})}
                         />
                       </div>
                       <div className="space-y-2">
                         <Label>New Password</Label>
                         <Input 
                           type="password" 
                           placeholder="••••••••" 
                           value={passwords.new} 
                           onChange={e => setPasswords({...passwords, new: e.target.value})}
                           minLength={10}
                         />
                       </div>
                       <div className="space-y-2">
                         <Label>Confirm New Password</Label>
                         <Input 
                           type="password" 
                           placeholder="••••••••" 
                           value={passwords.confirm} 
                           onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                           minLength={10}
                         />
                       </div>
                     </div>
                     <DialogFooter>
                       <Button variant="outline" onClick={() => setIsPasswordOpen(false)}>Cancel</Button>
                       <Button 
                         onClick={handlePasswordChange} 
                         disabled={passwordLoading || !passwords.current || !passwords.new || !passwords.confirm}
                         className="bg-accent text-accent-foreground"
                       >
                         {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
                       </Button>
                     </DialogFooter>
                   </DialogContent>
                 </Dialog>
               )}
            </CardFooter>
          </Card>

          <Card className="shadow-2xl border-border/40 overflow-hidden h-fit">
            <CardHeader className="bg-primary/5 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                Your Permissions
              </CardTitle>
              <CardDescription>Based on your assigned role.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <PermissionItem label="Create Users" active={['SuperAdmin', 'Admin'].includes(profile.role)} />
              <PermissionItem label="Bulk Upload Cards" active={['SuperAdmin', 'Admin'].includes(profile.role)} />
              <PermissionItem label="Manage Demands" active={true} />
              <PermissionItem label="System Analytics" active={isSuperAdmin} />
              <PermissionItem label="Permanent Deletion" active={isSuperAdmin} />
              <PermissionItem label="AI Verification" active={true} />
              
              <div className="mt-8 p-4 rounded-2xl bg-accent/10 border border-accent/20">
                <p className="text-[10px] font-black uppercase text-accent mb-2 tracking-widest">Support Tip</p>
                <p className="text-xs font-medium text-foreground/70 leading-relaxed italic">
                  "Role based permissions system ensures that your actions are safe and secure within the portal."
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function PermissionItem({ label, active }: { label: string, active: boolean }) {
  return (
    <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${active ? 'bg-accent/5 border-accent/20 shadow-sm' : 'bg-muted/20 opacity-40 grayscale'}`}>
      <span className="text-sm font-bold">{label}</span>
      <div className={`h-6 w-6 rounded-full flex items-center justify-center ${active ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
        <Shield className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}
