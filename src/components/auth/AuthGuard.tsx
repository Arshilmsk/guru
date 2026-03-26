
"use client";

import { useEffect, useState, createContext, useContext } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { UserProfile } from '@/app/lib/types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let unsubscribeProfile = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Listen to the user profile in real-time
        unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            const profileData = docSnap.data() as UserProfile;
            
            // Check if account is inactive
            if (!profileData.isActive) {
              signOut(auth);
              setUser(null);
              setProfile(null);
              if (!['/login', '/signup'].includes(pathname)) {
                router.push('/login');
              }
            } else {
              setProfile(profileData);
            }
          } else {
            // Profile doesn't exist yet (might be mid-signup)
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("AuthGuard profile sync error:", error);
          setLoading(false);
        });
      } else {
        setUser(null);
        setProfile(null);
        unsubscribeProfile();
        setLoading(false);
        if (!['/login', '/signup'].includes(pathname)) {
          router.push('/login');
        }
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, [pathname, router]);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && !['/login', '/signup'].includes(pathname)) {
      router.push('/login');
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
};
