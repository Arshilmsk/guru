
"use client";

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SystemMessage } from '@/app/lib/types';
import { Mail, MailOpen, Trash2, Clock, User, Inbox, Loader2, Reply, Send, CheckCircle2, X, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function SupportInboxPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyLoading, setReplyLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<SystemMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!profile || (profile.role !== 'SuperAdmin' && profile.role !== 'Admin')) return;

    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: SystemMessage[] = [];
      snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() } as SystemMessage));
      setMessages(msgs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const toggleRead = async (msg: SystemMessage) => {
    try {
      await updateDoc(doc(db, 'messages', msg.id), { isRead: true });
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDeleteMessage = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent triggering row click (read status)
    
    if (!window.confirm('Kya aap waqai is message ko delete karna chahte hain?')) return;
    
    setDeleteLoading(id);
    try {
      await deleteDoc(doc(db, 'messages', id));
      toast({ title: 'Message Deleted', description: 'Record ko permanently hata diya gaya hai.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleReplySubmit = async () => {
    if (!selectedMessage || !replyText.trim() || !profile) return;
    setReplyLoading(true);
    try {
      // 1. Send notification to the user
      await addDoc(collection(db, 'notifications'), {
        recipientUserId: selectedMessage.senderUserId,
        message: `Reply from Support: ${replyText}`,
        type: 'info',
        isRead: false,
        createdAt: serverTimestamp()
      });

      // 2. Mark original message as read AND store the reply details
      await updateDoc(doc(db, 'messages', selectedMessage.id), { 
        isRead: true,
        replyContent: replyText,
        repliedAt: serverTimestamp(),
        repliedBy: profile.name
      });

      toast({ title: 'Reply Sent', description: 'Jawab bhej diya gaya hai aur record mein save hai.' });
      setIsReplyOpen(false);
      setReplyText('');
      setSelectedMessage(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to Send', description: err.message });
    } finally {
      setReplyLoading(false);
    }
  };

  const getPriorityColor = (p?: string) => {
    switch (p) {
      case 'Urgent': return 'bg-red-500 text-white border-none';
      case 'High': return 'bg-orange-500 text-white border-none';
      case 'Medium': return 'bg-yellow-500 text-white border-none';
      case 'Low': return 'bg-blue-500 text-white border-none';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (profile?.role === 'User') {
    return (
      <AppLayout>
        <div className="flex h-[400px] items-center justify-center">
          <p className="text-muted-foreground font-bold">Access Denied. Admins Only.</p>
        </div>
      </AppLayout>
    );
  }

  const isSuperAdmin = profile?.role === 'SuperAdmin';
  const isAdminOrSuper = profile?.role === 'Admin' || profile?.role === 'SuperAdmin';

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Support Inbox</h1>
            <p className="text-muted-foreground">User queries aur token recharge requests ko manage karein.</p>
          </div>
          <Badge variant="secondary" className="bg-primary text-white h-8 px-4 text-sm gap-2">
            <Inbox className="h-4 w-4" /> {messages.filter(m => !m.isRead).length} New Messages
          </Badge>
        </div>

        <Card className="border-border/40 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse">Fetching messages...</p>
              </div>
            ) : messages.length > 0 ? (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[180px]">Sender Info</TableHead>
                    <TableHead className="w-[120px]">Priority</TableHead>
                    <TableHead>Message & Reply History</TableHead>
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="text-right w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((msg) => (
                    <TableRow 
                      key={msg.id} 
                      className={`cursor-pointer transition-colors ${msg.isRead ? 'opacity-70 bg-muted/5' : 'bg-primary/5 hover:bg-primary/10'}`}
                      onClick={() => !msg.isRead && toggleRead(msg)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm">{msg.senderName}</span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{msg.senderEmail}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-2 h-5 font-bold ${getPriorityColor(msg.priority)}`}>
                          {msg.priority || 'Normal'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="space-y-2">
                          <p className={`text-sm leading-relaxed ${!msg.isRead ? 'font-bold' : ''}`}>
                            {msg.content}
                          </p>
                          {msg.replyContent && (
                            <div className="mt-2 p-3 rounded-lg bg-accent/5 border border-accent/20 shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
                              <p className="text-[10px] font-bold text-accent uppercase mb-1 flex items-center gap-1">
                                <Reply className="h-3 w-3" /> Replied by {msg.repliedBy || 'Support'}
                              </p>
                              <p className="text-xs italic text-muted-foreground font-medium">"{msg.replyContent}"</p>
                              {msg.repliedAt && (
                                <p className="text-[9px] text-muted-foreground mt-1 text-right">
                                  {msg.repliedAt.toDate ? format(msg.repliedAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Recently'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Recently'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={msg.isRead ? 'outline' : 'default'} className={!msg.isRead ? 'bg-accent text-accent-foreground animate-pulse' : ''}>
                            {msg.isRead ? 'Read' : 'New'}
                          </Badge>
                          {msg.replyContent && (
                            <Badge variant="outline" className="border-accent text-accent bg-accent/5 flex items-center gap-1 text-[9px] h-5">
                              <CheckCircle2 className="h-2 w-2" /> Replied
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isAdminOrSuper && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-primary hover:bg-primary/10 h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMessage(msg);
                                setIsReplyOpen(true);
                              }}
                              title={msg.replyContent ? "Update Reply" : "Reply to User"}
                            >
                              <Reply className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (msg.isRead) {
                                updateDoc(doc(db, 'messages', msg.id), { isRead: false });
                              } else {
                                toggleRead(msg);
                              }
                            }} 
                            title={msg.isRead ? 'Mark as Unread' : 'Mark as Read'}
                          >
                            {msg.isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4 text-accent" />}
                          </Button>
                          {isSuperAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive hover:bg-destructive/10 h-8 w-8" 
                              onClick={(e) => handleDeleteMessage(e, msg.id)}
                              disabled={deleteLoading === msg.id}
                              title="Delete Message"
                            >
                              {deleteLoading === msg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                <Inbox className="h-16 w-16 opacity-10 mb-4" />
                <p className="text-xl font-medium">No messages in inbox</p>
                <p className="text-sm">User requests abhi tak nahi aaye hain.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isReplyOpen} onOpenChange={setIsReplyOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Reply className="h-5 w-5 text-accent" />
              Reply to {selectedMessage?.senderName}
            </DialogTitle>
            <DialogDescription>
              Aapka jawab user ke dashboard par notification ki tarah dikhega.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-lg bg-muted/30 p-3 border text-xs">
              <p className="font-bold text-muted-foreground mb-1 uppercase">Original Message:</p>
              <p className="italic">"{selectedMessage?.content}"</p>
            </div>
            {selectedMessage?.replyContent && (
              <div className="rounded-lg bg-accent/5 p-3 border border-accent/20 text-xs">
                <p className="font-bold text-accent mb-1 uppercase">Previous Reply:</p>
                <p className="italic">"{selectedMessage?.replyContent}"</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="reply-text">Jawab Likhein</Label>
              <Textarea 
                id="reply-text" 
                placeholder="Apna response yahan likhein..." 
                className="min-h-[150px]"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReplyOpen(false)}>Cancel</Button>
            <Button 
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleReplySubmit}
              disabled={replyLoading || !replyText.trim()}
            >
              {replyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {selectedMessage?.replyContent ? 'Update Reply' : 'Send Jawab'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
