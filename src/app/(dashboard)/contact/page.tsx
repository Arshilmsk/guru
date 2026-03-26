
"use client";

import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Send, Phone, Mail, MapPin, History, MessageSquare, Reply, Clock, Loader2, CornerDownRight, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { SystemMessage } from '@/app/lib/types';

export default function ContactPage() {
  const { profile } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High' | 'Urgent'
  });
  const [loading, setLoading] = useState(false);
  const [userMessages, setUserMessages] = useState<SystemMessage[]>([]);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [userReplyText, setUserReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const { toast } = useToast();

  // Populate user info from profile when it loads
  useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        ...prev,
        name: profile.name || '',
        email: profile.email || ''
      }));
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'messages'),
      where('senderUserId', '==', profile.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: SystemMessage[] = [];
      snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() } as SystemMessage));
      setUserMessages(msgs);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderName: formData.name,
        senderEmail: formData.email,
        senderUserId: profile?.id || 'anonymous',
        content: formData.message,
        priority: formData.priority,
        isRead: false,
        createdAt: serverTimestamp()
      });
      toast({ title: 'Message Sent', description: 'Your request has been recorded. Admin will review it soon.' });
      setFormData(prev => ({ ...prev, message: '' }));
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUserReply = async (msgId: string, currentContent: string) => {
    if (!userReplyText.trim()) return;
    setReplyLoading(true);
    try {
      const msgRef = doc(db, 'messages', msgId);
      const updatedContent = `${currentContent}\n\n[FOLLOW-UP ${format(new Date(), 'dd/MM HH:mm')}]: ${userReplyText}`;
      
      await updateDoc(msgRef, {
        content: updatedContent,
        isRead: false, // Mark as unread so Admin sees it in inbox
        createdAt: serverTimestamp() // Move to top of inbox
      });

      toast({ title: 'Reply Sent', description: 'Your follow-up has been sent to support.' });
      setUserReplyText('');
      setReplyingToId(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to Send', description: error.message });
    } finally {
      setReplyLoading(false);
    }
  };

  const repliedCount = userMessages.filter(m => m.replyContent).length;

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'Urgent': return 'bg-red-500 text-white';
      case 'High': return 'bg-orange-500 text-white';
      case 'Medium': return 'bg-yellow-500 text-white';
      default: return 'bg-blue-500 text-white';
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Support & Contact</h1>
            <p className="text-muted-foreground">Have issues with the portal or need token recharge? Reach out to us.</p>
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/10 relative h-11 shadow-sm">
                <History className="h-4 w-4" /> Message History
                {repliedCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-accent text-accent-foreground animate-bounce border-2 border-background">
                    {repliedCount}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-hidden flex flex-col p-0">
              <DialogHeader className="p-6 bg-muted/30 border-b">
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <MessageSquare className="h-6 w-6 text-primary" />
                  Your Support Requests
                </DialogTitle>
                <DialogDescription className="text-base">
                  Track the status of your queries and see responses from Admin.
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/5">
                {userMessages.length > 0 ? (
                  userMessages.map((msg) => (
                    <div key={msg.id} className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm transition-all hover:shadow-md border-border/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={msg.isRead ? 'outline' : 'default'} className={!msg.isRead ? 'bg-accent text-accent-foreground border-none px-3' : 'px-3'}>
                            {msg.isRead ? 'Seen by Support' : 'Awaited'}
                          </Badge>
                          {msg.priority && (
                            <Badge className={getPriorityColor(msg.priority)}>
                              {msg.priority} Priority
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded">
                          <Clock className="h-3.5 w-3.5" />
                          {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Recently'}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                           <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 border border-primary/20 shadow-inner">ME</div>
                           <div className="flex-1">
                             <p className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-widest mb-1">Your Query:</p>
                             <div className="text-sm leading-relaxed text-foreground bg-muted/20 p-4 rounded-2xl rounded-tl-none border border-border/40 whitespace-pre-wrap">
                               {msg.content}
                             </div>
                           </div>
                        </div>

                        {msg.replyContent ? (
                          <div className="space-y-4">
                            <div className="p-5 rounded-2xl rounded-tr-none bg-accent/5 border border-accent/20 animate-in fade-in slide-in-from-right-4 duration-500 shadow-sm">
                              <div className="flex items-start gap-3">
                                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground shrink-0 shadow-md">HQ</div>
                                <div className="flex-1">
                                  <p className="text-[10px] font-extrabold text-accent uppercase mb-2 flex items-center gap-1 tracking-widest">
                                    <Reply className="h-3 w-3" /> Reply from {msg.repliedBy || 'Support Team'}
                                  </p>
                                  <div className="text-sm font-semibold text-foreground leading-relaxed">
                                    {msg.replyContent}
                                  </div>
                                  {msg.repliedAt && (
                                    <div className="flex justify-end mt-3">
                                      <p className="text-[9px] text-muted-foreground/70 font-mono bg-background/50 px-2 py-0.5 rounded">
                                        {msg.repliedAt.toDate ? format(msg.repliedAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Recently'}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Reply Back Option for User */}
                            {replyingToId === msg.id ? (
                              <div className="ml-8 space-y-3 border-l-2 border-accent pl-4 py-2 animate-in slide-in-from-top-2 duration-300">
                                <Textarea 
                                  placeholder="Type your reply back to support..."
                                  className="text-sm bg-card min-h-[100px]"
                                  value={userReplyText}
                                  onChange={(e) => setUserReplyText(e.target.value)}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => setReplyingToId(null)}>Cancel</Button>
                                  <Button 
                                    size="sm" 
                                    className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                                    onClick={() => handleUserReply(msg.id, msg.content)}
                                    disabled={replyLoading || !userReplyText.trim()}
                                  >
                                    {replyLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                    Send Reply
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-end">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-accent hover:text-accent hover:bg-accent/10 gap-2 font-bold"
                                  onClick={() => setReplyingToId(msg.id)}
                                >
                                  <CornerDownRight className="h-4 w-4" />
                                  Reply Back
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/30 border border-dashed text-xs text-muted-foreground font-medium italic animate-pulse">
                            <Clock className="h-4 w-4 text-primary" />
                            Admin is reviewing your request. Please check back later for a response.
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                    <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6">
                      <MessageSquare className="h-10 w-10 opacity-20" />
                    </div>
                    <p className="text-lg font-medium text-foreground/70">No conversation history</p>
                    <p className="text-sm text-muted-foreground">Any messages you send will appear here.</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <Card className="col-span-2 border-border/40 shadow-xl overflow-hidden">
            <CardHeader className="bg-muted/10 border-b">
              <CardTitle>Send us a Message</CardTitle>
              <CardDescription>Fill out the form below and our team will respond within 24 hours.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-bold">Your Name</Label>
                    <Input 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})} 
                      required 
                      className="bg-muted/20"
                      readOnly={!!profile?.name}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold">Email Address</Label>
                    <Input 
                      type="email" 
                      value={formData.email} 
                      onChange={e => setFormData({...formData, email: e.target.value})} 
                      required 
                      className="bg-muted/20"
                      readOnly={!!profile?.email}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold">Set Priority</Label>
                  <Select 
                    value={formData.priority} 
                    onValueChange={(v: any) => setFormData({...formData, priority: v})}
                  >
                    <SelectTrigger className="bg-muted/20 h-12">
                      <SelectValue placeholder="Select Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low - General Query</SelectItem>
                      <SelectItem value="Medium">Medium - Normal Request</SelectItem>
                      <SelectItem value="High">High - Urgent Issue</SelectItem>
                      <SelectItem value="Urgent">Urgent - Immediate Attention</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 italic">
                    <AlertCircle className="h-3 w-3" /> Select priority wisely to help us serve you better.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold">How can we help? (e.g. Token Recharge Request)</Label>
                  <Textarea 
                    placeholder="Tell us about the issue or specify your recharge requirement..." 
                    className="min-h-[180px] bg-muted/5 focus:bg-background transition-all" 
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-base font-bold gap-3 shadow-lg" disabled={loading}>
                  {loading ? <Clock className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  {loading ? 'Sending Request...' : 'Send Message'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-accent/20 bg-accent/5 shadow-sm">
              <CardContent className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shadow-sm">
                    <Phone className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase text-accent tracking-widest">Call Support</p>
                    <p className="text-sm font-bold text-foreground">+91 1800-NREGA-HELP</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shadow-sm">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase text-accent tracking-widest">Email Us</p>
                    <p className="text-sm font-bold text-foreground">support@nregaguru.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shadow-sm">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase text-accent tracking-widest">Main Office</p>
                    <p className="text-sm font-bold text-foreground">New Delhi, India</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-2xl overflow-hidden border shadow-xl h-64 grayscale contrast-125 hover:grayscale-0 transition-all duration-700 cursor-pointer">
              <img src="https://picsum.photos/seed/map/400/300" alt="map" className="object-cover w-full h-full" />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
