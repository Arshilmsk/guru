"use client";

import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { CreditCard, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check account status in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const profileData = userDoc.data();
        if (!profileData.isActive) {
          await signOut(auth);
          setError('Your account has been deactivated. Please contact the administrator.');
          setLoading(false);
          return;
        }
      }

      router.push('/dashboard');
    } catch (err: any) {
      console.error("Login error:", err.code);
      let errorMessage = 'Check your credentials and try again.';
      
      if (err.code === 'auth/invalid-email') {
        errorMessage = 'Galat email format hai.';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'Is email se koi account nahi mila.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Password galat hai. Kripya dobara check karein.';
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Email ya Password galat hai.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Bahut saare koshish huye hain. Kripya thodi der baad koshish karein.';
      }
      
      setError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
         <img src="https://picsum.photos/seed/bg-login/1920/1080" alt="background" className="object-cover w-full h-full" />
      </div>
      
      <Card className="w-full max-w-md border-border/50 shadow-2xl relative z-10">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-lg">
            <CreditCard className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight">NREGA GURU</CardTitle>
            <CardDescription className="text-muted-foreground text-sm font-medium">Welcome back! Access your worker portal.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-muted/30"
              />
            </div>
            
            <div className="pt-2">
              <Button type="submit" className="w-full h-11 text-base font-semibold transition-all hover:scale-[1.01]" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-medium">
                  {error}
                </AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Sign up for free
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
