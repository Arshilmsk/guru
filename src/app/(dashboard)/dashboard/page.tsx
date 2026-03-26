
"use client";

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserRole, Notification, DemandRequest } from '@/app/lib/types';
import { Users, UserCheck, ShieldCheck, CreditCard, Activity, Bell, Check, X, FileText, Loader2, Calendar } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const MANDAY_RATE = 252;

export default function DashboardPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState({
    totalUsers: 0, activeUsers: 0, inactiveUsers: 0,
    totalAdmins: 0, activeAdmins: 0, inactiveAdmins: 0,
    totalJobCards: 0
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<DemandRequest | null>(null);
  const [isDemandModalOpen, setIsDemandModalOpen] = useState(false);
  const [demandLoading, setDemandLoading] = useState(false);
  const [acceptStartDate, setAcceptStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!profile) return;

    // Fetch stats for SuperAdmin
    if (profile.role === 'SuperAdmin') {
      const usersQuery = collection(db, 'users');
      const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        let tu = 0, au = 0, iu = 0, ta = 0, aa = 0, ia = 0;
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.role === 'User') {
            tu++;
            if (data.isActive) au++; else iu++;
          } else if (data.role === 'Admin') {
            ta++;
            if (data.isActive) aa++; else ia++;
          }
        });
        setStats(prev => ({ ...prev, totalUsers: tu, activeUsers: au, inactiveUsers: iu, totalAdmins: ta, activeAdmins: aa, inactiveAdmins: ia }));
      });

      // Global Job Cards listener for SuperAdmin
      const jcAllQuery = collection(db, 'job_cards');
      const unsubscribeJobCards = onSnapshot(jcAllQuery, (snapshot) => {
        setStats(prev => ({ ...prev, totalJobCards: snapshot.size }));
      });

      const recipientIds = [profile.id, 'SYSTEM_ADMIN'];
      const notifyQuery = query(
        collection(db, 'notifications'), 
        where('recipientUserId', 'in', recipientIds)
      );
      const unsubscribeNotify = onSnapshot(notifyQuery, (snapshot) => {
        const n: Notification[] = [];
        snapshot.forEach(doc => n.push({ id: doc.id, ...doc.data() } as Notification));
        // Client-side sorting and limiting to avoid composite index error
        n.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setNotifications(n.slice(0, 10));
      });

      return () => { 
        unsubscribeUsers(); 
        unsubscribeJobCards();
        unsubscribeNotify(); 
      };
    } else {
      // For Admin/User
      const notifyQuery = query(
        collection(db, 'notifications'), 
        where('recipientUserId', '==', profile.id)
      );
      const unsubscribeNotify = onSnapshot(notifyQuery, (snapshot) => {
        const n: Notification[] = [];
        snapshot.forEach(doc => n.push({ id: doc.id, ...doc.data() } as Notification));
        // Client-side sorting
        n.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setNotifications(n.slice(0, 10));
      });
      
      const jcQuery = query(collection(db, 'job_cards'), where('addedByUserId', '==', profile.id));
      const unsubscribeJC = onSnapshot(jcQuery, (snapshot) => {
        setStats(prev => ({ ...prev, totalJobCards: snapshot.size }));
      });

      return () => { unsubscribeNotify(); unsubscribeJC(); };
    }
  }, [profile]);

  const handleNotificationClick = async (notif: Notification) => {
    if (notif.type === 'DEMAND_REQUEST' && notif.relatedEntityId) {
      setDemandLoading(true);
      try {
        const demandSnap = await getDoc(doc(db, 'demands', notif.relatedEntityId));
        if (demandSnap.exists()) {
          setSelectedDemand({ id: demandSnap.id, ...demandSnap.data() } as DemandRequest);
          setIsDemandModalOpen(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setDemandLoading(false);
      }
    }
    
    // Mark as read
    if (!notif.isRead) {
      updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
    }
  };

  const handleDemandResponse = async (status: 'Accepted' | 'Rejected') => {
    if (!selectedDemand || !profile) return;
    setDemandLoading(true);
    try {
      const batch = writeBatch(db);

      const updates: any = {
        status,
        updatedAt: serverTimestamp()
      };

      if (status === 'Accepted') {
        updates.startDate = Timestamp.fromDate(new Date(acceptStartDate));
      }

      batch.update(doc(db, 'demands', selectedDemand.id), updates);

      if (status === 'Rejected') {
        for (const item of selectedDemand.items) {
          const jcRef = doc(db, 'job_cards', item.jobCardId);
          const jcSnap = await getDoc(jcRef);
          if (jcSnap.exists()) {
            const currentMandays = jcSnap.data().mandays || 0;
            batch.update(jcRef, {
              mandays: currentMandays + item.deductedDays,
              lastUpdated: serverTimestamp()
            });
          }
        }
      }

      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, {
        id: notifRef.id,
        recipientUserId: selectedDemand.requesterId,
        message: `Your demand for ${selectedDemand.items.length} workers has been ${status} by ${profile.name}.`,
        type: status === 'Accepted' ? 'DEMAND_ACCEPTED' : 'DEMAND_REJECTED',
        isRead: false,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      toast({ title: `Demand ${status}`, description: `Action processed successfully.` });
      setIsDemandModalOpen(false);
      setSelectedDemand(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setDemandLoading(false);
    }
  };

  const chartData = [
    { name: 'Active', count: stats.activeUsers },
    { name: 'Inactive', count: stats.inactiveUsers },
    { name: 'Admins', count: stats.activeAdmins },
  ];

  if (!profile) return null;

  const isSuperAdmin = profile.role === 'SuperAdmin';

  const selectedDemandTotalMandays = selectedDemand?.items.reduce((sum, item) => sum + item.deductedDays, 0) || 0;
  const selectedDemandTotalAmount = selectedDemandTotalMandays * MANDAY_RATE;

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Welcome, {profile.name}!</h1>
          <p className="text-muted-foreground mt-1 text-lg">Your {profile.role} dashboard is ready.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {isSuperAdmin ? (
            <>
              <StatCard title="Total Users" count={stats.totalUsers.toString()} icon={Users} sub={`Active: ${stats.activeUsers}`} color="text-primary" />
              <StatCard title="Active Admins" count={stats.activeAdmins.toString()} icon={ShieldCheck} sub={`Inactive: ${stats.inactiveAdmins}`} color="text-accent" />
              <StatCard title="Total Job Cards" count={stats.totalJobCards.toString()} icon={CreditCard} sub="Across system" color="text-blue-500" />
              <StatCard title="Tokens Remaining" count="Unlimited" icon={Activity} sub="SuperAdmin quota" color="text-accent" />
            </>
          ) : (
            <>
              <StatCard title="My Job Cards" count={stats.totalJobCards.toString()} icon={CreditCard} sub="Added by me" color="text-primary" />
              <StatCard title="Tokens" count={profile.tokensAvailable.toString()} icon={Activity} sub="Token balance" color="text-accent" />
              <StatCard title="Status" count={profile.isActive ? "Active" : "Inactive"} icon={UserCheck} sub="Account state" color={profile.isActive ? "text-green-500" : "text-destructive"} />
              <StatCard title="Notifications" count={notifications.filter(n => !n.isRead).length.toString()} icon={Bell} sub="Unread messages" color="text-primary" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {isSuperAdmin && (
            <Card className="border-border/40 shadow-xl overflow-hidden">
              <CardHeader className="bg-muted/30">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-accent" />
                  Engagement Analytics
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border/40 shadow-xl">
            <CardHeader className="bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-accent" />
                Recent Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className={`flex items-start gap-4 p-3 rounded-lg border cursor-pointer transition-colors ${notif.isRead ? 'bg-card opacity-60' : 'bg-primary/5 border-primary/20 hover:bg-primary/10'}`}
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div className={`mt-1 h-2 w-2 rounded-full ${notif.type === 'DEMAND_REQUEST' ? 'bg-accent animate-pulse' : 'bg-primary'}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{notif.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {notif.createdAt?.toDate ? format(notif.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Recently'}
                        </p>
                        {notif.type === 'DEMAND_REQUEST' && !notif.isRead && (
                          <Badge variant="secondary" className="mt-2 text-[10px] h-5 bg-accent text-accent-foreground font-bold">Action Required</Badge>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground italic">No notifications found.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDemandModalOpen} onOpenChange={setIsDemandModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-accent" />
              Demand Request Details
            </DialogTitle>
            <DialogDescription>Review the demand submitted by {selectedDemand?.requesterName}.</DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Summary</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Requested Days:</span>
                <span className="font-bold">{selectedDemand?.demandDays} Days</span>
                <span className="text-muted-foreground">Total Workers:</span>
                <span className="font-bold">{selectedDemand?.items.length}</span>
                <span className="text-muted-foreground">Total Mandays:</span>
                <span className="font-bold text-primary">{selectedDemandTotalMandays}</span>
                <span className="text-muted-foreground">Total Amount:</span>
                <span className="font-bold text-accent">₹{selectedDemandTotalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-muted-foreground">Worker List</p>
              <div className="max-h-[200px] overflow-y-auto border rounded-md divide-y bg-card">
                {selectedDemand?.items.map((item, idx) => (
                  <div key={idx} className="p-3 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-bold">{item.workerName}</p>
                      <p className="text-[10px] text-muted-foreground">{item.jobCardNumber}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">-{item.deductedDays} Days</Badge>
                  </div>
                ))}
              </div>
            </div>

            {selectedDemand?.status === 'Pending' && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="start-date-dash" className="text-xs font-bold uppercase text-muted-foreground">Demand Start Date</Label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-accent" />
                  <Input 
                    id="start-date-dash" 
                    type="date" 
                    value={acceptStartDate}
                    onChange={(e) => setAcceptStartDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            )}

            {selectedDemand?.status !== 'Pending' && (
              <div className={`p-3 rounded-md text-center font-bold border ${selectedDemand?.status === 'Accepted' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                This request has been {selectedDemand?.status}.
              </div>
            )}
          </div>

          <DialogFooter className="flex sm:flex-row gap-2">
            {selectedDemand?.status === 'Pending' ? (
              <>
                <Button 
                  variant="outline" 
                  className="sm:flex-1 border-destructive text-destructive hover:bg-destructive/10 gap-2"
                  onClick={() => handleDemandResponse('Rejected')}
                  disabled={demandLoading}
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button 
                  className="sm:flex-1 bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                  onClick={() => handleDemandResponse('Accepted')}
                  disabled={demandLoading}
                >
                  <Check className="h-4 w-4" /> Accept & Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setIsDemandModalOpen(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function StatCard({ title, count, icon: Icon, sub, color }: { title: string; count: string; icon: any; sub: string; color: string }) {
  return (
    <Card className="border-border/40 shadow-md group">
      <CardContent className="flex items-center gap-5 p-6">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40 transition-colors group-hover:bg-primary/10 ${color}`}>
          <Icon className="h-8 w-8" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-2xl font-bold tracking-tight">{count}</h3>
            <span className="text-[10px] font-medium text-accent">{sub}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
