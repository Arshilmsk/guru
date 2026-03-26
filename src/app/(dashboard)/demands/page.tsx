
"use client";

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, serverTimestamp, getDocs, Timestamp, increment, documentId, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemandRequest, JobCard } from '@/app/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, Check, X, User, Loader2, History, Clock, FileDown, Calendar, Trash2, AlertTriangle, AlertCircle, RotateCcw, CheckCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addDays, format, startOfDay } from 'date-fns';

const MANDAY_RATE = 252;

export default function DemandsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [demands, setDemands] = useState<DemandRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  
  // Selection state for returning workers
  const [selectedWorkers, setSelectedWorkers] = useState<Record<string, string[]>>({});

  // Accept Modal States
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [selectedDemandForAccept, setSelectedDemandForAccept] = useState<DemandRequest | null>(null);
  const [acceptStartDate, setAcceptStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Reject Modal States
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedDemandForReject, setSelectedDemandForReject] = useState<DemandRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Delete Modal States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDemandForDelete, setSelectedDemandForDelete] = useState<DemandRequest | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  useEffect(() => {
    if (!profile) return;

    let q;
    if (profile.role === 'User') {
      q = query(
        collection(db, 'demands'),
        where('requesterId', '==', profile.id)
      );
    } else if (profile.role === 'SuperAdmin') {
      q = query(collection(db, 'demands'));
    } else {
      q = query(
        collection(db, 'demands'),
        where('recipientId', '==', profile.id)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const d: DemandRequest[] = [];
      snapshot.forEach(doc => {
        d.push({ id: doc.id, ...doc.data() } as DemandRequest);
      });
      
      d.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      setDemands(d);
      setLoading(false);
    }, (err) => {
      console.error("Demand fetch error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const toggleWorkerSelection = (demandId: string, jobCardId: string) => {
    setSelectedWorkers(prev => {
      const current = prev[demandId] || [];
      if (current.includes(jobCardId)) {
        return { ...prev, [demandId]: current.filter(id => id !== jobCardId) };
      } else {
        return { ...prev, [demandId]: [...current, jobCardId] };
      }
    });
  };

  const toggleAllWorkersInDemand = (demand: DemandRequest) => {
    const demandId = demand.id;
    const allIds = demand.items.map(i => i.jobCardId);
    setSelectedWorkers(prev => {
      const current = prev[demandId] || [];
      if (current.length === allIds.length) {
        return { ...prev, [demandId]: [] };
      } else {
        return { ...prev, [demandId]: allIds };
      }
    });
  };

  const handleReturnWorkers = async (demand: DemandRequest) => {
    const workerIdsToReturn = selectedWorkers[demand.id] || [];
    if (workerIdsToReturn.length === 0 || !profile) return;

    setActionLoading(demand.id);
    try {
      const batch = writeBatch(db);
      const itemsToReturn = demand.items.filter(item => workerIdsToReturn.includes(item.jobCardId));
      const remainingItems = demand.items.filter(item => !workerIdsToReturn.includes(item.jobCardId));

      // 1. Restore Mandays for each returned worker
      for (const item of itemsToReturn) {
        const jcRef = doc(db, 'job_cards', item.jobCardId);
        batch.update(jcRef, {
          mandays: increment(item.deductedDays),
          lastUpdated: serverTimestamp()
        });
      }

      // 2. Update Demand Document
      if (remainingItems.length === 0) {
        // If no workers left, mark as rejected or just delete? Let's mark as Rejected for record
        batch.update(doc(db, 'demands', demand.id), {
          status: 'Rejected',
          items: [],
          rejectionReason: 'All workers returned to user.',
          updatedAt: serverTimestamp()
        });
      } else {
        batch.update(doc(db, 'demands', demand.id), {
          items: remainingItems,
          updatedAt: serverTimestamp()
        });
      }

      // 3. Notify User
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, {
        id: notifRef.id,
        recipientUserId: demand.requesterId,
        message: `${itemsToReturn.length} workers from your demand (#${demand.id.slice(-4)}) have been returned and their mandays restored by ${profile.name}.`,
        type: 'info',
        isRead: false,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      
      setSelectedWorkers(prev => ({ ...prev, [demand.id]: [] }));
      toast({ title: "Workers Returned", description: `${itemsToReturn.length} workers returned successfully.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Operation Failed', description: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteDemand = async () => {
    if (!selectedDemandForDelete || !profile) return;
    
    const isRejected = selectedDemandForDelete.status === 'Rejected';
    if (!isRejected && !deleteReason.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please provide a reason for deletion.' });
      return;
    }
    
    setActionLoading(selectedDemandForDelete.id);
    try {
      const batch = writeBatch(db);

      if (selectedDemandForDelete.status === 'Accepted') {
        for (const item of selectedDemandForDelete.items) {
          const jcRef = doc(db, 'job_cards', item.jobCardId);
          batch.update(jcRef, {
            mandays: increment(item.deductedDays),
            lastUpdated: serverTimestamp()
          });
        }
      }

      const notifRef = doc(collection(db, 'notifications'));
      const reasonMsg = deleteReason.trim() ? `. Reason: ${deleteReason}` : '';
      batch.set(notifRef, {
        id: notifRef.id,
        recipientUserId: selectedDemandForDelete.requesterId,
        message: `Your ${selectedDemandForDelete.status} demand (#${selectedDemandForDelete.id.slice(-4)}) has been DELETED by ${profile.name}${reasonMsg}`,
        type: 'info',
        isRead: false,
        createdAt: serverTimestamp()
      });

      batch.delete(doc(db, 'demands', selectedDemandForDelete.id));

      await batch.commit();
      toast({ title: "Demand Deleted", description: "Request removed and mandays restored (if applicable)." });
      setIsDeleteModalOpen(false);
      setSelectedDemandForDelete(null);
      setDeleteReason('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadForm = async (demand: DemandRequest) => {
    setPdfLoading(demand.id);
    try {
      if (demand.items.length === 0) throw new Error("No items to export.");
      const cardIds = demand.items.map(i => i.jobCardId);
      const cardsSnap = await getDocs(query(collection(db, 'job_cards'), where(documentId(), 'in', cardIds)));
      const cardsMap: Record<string, JobCard> = {};
      cardsSnap.forEach(doc => { cardsMap[doc.id] = { id: doc.id, ...doc.data() } as JobCard; });

      const doc = new jsPDF({ orientation: 'portrait' });
      
      doc.setFontSize(16);
      doc.setTextColor(61, 116, 143); 
      doc.text("NREGA GURU", 105, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text("Worker Demand Detailed Report", 105, 30, { align: 'center' });
      
      doc.setDrawColor(200);
      doc.line(15, 35, 195, 35);

      const totalMandays = demand.items.reduce((sum, item) => sum + item.deductedDays, 0);
      const totalAmount = totalMandays * MANDAY_RATE;

      doc.setFontSize(9);
      doc.text(`Report ID: #${demand.id.toUpperCase()}`, 15, 45);
      doc.text(`Requester: ${demand.requesterName}`, 15, 51);
      doc.text(`Status: ${demand.status}`, 15, 57);
      
      doc.text(`Generated On: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 130, 45);
      doc.text(`Total Workers: ${demand.items.length}`, 130, 51);
      doc.text(`Total Mandays: ${totalMandays}`, 130, 57);
      doc.text(`Total Amount: INR ${totalAmount.toLocaleString()}`, 130, 63);

      const startDate = demand.startDate ? (demand.startDate instanceof Timestamp ? demand.startDate.toDate() : new Date(demand.startDate)) : null;

      const tableData = demand.items.map((item, idx) => {
        const fullCard = cardsMap[item.jobCardId];
        const remainingMandays = fullCard?.mandays ?? 0;
        const deducted = item.deductedDays;

        let fromDateStr = '-';
        let toDateStr = '-';

        if (startDate) {
          fromDateStr = format(startDate, 'dd/MM/yyyy');
          toDateStr = format(addDays(startDate, deducted - 1), 'dd/MM/yyyy');
        }

        return [
          idx + 1,
          item.workerName,
          fullCard?.fatherName || '-',
          item.jobCardNumber,
          fromDateStr,
          deducted,
          toDateStr,
          remainingMandays,
          fullCard?.gramPanchayat || '-'
        ];
      });

      autoTable(doc, {
        startY: 75,
        head: [['S.No', 'Worker Name', 'Father/Husband Name', 'Job Card #', 'Start Date', 'Days', 'End Date', 'Remaining', 'Panchayat']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [61, 116, 143], textColor: [255, 255, 255], fontSize: 8, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 1.5, valign: 'middle' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          4: { halign: 'center', cellWidth: 18 },
          5: { halign: 'center', fontStyle: 'bold', textColor: [61, 116, 143], cellWidth: 10 }, 
          6: { halign: 'center', cellWidth: 18 },
          7: { halign: 'center', fontStyle: 'bold', cellWidth: 12 }
        },
        margin: { left: 10, right: 10 }
      });

      doc.save(`Demand_Report_${demand.id.slice(-4)}.pdf`);
      toast({ title: "Report Downloaded", description: "The detailed worker demand list has been exported." });
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Export Failed", description: err.message || "Could not generate PDF report." });
    } finally {
      setPdfLoading(null);
    }
  };

  const handleDemandAction = async (demandId: string, status: 'Accepted' | 'Rejected', startDateStr?: string, reason?: string) => {
    if (!profile) return;
    setActionLoading(demandId);
    try {
      const demand = demands.find(d => d.id === demandId);
      if (!demand) return;

      const batch = writeBatch(db);

      if (status === 'Accepted' && startDateStr) {
        const newStart = startOfDay(new Date(startDateStr));
        
        const acceptedQuery = query(collection(db, 'demands'), where('status', '==', 'Accepted'));
        const acceptedSnap = await getDocs(acceptedQuery);
        const existingAccepted = acceptedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DemandRequest));

        const conflictedWorkers: string[] = [];
        const validItems: typeof demand.items = [];
        const rejectedItems: typeof demand.items = [];

        for (const item of demand.items) {
          const newEnd = addDays(newStart, item.deductedDays - 1);
          let hasConflict = false;
          let conflictPeriod = '';

          for (const ex of existingAccepted) {
            const exItem = ex.items.find(ei => ei.jobCardId === item.jobCardId);
            if (exItem) {
              const exStart = startOfDay(ex.startDate instanceof Timestamp ? ex.startDate.toDate() : new Date(ex.startDate));
              const exEnd = addDays(exStart, exItem.deductedDays - 1);

              if (newStart <= exEnd && exStart <= newEnd) {
                hasConflict = true;
                conflictPeriod = `${format(exStart, 'dd/MM/yy')} - ${format(exEnd, 'dd/MM/yy')}`;
                break;
              }
            }
          }

          if (hasConflict) {
            conflictedWorkers.push(`${item.workerName} (${conflictPeriod})`);
            rejectedItems.push(item);
          } else {
            validItems.push(item);
          }
        }

        if (conflictedWorkers.length > 0) {
          toast({
            variant: 'destructive',
            title: 'Conflict Detected',
            description: `Some workers have active demands: ${conflictedWorkers.join(', ')}. These workers will be reverted.`,
            duration: 6000
          });

          for (const cItem of rejectedItems) {
            const jcRef = doc(db, 'job_cards', cItem.jobCardId);
            batch.update(jcRef, {
              mandays: increment(cItem.deductedDays),
              lastUpdated: serverTimestamp()
            });
          }

          if (validItems.length === 0) {
            batch.update(doc(db, 'demands', demand.id), {
              status: 'Rejected',
              updatedAt: serverTimestamp(),
              rejectionReason: 'Worker demand dates overlap with existing approved demands.'
            });
            const notifRef = doc(collection(db, 'notifications'));
            batch.set(notifRef, {
              id: notifRef.id,
              recipientUserId: demand.requesterId,
              message: `Your demand (#${demand.id.slice(-4)}) was REJECTED because all workers have overlapping demands.`,
              type: 'DEMAND_REJECTED',
              isRead: false,
              createdAt: serverTimestamp()
            });
          } else {
            batch.update(doc(db, 'demands', demand.id), {
              status: 'Accepted',
              startDate: Timestamp.fromDate(newStart),
              items: validItems,
              conflictedItems: rejectedItems,
              updatedAt: serverTimestamp()
            });
            const notifRef = doc(collection(db, 'notifications'));
            batch.set(notifRef, {
              id: notifRef.id,
              recipientUserId: demand.requesterId,
              message: `Your demand (#${demand.id.slice(-4)}) has been partially Accepted. ${rejectedItems.length} workers were reverted due to date overlaps.`,
              type: 'DEMAND_ACCEPTED',
              isRead: false,
              createdAt: serverTimestamp()
            });
          }
        } else {
          batch.update(doc(db, 'demands', demand.id), {
            status: 'Accepted',
            startDate: Timestamp.fromDate(newStart),
            updatedAt: serverTimestamp()
          });
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            id: notifRef.id,
            recipientUserId: demand.requesterId,
            message: `Your demand (#${demand.id.slice(-4)}) has been Accepted by ${profile.name}.`,
            type: 'DEMAND_ACCEPTED',
            isRead: false,
            createdAt: serverTimestamp()
          });
        }
      } else if (status === 'Rejected') {
        for (const item of demand.items) {
          const jcRef = doc(db, 'job_cards', item.jobCardId);
          batch.update(jcRef, {
            mandays: increment(item.deductedDays),
            lastUpdated: serverTimestamp()
          });
        }
        batch.update(doc(db, 'demands', demand.id), {
          status: 'Rejected',
          rejectionReason: reason || 'Rejected by Admin.',
          updatedAt: serverTimestamp()
        });
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          id: notifRef.id,
          recipientUserId: demand.requesterId,
          message: `Your demand (#${demand.id.slice(-4)}) has been Rejected by ${profile.name}. Reason: ${reason || 'Not specified'}`,
          type: 'DEMAND_REJECTED',
          isRead: false,
          createdAt: serverTimestamp()
        });
      }

      await batch.commit();
      setIsAcceptModalOpen(false);
      setIsRejectModalOpen(false);
      setSelectedDemandForAccept(null);
      setSelectedDemandForReject(null);
      setRejectionReason('');
      toast({ title: "Process Complete", description: "Demand status updated successfully." });
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Action Failed', description: error.message });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-[400px] w-full flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Syncing demand data...</p>
        </div>
      </AppLayout>
    );
  }

  const isUser = profile?.role === 'User';
  const isSuperAdmin = profile?.role === 'SuperAdmin';
  const isAdmin = profile?.role === 'Admin';
  const pendingDemands = demands.filter(d => d.status === 'Pending');
  const processedDemands = demands.filter(d => d.status !== 'Pending');

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {isUser ? 'My Demand Requests' : 'Worker Demand Management'}
          </h1>
          <p className="text-muted-foreground">
            {isUser ? 'Track status of your submitted worker demands.' : 'Review and process worker demands submitted by users.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <Card className="border-border/40 shadow-xl overflow-hidden">
            <CardHeader className="bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {isUser ? <Clock className="h-5 w-5 text-accent" /> : <ClipboardList className="h-5 w-5 text-accent" />}
                    {isUser ? 'Active Requests' : 'Pending Requests'}
                  </CardTitle>
                </div>
                <Badge variant="secondary" className="bg-accent text-accent-foreground font-bold">
                  {pendingDemands.length} Pending
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {pendingDemands.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {pendingDemands.map((demand) => {
                    const totalMandays = demand.items.reduce((sum, item) => sum + item.deductedDays, 0);
                    const totalAmount = totalMandays * MANDAY_RATE;

                    return (
                      <AccordionItem key={demand.id} value={demand.id} className="border-b px-6">
                        <AccordionTrigger className="hover:no-underline py-6">
                          <div className="flex flex-1 items-center justify-between text-left">
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                <User className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-bold text-lg">{isUser ? `Demand #${demand.id.slice(-4)}` : demand.requesterName}</p>
                                <p className="text-xs text-muted-foreground">
                                  Sent: {demand.createdAt?.toDate ? format(demand.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Recently'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-6 mr-4">
                              <div className="text-center min-w-[60px]">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Workers</p>
                                <p className="font-bold text-base">{demand.items.length}</p>
                              </div>
                              <div className="text-center min-w-[80px]">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Tot. Mandays</p>
                                <p className="font-bold text-base text-primary">{totalMandays}</p>
                              </div>
                              <div className="text-center min-w-[100px]">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Tot. Amount</p>
                                <p className="font-bold text-base text-accent">₹{totalAmount.toLocaleString()}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>
                                {(isSuperAdmin || isAdmin) && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDemandForDelete(demand);
                                      setIsDeleteModalOpen(true);
                                    }}
                                    disabled={actionLoading === demand.id}
                                  >
                                    {actionLoading === demand.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-6">
                          <div className="space-y-4">
                            <div className="rounded-lg border bg-card overflow-hidden">
                              <Table>
                                <TableHeader className="bg-muted/50">
                                  <TableRow>
                                    <TableHead className="w-[80px]">S.No</TableHead>
                                    <TableHead>Worker Name</TableHead>
                                    <TableHead>Job Card #</TableHead>
                                    <TableHead className="text-right">Deducted</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {demand.items.map((item, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell>{idx + 1}</TableCell>
                                      <TableCell className="font-bold">{item.workerName}</TableCell>
                                      <TableCell className="font-mono text-xs">{item.jobCardNumber}</TableCell>
                                      <TableCell className="text-right">
                                        <Badge variant="outline" className="border-accent text-accent">-{item.deductedDays} Days</Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            {!isUser && (
                              <div className="flex justify-end gap-3">
                                <Button 
                                  variant="outline" 
                                  className="border-destructive text-destructive hover:bg-destructive/10 gap-2"
                                  onClick={() => {
                                    setSelectedDemandForReject(demand);
                                    setIsRejectModalOpen(true);
                                  }}
                                  disabled={actionLoading === demand.id}
                                >
                                  {actionLoading === demand.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                  Reject
                                </Button>
                                <Button 
                                  className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 px-8"
                                  onClick={() => {
                                    setSelectedDemandForAccept(demand);
                                    setIsAcceptModalOpen(true);
                                  }}
                                  disabled={actionLoading === demand.id}
                                >
                                  {actionLoading === demand.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  Accept & Approve
                                </Button>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 opacity-20 mb-4" />
                  <p className="text-lg font-medium">No pending demands found.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {processedDemands.length > 0 && (
            <Card className="border-border/40 shadow-xl overflow-hidden">
              <CardHeader className="bg-muted/20">
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Demand History
                </CardTitle>
                <CardDescription>Records of accepted and rejected demand requests. Admins can return specific workers back to users.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Accordion type="single" collapsible className="w-full">
                  {processedDemands.map((demand) => {
                    const totalMandays = demand.items.reduce((sum, item) => sum + item.deductedDays, 0);
                    const totalAmount = totalMandays * MANDAY_RATE;
                    const selectedForReturn = selectedWorkers[demand.id] || [];

                    return (
                      <AccordionItem key={demand.id} value={demand.id} className="border-b px-6">
                        <AccordionTrigger className="hover:no-underline py-4">
                          <div className="flex flex-1 items-center justify-between text-left">
                            <div className="flex items-center gap-3">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white ${demand.status === 'Accepted' ? 'bg-green-500' : 'bg-red-500'}`}>
                                {demand.status === 'Accepted' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                              </div>
                              <div>
                                <p className="font-bold text-sm">{isUser ? `Demand #${demand.id.slice(-4)}` : demand.requesterName}</p>
                                <div className="flex flex-col gap-1 mt-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-muted-foreground font-medium">
                                      {demand.status} - {demand.updatedAt?.toDate ? format(demand.updatedAt.toDate(), 'dd/MM/yyyy') : 'Recently'}
                                    </p>
                                    {demand.startDate && (
                                      <Badge variant="outline" className="text-[9px] h-4 py-0 flex gap-1 items-center">
                                        <Calendar className="h-2 w-2" />
                                        Starts: {format(demand.startDate instanceof Timestamp ? demand.startDate.toDate() : new Date(demand.startDate), 'dd/MM/yyyy')}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[9px] font-bold text-primary">Workers: {demand.items.length}</span>
                                    <span className="text-[9px] font-bold text-primary">Mandays: {totalMandays}</span>
                                    <span className="text-[9px] font-bold text-accent">Amt: ₹{totalAmount.toLocaleString()}</span>
                                  </div>
                                  {demand.status === 'Rejected' && demand.rejectionReason && (
                                    <div className="flex items-center gap-1 text-[10px] text-destructive font-bold mt-0.5">
                                      <AlertCircle className="h-3 w-3" />
                                      Reason: {demand.rejectionReason}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                               {demand.status === 'Accepted' && (
                                 <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 gap-1 text-primary hover:text-primary hover:bg-primary/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadForm(demand);
                                  }}
                                  disabled={pdfLoading === demand.id || demand.items.length === 0}
                                 >
                                   {pdfLoading === demand.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-4 w-4" />}
                                   <span className="text-xs">Download Report</span>
                                 </Button>
                               )}
                               <Badge variant={demand.status === 'Accepted' ? 'default' : 'destructive'} className="text-[10px] w-20 justify-center">
                                {demand.status}
                              </Badge>
                              {(isSuperAdmin || isAdmin) && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDemandForDelete(demand);
                                      setIsDeleteModalOpen(true);
                                    }}
                                    disabled={actionLoading === demand.id}
                                  >
                                    {actionLoading === demand.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  </Button>
                                )}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="mx-4 space-y-4">
                            {(isAdmin || isSuperAdmin) && demand.status === 'Accepted' && demand.items.length > 0 && (
                              <div className="flex items-center justify-between bg-accent/5 p-3 rounded-lg border border-accent/20">
                                <p className="text-xs font-bold text-accent-foreground flex items-center gap-2">
                                  <RotateCcw className="h-4 w-4" />
                                  Return Workers to User (Select workers to restore their mandays)
                                </p>
                                <Button 
                                  size="sm" 
                                  variant="default" 
                                  className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 h-8 text-xs"
                                  disabled={selectedForReturn.length === 0 || actionLoading === demand.id}
                                  onClick={() => handleReturnWorkers(demand)}
                                >
                                  {actionLoading === demand.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                                  Return Selected ({selectedForReturn.length})
                                </Button>
                              </div>
                            )}

                            <div className="rounded-md border bg-muted/20 overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {(isAdmin || isSuperAdmin) && demand.status === 'Accepted' && (
                                      <TableHead className="w-[40px] h-8 text-center">
                                        <Checkbox 
                                          checked={demand.items.length > 0 && selectedForReturn.length === demand.items.length}
                                          onCheckedChange={() => toggleAllWorkersInDemand(demand)}
                                        />
                                      </TableHead>
                                    )}
                                    <TableHead className="h-8 text-[10px]">Worker Name</TableHead>
                                    <TableHead className="h-8 text-[10px]">Job Card #</TableHead>
                                    <TableHead className="h-8 text-[10px]">Period (From - To)</TableHead>
                                    <TableHead className="h-8 text-[10px] text-right">Days</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {demand.items.length > 0 ? demand.items.map((item, i) => {
                                    const startDate = demand.startDate ? (demand.startDate instanceof Timestamp ? demand.startDate.toDate() : new Date(demand.startDate)) : null;
                                    const fromDateStr = startDate ? format(startDate, 'dd/MM/yyyy') : '-';
                                    const toDateStr = startDate ? format(addDays(startDate, item.deductedDays - 1), 'dd/MM/yyyy') : '-';

                                    return (
                                      <TableRow key={i}>
                                        {(isAdmin || isSuperAdmin) && demand.status === 'Accepted' && (
                                          <TableCell className="py-2 text-center">
                                            <Checkbox 
                                              checked={selectedForReturn.includes(item.jobCardId)}
                                              onCheckedChange={() => toggleWorkerSelection(demand.id, item.jobCardId)}
                                            />
                                          </TableCell>
                                        )}
                                        <TableCell className="py-2 text-xs font-bold">{item.workerName}</TableCell>
                                        <TableCell className="py-2 text-[10px] font-mono">{item.jobCardNumber}</TableCell>
                                        <TableCell className="py-2 text-[10px] text-muted-foreground">
                                          {fromDateStr} - {toDateStr}
                                        </TableCell>
                                        <TableCell className="py-2 text-xs text-right font-bold">
                                          <Badge variant="outline" className="border-accent text-accent">-{item.deductedDays}</Badge>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  }) : (
                                    <TableRow>
                                      <TableCell colSpan={5} className="text-center py-4 text-xs italic text-muted-foreground">All workers returned.</TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={isAcceptModalOpen} onOpenChange={setIsAcceptModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-accent" />
              Confirm Demand Start Date
            </DialogTitle>
            <DialogDescription>
              Specify when this work period will officially begin. System will check for overlaps with existing accepted demands.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Work Start Date</Label>
              <Input 
                id="start-date" 
                type="date" 
                value={acceptStartDate} 
                onChange={(e) => setAcceptStartDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAcceptModalOpen(false)}>Cancel</Button>
            <Button 
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => {
                if (selectedDemandForAccept) {
                  handleDemandAction(selectedDemandForAccept.id, 'Accepted', acceptStartDate);
                }
              }}
              disabled={actionLoading === selectedDemandForAccept?.id}
            >
              {actionLoading === selectedDemandForAccept?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Validate & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <X className="h-5 w-5" />
              Reject Demand Request
            </DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this demand request. Workers' mandays will be restored.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason" className="font-bold">Reason for Rejection</Label>
              <Textarea 
                id="reject-reason" 
                placeholder="Explain why this demand is being rejected..." 
                value={rejectionReason} 
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[100px]"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (selectedDemandForReject) {
                  handleDemandAction(selectedDemandForReject.id, 'Rejected', undefined, rejectionReason);
                }
              }}
              disabled={actionLoading === selectedDemandForReject?.id || !rejectionReason.trim()}
            >
              {actionLoading === selectedDemandForReject?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
              Reject & Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this demand? {selectedDemandForDelete?.status === 'Accepted' && "Workers' mandays will be restored."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-reason" className="font-bold">Reason for Deletion {selectedDemandForDelete?.status === 'Rejected' && "(Optional)"}</Label>
              <Textarea 
                id="delete-reason" 
                placeholder={selectedDemandForDelete?.status === 'Rejected' ? "Reason (Optional)..." : "Explain why this demand is being removed..."} 
                value={deleteReason} 
                onChange={(e) => setDeleteReason(e.target.value)}
                className="min-h-[100px]"
                required={selectedDemandForDelete?.status !== 'Rejected'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteDemand}
              disabled={actionLoading === selectedDemandForDelete?.id || (selectedDemandForDelete?.status !== 'Rejected' && !deleteReason.trim())}
            >
              {actionLoading === selectedDemandForDelete?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4" />}
              Delete & Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
