
"use client";

import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, collection, getDocs, limit, query, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { UserRole } from '@/app/lib/types';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    gramPanchayat: '',
    block: '',
    mobileNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.mobileNumber.length < 10) {
      toast({ variant: 'destructive', title: 'Invalid Mobile', description: 'Mobile number kam se kam 10 digits ka hona chahiye.' });
      return;
    }

    setLoading(true);
    try {
      // 1. Create the Auth user first
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // 2. Check if any user profiles exist in Firestore
      const usersRef = collection(db, 'users');
      const q = query(usersRef, limit(1));
      const querySnapshot = await getDocs(q);
      const isFirstUser = querySnapshot.empty;

      const role: UserRole = isFirstUser ? 'SuperAdmin' : 'User';

      // 3. Create the profile document
      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        name: formData.name,
        email: formData.email,
        gramPanchayat: formData.gramPanchayat,
        block: formData.block || 'Main Block',
        mobileNumber: formData.mobileNumber,
        role: role,
        tokensAvailable: 20,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Account Created',
        description: `Welcome! You are registered as ${role}.`,
      });
      
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 500);

    } catch (error: any) {
      console.error("Signup Error:", error);
      toast({
        variant: 'destructive',
        title: 'Signup Failed',
        description: error.message || 'Check your details and try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
       <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
         <img src="https://picsum.photos/seed/bg-signup/1920/1080" alt="background" className="object-cover w-full h-full" />
      </div>

      <Card className="w-full max-w-lg border-border/50 shadow-2xl relative z-10">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight">Join NREGA GURU</CardTitle>
            <CardDescription className="text-muted-foreground">Start managing workers and job cards efficiently.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile Number</Label>
                <Input
                  id="mobile"
                  placeholder="10 digit mobile"
                  value={formData.mobileNumber}
                  onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                  required
                  minLength={10}
                  maxLength={10}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="panchayat">Gram Panchayat</Label>
                <Input
                  id="panchayat"
                  placeholder="Enter Panchayat Name"
                  value={formData.gramPanchayat}
                  onChange={(e) => setFormData({ ...formData, gramPanchayat: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block">Block</Label>
                <Input
                  id="block"
                  placeholder="Enter Block Name"
                  value={formData.block}
                  onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
