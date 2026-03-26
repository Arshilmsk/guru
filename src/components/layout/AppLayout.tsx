
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthGuard';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { LayoutDashboard, Users, CreditCard, FileText, Phone, UserCircle, Bell, LogOut, ChevronDown, Search, ClipboardList, CheckCheck, Inbox, AlertTriangle, Mail } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, orderBy } from 'firebase/firestore';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Notification, SystemMessage } from '@/app/lib/types';
import { format } from 'date-fns';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;

    // Notifications Listener
    const recipientIds = [profile.id];
    if (profile.role === 'SuperAdmin') recipientIds.push('SYSTEM_ADMIN');

    const qAll = query(
      collection(db, 'notifications'),
      where('recipientUserId', 'in', recipientIds)
    );

    const unsubscribeAll = onSnapshot(qAll, (snapshot) => {
      const n: Notification[] = [];
      let unread = 0;
      snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() } as Notification;
        n.push(data);
        if (!data.isRead) unread++;
      });
      
      n.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      setNotifications(n.slice(0, 20));
      setUnreadCount(unread);
    });

    // Messages Listener (For Admin/SuperAdmin)
    let unsubscribeMsgs = () => {};
    if (profile.role === 'Admin' || profile.role === 'SuperAdmin') {
      const qMsgs = query(collection(db, 'messages'), where('isRead', '==', false));
      unsubscribeMsgs = onSnapshot(qMsgs, (snapshot) => {
        setUnreadMsgCount(snapshot.size);
      });
    }

    return () => {
      unsubscribeAll();
      unsubscribeMsgs();
    };
  }, [profile]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const handleMarkAllAsRead = async () => {
    if (!profile || notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      const unreadNotifs = notifications.filter(n => !n.isRead);
      unreadNotifs.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { isRead: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.isRead) {
      await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
    }
    setIsNotifOpen(false);
    if (notif.type === 'DEMAND_REQUEST' || notif.type === 'DEMAND_ACCEPTED' || notif.type === 'DEMAND_REJECTED') {
      router.push('/demands');
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isAdminRole = profile?.role === 'Admin' || profile?.role === 'SuperAdmin';

  const menuItems = [
    { title: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', roles: ['SuperAdmin', 'Admin', 'User'] },
    { title: 'User Management', icon: Users, href: '/users', roles: ['SuperAdmin', 'Admin'] },
    { title: 'Job Card Management', icon: CreditCard, href: '/job-cards', roles: ['SuperAdmin', 'Admin', 'User'] },
    { title: 'Demands', icon: ClipboardList, href: '/demands', roles: ['SuperAdmin', 'Admin', 'User'] },
    { title: 'Reports', icon: FileText, href: '/reports', roles: ['SuperAdmin', 'Admin', 'User'] },
    { 
      title: 'Contact Us', 
      icon: Phone, 
      href: '/contact', 
      roles: ['Admin', 'User'], 
      badge: isAdminRole ? unreadMsgCount : 0,
      highlight: isAdminRole && unreadMsgCount > 0
    },
    { title: 'Support Inbox', icon: Mail, href: '/support-inbox', roles: ['SuperAdmin', 'Admin'], badge: unreadMsgCount },
    { title: 'Profile', icon: UserCircle, href: '/profile', roles: ['SuperAdmin', 'Admin', 'User'] },
  ];

  const filteredMenuItems = menuItems.filter(item => profile && item.roles.includes(profile.role));

  const isSuperAdmin = profile?.role === 'SuperAdmin';
  const outOfTokens = profile && !isSuperAdmin && profile.tokensAvailable <= 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <SidebarHeader className="px-6 py-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-lg">
                <span className="text-xl font-bold">NG</span>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">NREGA GURU</h1>
                <p className="text-[10px] uppercase tracking-wider text-accent font-semibold">Worker Portal</p>
              </div>
            </Link>
          </SidebarHeader>
          <SidebarContent className="px-4">
            <SidebarMenu>
              {filteredMenuItems.map((item: any) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    className={`group my-1 transition-all duration-200 hover:bg-white/10 
                      ${pathname.startsWith(item.href) ? 'bg-white/10 text-accent' : 'text-white/80'} 
                      ${item.highlight ? 'bg-accent/10 border-l-4 border-accent shadow-[0_0_15px_rgba(187,219,38,0.15)] text-accent font-bold' : ''}`}
                  >
                    <Link href={item.href} className="flex items-center gap-3">
                      <item.icon className={`h-5 w-5 transition-colors ${pathname.startsWith(item.href) || item.highlight ? 'text-accent' : 'group-hover:text-accent'}`} />
                      <span className="font-medium flex-1">{item.title}</span>
                      {item.badge && item.badge > 0 && (
                        <Badge variant="secondary" className="bg-accent text-accent-foreground h-5 min-w-[20px] px-1 font-bold rounded-full animate-pulse">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-white/5">
            <div className={`rounded-xl p-4 transition-all ${outOfTokens ? 'bg-destructive/20 border border-destructive/50 animate-pulse' : 'bg-white/5'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold ${outOfTokens ? 'bg-destructive text-white' : 'bg-accent text-accent-foreground'}`}>
                  {outOfTokens ? <AlertTriangle className="h-4 w-4" /> : 'T'}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-white/60">Available Tokens</p>
                  <p className={`text-sm font-bold ${outOfTokens ? 'text-destructive-foreground underline underline-offset-2' : 'text-white'}`}>
                    {isSuperAdmin ? 'Unlimited' : (profile?.tokensAvailable ?? 0)}
                  </p>
                </div>
              </div>
              {!isSuperAdmin && (
                <div className="space-y-2">
                   <Button asChild size="sm" variant="outline" className={`w-full bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white ${outOfTokens ? 'bg-destructive/40 border-destructive hover:bg-destructive/60' : ''}`}>
                    <Link href="/contact">Recharge Now</Link>
                  </Button>
                  {outOfTokens && (
                    <p className="text-[9px] text-center text-red-200 font-bold uppercase tracking-tighter">Token recharge karao</p>
                  )}
                </div>
              )}
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col bg-background">
          <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b bg-card/50 backdrop-blur-md px-6 shadow-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <div className="hidden items-center gap-2 rounded-full bg-muted/50 px-3 py-1.5 md:flex">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search workers..." 
                  className="bg-transparent text-sm outline-none placeholder:text-muted-foreground w-48"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Popover open={isNotifOpen} onOpenChange={setIsNotifOpen}>
                <PopoverTrigger asChild>
                  <button 
                    className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white shadow-sm animate-bounce">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
                  <div className="bg-primary p-4 text-primary-foreground flex items-center justify-between">
                    <h3 className="font-bold text-sm">Notifications</h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[10px] hover:bg-white/10 hover:text-white gap-1"
                      onClick={handleMarkAllAsRead}
                    >
                      <CheckCheck className="h-3 w-3" /> Mark all read
                    </Button>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto">
                    {notifications.length > 0 ? (
                      <div className="divide-y">
                        {notifications.map((notif) => (
                          <div 
                            key={notif.id} 
                            className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${!notif.isRead ? 'bg-primary/5' : ''}`}
                            onClick={() => handleNotificationClick(notif)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${!notif.isRead ? 'bg-accent' : 'bg-transparent'}`} />
                              <div className="flex-1">
                                <p className={`text-xs leading-relaxed ${!notif.isRead ? 'font-bold' : 'text-muted-foreground'}`}>
                                  {notif.message}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-2">
                                  {notif.createdAt?.toDate ? format(notif.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Recently'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
                        <Inbox className="h-10 w-10 opacity-20 mb-2" />
                        <p className="text-xs italic">No notifications yet</p>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-auto p-0 hover:bg-transparent">
                    <div className="flex items-center gap-3 text-left">
                      <Avatar key={profile?.photoURL} className="h-9 w-9 border-2 border-accent shadow-sm">
                        <AvatarImage src={profile?.photoURL} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getInitials(profile?.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="hidden flex-col md:flex">
                        <p className="text-sm font-semibold">{profile?.name}</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">{profile?.role}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/profile')}>
                    <UserCircle className="mr-2 h-4 w-4" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-6 lg:p-10">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
