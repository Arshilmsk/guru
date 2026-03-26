
"use client";

import { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, runTransaction, where, writeBatch, getDoc, addDoc, orderBy } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { JobCard, UserProfile } from '@/app/lib/types';
import { Plus, Download, Search, Video, ShieldCheck, Trash2, Edit, Loader2, Send, CheckCircle2, Inbox, FileText, ClipboardList, Layers, User as UserIcon, XCircle, RotateCcw, CalendarCheck, FileOutput, Upload, AlertCircle, AlertTriangle, Filter, FilterX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { verifyWorkerVideo } from '@/ai/flows/worker-video-verification-flow';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function JobCardManagementPage() {
  const { profile } = useAuth();
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  
  // Advanced Filters State
  const [filters, setFilters] = useState({
    gender: 'All',
    minMandays: '',
    maxMandays: '',
    location: ''
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isDemandOpen, setIsDemandOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [assignOnCreateTarget, setAssignOnCreateTarget] = useState<string | null>(null);
  const [activeJCOfAssign, setActiveJCOfAssign] = useState<JobCard | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [demandDays, setDemandDays] = useState(14);
  const [creatorAdmin, setCreatorAdmin] = useState<UserProfile | null>(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  
  const [newJC, setNewJC] = useState({
    jobCardNumber: '', 
    workerName: '', 
    fatherName: '', 
    gender: 'Male' as 'Male' | 'Female' | 'Other',
    gramPanchayat: '', 
    block: '',
    mandays: 100
  });
  
  const [editingJC, setEditingJC] = useState<JobCard | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [editingVideoFile, setEditingVideoFile] = useState<File | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!profile) return;
    
    setSelectedRecipientId(profile.createdByUserId || 'SYSTEM_ADMIN');

    if (profile.createdByUserId) {
      getDoc(doc(db, 'users', profile.createdByUserId)).then(docSnap => {
        if (docSnap.exists()) {
          setCreatorAdmin(docSnap.data() as UserProfile);
        }
      });
    }

    const q = query(collection(db, 'job_cards'), orderBy('jobCardNumber', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jc: JobCard[] = [];
      snapshot.forEach(doc => jc.push({ id: doc.id, ...doc.data() } as JobCard));
      setJobCards(jc);
    });

    let usersQ;
    if (profile.role === 'SuperAdmin') {
      usersQ = query(collection(db, 'users'), where('role', 'in', ['Admin', 'User']));
    } else {
      usersQ = query(collection(db, 'users'), 
        where('role', 'in', ['Admin', 'User']), 
        where('createdByUserId', '==', profile.id)
      );
    }

    const unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
      const u: UserProfile[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as UserProfile;
        u.push({ id: doc.id, ...data });
      });
      setUsers(u);
    });

    return () => {
      unsubscribe();
      unsubscribeUsers();
    };
  }, [profile]);

  const userJobCardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    jobCards.forEach(jc => {
      if (jc.status === 'Assigned' && jc.assignedToUserId) {
        counts[jc.assignedToUserId] = (counts[jc.assignedToUserId] || 0) + 1;
      } else if (jc.status === 'Accepted' && jc.acceptedByUserId) {
        counts[jc.acceptedByUserId] = (counts[jc.acceptedByUserId] || 0) + 1;
      }
    });
    return counts;
  }, [jobCards]);

  const canBulkAccept = useMemo(() => {
    return selectedIds.some(id => {
      const jc = jobCards.find(c => c.id === id);
      return jc?.status === 'Assigned' && jc?.assignedToUserId === profile?.id;
    });
  }, [selectedIds, jobCards, profile]);

  const uploadFileWithProgress = (file: File, path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        }, 
        (error) => reject(error), 
        () => {
          getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
            resolve(downloadURL);
          });
        }
      );
    });
  };

  const generatePDF = (selectedCards: JobCard[], days: number) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('NREGA GURU - Worker Demand Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Applied by: ${profile?.name} (${profile?.role})`, 14, 34);

    const tableRows = selectedCards.map((jc, index) => [
      index + 1,
      jc.jobCardNumber,
      jc.workerName,
      jc.fatherName,
      `${jc.gramPanchayat}, ${jc.block}`,
      jc.mandays,
      days,
      Math.max(0, jc.mandays - days)
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['S.No', 'Job Card #', 'Worker Name', 'Father Name', 'Location', 'Prev Mandays', 'Demand Days', 'Remaining']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [61, 116, 143], textColor: [255, 255, 255] }
    });

    doc.save(`Demand_Report_${Date.now()}.pdf`);
  };

  const handleDownloadTemplate = () => {
    const headers = "Job Card Number,Worker Name,Father Name,Gender,Gram Panchayat,Block,Mandays\n";
    const sampleData = "RJ-01-001-001-001/101,Suresh Kumar,Ramesh Prasad,Male,Panchayat Name,Block Name,100";
    const csvContent = headers + sampleData;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "JobCard_Template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Template Downloaded",
      description: "Sample CSV template has been saved to your device.",
    });
  };

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length < 2) {
        toast({ variant: 'destructive', title: 'Empty File', description: 'No records found in CSV.' });
        setLoading(false);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const requiredHeaders = ['Job Card Number', 'Worker Name', 'Father Name', 'Gram Panchayat', 'Block', 'Mandays'];
      const hasAllHeaders = requiredHeaders.every(rh => headers.includes(rh));

      if (!hasAllHeaders) {
        toast({ variant: 'destructive', title: 'Invalid Format', description: 'CSV columns do not match the template.' });
        setLoading(false);
        return;
      }

      const rows = lines.slice(1);
      const batch = writeBatch(db);
      let addedCount = 0;
      let skippedCount = 0;
      let tokensNeeded = 0;
      const isSuperAdmin = profile.role === 'SuperAdmin';

      for (const row of rows) {
        const values = row.split(',').map(v => v.trim());
        const data: any = {};
        headers.forEach((header, i) => { data[header] = values[i]; });

        const jcNumber = data['Job Card Number'];
        if (!jcNumber) continue;

        const isDuplicate = jobCards.some(jc => jc.jobCardNumber === jcNumber);
        if (isDuplicate) {
          skippedCount++;
          continue;
        }

        if (!isSuperAdmin && (profile.tokensAvailable - tokensNeeded) <= 0) {
          break;
        }

        const newJCRef = doc(collection(db, 'job_cards'));
        batch.set(newJCRef, {
          id: newJCRef.id,
          jobCardNumber: jcNumber,
          workerName: data['Worker Name'] || 'Unknown',
          fatherName: data['Father Name'] || '',
          gender: data['Gender'] || 'Male',
          gramPanchayat: data['Gram Panchayat'] || '',
          block: data['Block'] || '',
          mandays: parseInt(data['Mandays']) || 0,
          workerVideoUrl: '',
          videoVerificationStatus: 'Missing',
          addedByUserId: profile.id,
          assignedToUserId: isSuperAdmin ? null : profile.id,
          status: isSuperAdmin ? 'Draft' : 'Assigned',
          dateAdded: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });

        addedCount++;
        if (!isSuperAdmin) tokensNeeded++;
      }

      if (addedCount > 0) {
        if (!isSuperAdmin) {
          const userRef = doc(db, 'users', profile.id);
          batch.update(userRef, {
            tokensAvailable: profile.tokensAvailable - tokensNeeded,
            updatedAt: serverTimestamp()
          });
        }
        
        try {
          await batch.commit();
          toast({ 
            title: 'Bulk Upload Complete', 
            description: `Successfully added ${addedCount} cards. Skipped ${skippedCount} duplicates.` 
          });
        } catch (err: any) {
          toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
        }
      } else {
        toast({ 
          variant: 'destructive',
          title: 'No New Data', 
          description: skippedCount > 0 ? `All ${skippedCount} entries were duplicates.` : 'Token khatm ho gaye hain. Kripya recharge karayein.' 
        });
      }
      
      setLoading(false);
      setIsBulkOpen(false);
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleApplyDemand = async (applyDeduction: boolean) => {
    if (selectedIds.length === 0 || demandDays <= 0 || !profile) return;
    setLoading(true);
    
    const selectedCards = jobCards.filter(jc => selectedIds.includes(jc.id));

    try {
      if (applyDeduction) {
        const batch = writeBatch(db);
        const demandItems: any[] = [];

        selectedIds.forEach(id => {
          const jc = jobCards.find(card => card.id === id);
          if (jc) {
            const daysToSubtract = Math.min(jc.mandays, demandDays);
            const newMandays = jc.mandays - daysToSubtract;
            
            const jcRef = doc(db, 'job_cards', id);
            batch.update(jcRef, {
              mandays: newMandays,
              lastUpdated: serverTimestamp()
            });

            demandItems.push({
              jobCardId: id,
              workerName: jc.workerName,
              jobCardNumber: jc.jobCardNumber,
              deductedDays: daysToSubtract
            });
          }
        });

        const demandRef = doc(collection(db, 'demands'));
        const recipientId = selectedRecipientId || 'SYSTEM_ADMIN';
        
        batch.set(demandRef, {
          id: demandRef.id,
          requesterId: profile.id,
          requesterName: profile.name,
          recipientId: recipientId,
          demandDays: demandDays,
          status: 'Pending',
          items: demandItems,
          createdAt: serverTimestamp()
        });

        const notificationRef = doc(collection(db, 'notifications'));
        batch.set(notificationRef, {
          id: notificationRef.id,
          recipientUserId: recipientId,
          message: `${profile.name} has submitted a demand for ${selectedIds.length} workers.`,
          type: 'DEMAND_REQUEST',
          isRead: false,
          relatedEntityId: demandRef.id,
          createdAt: serverTimestamp()
        });

        await batch.commit();
        toast({ 
          title: 'Demand Applied & Sent', 
          description: `Demand sent to ${recipientId === 'SYSTEM_ADMIN' ? 'SuperAdmin' : (creatorAdmin?.name || 'Admin')}.` 
        });
      }

      generatePDF(selectedCards, demandDays);

      if (!applyDeduction) {
        toast({ title: 'PDF Generated', description: 'Worker details exported without mandays deduction.' });
      }

      setIsDemandOpen(false);
      setSelectedIds([]);
      setDemandDays(14);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Operation Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAddJobCard = async () => {
    if (!profile) return;

    // Compulsory Field Validation
    if (!newJC.jobCardNumber.trim() || !newJC.workerName.trim() || !newJC.fatherName.trim() || !newJC.gender || newJC.mandays <= 0) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Kripya Job Card Number, Worker Name, Father\'s Name, Gender aur Mandays zarur bharein.',
      });
      return;
    }
    
    const isSuperAdmin = profile.role === 'SuperAdmin';
    if (!isSuperAdmin && profile.tokensAvailable <= 0) {
      toast({ 
        variant: 'destructive', 
        title: 'Insufficient Tokens', 
        description: 'Token khatm ho gaye hain. Kripya recharge karayein ya Administrator se sampark karein.' 
      });
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    try {
      let workerVideoUrl = '';
      if (videoFile) {
        workerVideoUrl = await uploadFileWithProgress(videoFile, `videos/${Date.now()}_${videoFile.name}`);
      }

      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', profile.id);
        const userDoc = await transaction.get(userRef);
        const currentTokens = userDoc.data()?.tokensAvailable ?? 0;

        if (!isSuperAdmin) {
          if (currentTokens <= 0) throw new Error('No tokens left. Token recharge karao.');
          transaction.update(userRef, { tokensAvailable: currentTokens - 1 });
        }

        const newJCDocRef = doc(collection(db, 'job_cards'));
        
        let targetUserId = assignOnCreateTarget;
        if (!isSuperAdmin) {
            targetUserId = profile.id;
        }

        const status = targetUserId ? 'Assigned' : 'Draft';
        
        transaction.set(newJCDocRef, {
          id: newJCDocRef.id,
          ...newJC,
          workerVideoUrl,
          videoVerificationStatus: workerVideoUrl ? 'Uploaded' : 'Missing',
          addedByUserId: profile.id,
          assignedToUserId: targetUserId || null,
          status: status,
          dateAdded: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
      });

      setIsAddOpen(false);
      setNewJC({ jobCardNumber: '', workerName: '', fatherName: '', gender: 'Male', gramPanchayat: '', block: '', mandays: 100 });
      setVideoFile(null);
      setAssignOnCreateTarget(null);
      setUploadProgress(0);
      toast({ 
        title: 'Job Card Saved', 
        description: isSuperAdmin && !assignOnCreateTarget ? 'Saved as draft.' : 'Assigned successfully.' 
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Operation Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const idsToAssign = activeJCOfAssign ? [activeJCOfAssign.id] : selectedIds;
      
      idsToAssign.forEach(id => {
        const jcRef = doc(db, 'job_cards', id);
        batch.update(jcRef, {
          status: 'Assigned',
          assignedToUserId: assignTarget,
          lastUpdated: serverTimestamp()
        });
      });

      await batch.commit();
      toast({ title: 'Success', description: `${idsToAssign.length} Job Card(s) assigned.` });
      setIsAssignOpen(false);
      setAssignTarget(null);
      setActiveJCOfAssign(null);
      setSelectedIds([]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Assignment Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAccept = async () => {
    if (selectedIds.length === 0 || !profile) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      let acceptedCount = 0;
      selectedIds.forEach(id => {
        const jc = jobCards.find(card => card.id === id);
        if (jc && jc.status === 'Assigned' && jc.assignedToUserId === profile.id) {
          const jcRef = doc(db, 'job_cards', id);
          batch.update(jcRef, {
            status: 'Accepted',
            acceptedByUserId: profile.id,
            lastUpdated: serverTimestamp()
          });
          acceptedCount++;
        }
      });

      if (acceptedCount > 0) {
        await batch.commit();
        toast({ title: 'Success', description: `${acceptedCount} Job Card(s) accepted.` });
      } else {
        toast({ title: 'No Changes', description: "Selected cards were not in your inbox." });
      }
      setSelectedIds([]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Acceptance Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Kya aap waqai in ${selectedIds.length} Job Cards ko delete karna chahte hain? Ye action wapas nahi liya ja sakta.`)) return;
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.delete(doc(db, 'job_cards', id));
      });
      await batch.commit();
      toast({ title: 'Success', description: `${selectedIds.length} Job Card(s) permanently hata diye gaye hain.` });
      setSelectedIds([]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePullBack = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        const jcRef = doc(db, 'job_cards', id);
        batch.update(jcRef, {
          status: 'Draft',
          assignedToUserId: null,
          lastUpdated: serverTimestamp()
        });
      });

      await batch.commit();
      toast({ title: 'Success', description: `${selectedIds.length} Job Card(s) pulled back to drafts.` });
      setSelectedIds([]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Pull Back Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSinglePullBack = async (id: string) => {
    setLoading(true);
    try {
      const jcRef = doc(db, 'job_cards', id);
      await updateDoc(jcRef, {
        status: 'Draft',
        assignedToUserId: null,
        lastUpdated: serverTimestamp()
      });
      toast({ title: 'Success', description: 'Job Card pulled back to drafts.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Pull Back Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (jc: JobCard) => {
    setLoading(true);
    try {
      const jcRef = doc(db, 'job_cards', jc.id);
      await updateDoc(jcRef, {
        status: 'Accepted',
        acceptedByUserId: profile?.id,
        lastUpdated: serverTimestamp()
      });
      toast({ title: 'Job Card Accepted', description: 'Record added to your active list.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Acceptance Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateJobCard = async () => {
    if (!editingJC) return;

    // Validation
    if (!editingJC.jobCardNumber.trim() || !editingJC.workerName.trim() || !editingJC.fatherName.trim() || !editingJC.gender || editingJC.mandays <= 0) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Compulsory fields (Job Card #, Name, Father Name, Gender, Mandays) nahi bhare gaye hain.',
      });
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    try {
      let workerVideoUrl = editingJC.workerVideoUrl || '';
      let videoStatus = editingJC.videoVerificationStatus;

      if (editingVideoFile) {
        workerVideoUrl = await uploadFileWithProgress(editingVideoFile, `videos/${Date.now()}_${editingVideoFile.name}`);
        videoStatus = 'Uploaded';
      }

      const jcRef = doc(db, 'job_cards', editingJC.id);
      await updateDoc(jcRef, {
        ...editingJC,
        workerVideoUrl,
        videoVerificationStatus: videoStatus,
        lastUpdated: serverTimestamp()
      });
      
      setIsEditOpen(false);
      setEditingJC(null);
      setEditingVideoFile(null);
      setUploadProgress(0);
      toast({ title: 'Job Card Updated', description: 'Changes saved successfully.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (jc: JobCard) => {
    if (!jc.workerVideoUrl) {
      toast({ title: 'Verification Skipped', description: 'No video found.' });
      return;
    }

    try {
      setLoading(true);
      toast({ title: 'AI Verification Started', description: 'Analyzing worker video...' });
      
      const response = await fetch(jc.workerVideoUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      
      const videoDataUri = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const result = await verifyWorkerVideo({
        videoDataUri, 
        workerName: jc.workerName,
        fatherName: jc.fatherName,
        jobCardNumber: jc.jobCardNumber
      });

      await updateDoc(doc(db, 'job_cards', jc.id), {
        videoVerificationStatus: result.status,
        lastUpdated: serverTimestamp()
      });

      toast({ 
        title: `Verification: ${result.status}`, 
        description: result.reason,
        variant: result.status === 'Verified' ? 'default' : 'destructive'
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'AI Failed', description: 'Analysis error.' });
    } finally {
      setLoading(false);
    }
  };

  const deleteJC = async (id: string) => {
    if (confirm('Permanently delete this record?')) {
      await deleteDoc(doc(db, 'job_cards', id));
      toast({ title: 'Job Card Deleted', description: 'Record removed.' });
    }
  };

  const toggleSelectAll = (cards: JobCard[]) => {
    if (selectedIds.length === cards.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(cards.map(c => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const applyAdvancedFilters = (cards: JobCard[]) => {
    return cards.filter(jc => {
      // Search term
      const matchesSearch = jc.jobCardNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           jc.workerName.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // Gender filter
      if (filters.gender !== 'All' && jc.gender !== filters.gender) return false;

      // Mandays range
      const min = filters.minMandays ? parseInt(filters.minMandays) : -Infinity;
      const max = filters.maxMandays ? parseInt(filters.maxMandays) : Infinity;
      if (jc.mandays < min || jc.mandays > max) return false;

      // Location filter
      if (filters.location && !(`${jc.gramPanchayat} ${jc.block}`.toLowerCase().includes(filters.location.toLowerCase()))) return false;

      return true;
    });
  };

  const filteredBySearch = useMemo(() => applyAdvancedFilters(jobCards), [jobCards, searchTerm, filters]);

  const drafts = filteredBySearch.filter(jc => 
    (jc.status === 'Draft' || jc.status === 'Assigned') && 
    (profile?.role === 'SuperAdmin' || jc.addedByUserId === profile?.id)
  );
  
  const inbox = filteredBySearch.filter(jc => {
    if ((profile?.role === 'SuperAdmin' || profile?.role === 'Admin') && filterUserId) {
        return jc.status === 'Assigned' && jc.assignedToUserId === filterUserId;
    }
    return jc.status === 'Assigned' && jc.assignedToUserId === profile?.id;
  });

  const accepted = filteredBySearch.filter(jc => {
    if ((profile?.role === 'SuperAdmin' || profile?.role === 'Admin') && filterUserId) {
        return jc.status === 'Accepted' && jc.acceptedByUserId === filterUserId;
    }
    const isAcceptedByMe = jc.status === 'Accepted' && (jc.acceptedByUserId === profile?.id || jc.addedByUserId === profile?.id);
    if (profile?.role === 'SuperAdmin') {
        return jc.status === 'Accepted';
    }
    return isAcceptedByMe;
  });

  const isUser = profile?.role === 'User';

  return (
    <AppLayout>
      <div className="space-y-6">
        {profile && profile.role !== 'SuperAdmin' && profile.tokensAvailable <= 0 && (
          <Alert variant="destructive" className="mb-6 bg-red-50 border-red-200 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertTitle className="text-red-800 font-bold">Aapke Token khatm ho gaye hain!</AlertTitle>
            <AlertDescription className="text-red-700">
              Naye Job Card add karne ke liye kripya Administrator se sampark karein aur apna account <strong>Token Recharge karao</strong>.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Job Card Management</h1>
            <p className="text-muted-foreground">Manage drafts, assign tasks, and track accepted worker records.</p>
          </div>
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <div className="flex gap-2 animate-in fade-in slide-in-from-right-4">
                {canBulkAccept && (
                  <Button variant="default" className="gap-2 bg-accent text-accent-foreground shadow-lg" onClick={handleBulkAccept}>
                    <CheckCircle2 className="h-4 w-4" /> Bulk Accept ({selectedIds.length})
                  </Button>
                )}
                <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/10" onClick={() => setIsDemandOpen(true)}>
                  <CalendarCheck className="h-4 w-4" /> Apply Demand ({selectedIds.length})
                </Button>
                <Button variant="outline" className="gap-2 border-accent text-accent hover:bg-accent/10" onClick={() => { setActiveJCOfAssign(null); setIsAssignOpen(true); }}>
                  <Layers className="h-4 w-4" /> Bulk Assign ({selectedIds.length})
                </Button>
                {(profile?.role === 'SuperAdmin' || profile?.role === 'Admin') && (
                  <Button variant="outline" className="gap-2 border-destructive text-destructive hover:bg-destructive/10" onClick={handlePullBack}>
                    <RotateCcw className="h-4 w-4" /> Pull Back ({selectedIds.length})
                  </Button>
                )}
                <Button variant="destructive" className="gap-2 shadow-md" onClick={handleBulkDelete} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Bulk Delete ({selectedIds.length})
                </Button>
              </div>
            )}
            
            {(profile?.role === 'SuperAdmin' || profile?.role === 'Admin') && (
              <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <FileText className="h-4 w-4" /> Bulk Operations
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[450px]">
                  <DialogHeader>
                    <DialogTitle>Bulk Job Card Operations</DialogTitle>
                    <DialogDescription>Download the CSV template or upload your data in bulk.</DialogDescription>
                  </DialogHeader>
                  <div className="py-6 space-y-6">
                    <div className="flex flex-col gap-3 p-4 border rounded-xl bg-muted/20">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Download className="h-4 w-4 text-primary" /> Step 1: Download Template
                      </h3>
                      <p className="text-xs text-muted-foreground">Download the standard CSV format to prepare your worker data.</p>
                      <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleDownloadTemplate}>
                        Download Template CSV
                      </Button>
                    </div>

                    <div className="flex flex-col gap-3 p-4 border rounded-xl bg-accent/5 border-accent/20">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Upload className="h-4 w-4 text-accent" /> Step 2: Upload CSV File
                      </h3>
                      <p className="text-xs text-muted-foreground">Upload your filled CSV. Existing job card numbers will be skipped automatically.</p>
                      <div className="relative mt-2">
                        <input 
                          type="file" 
                          accept=".csv" 
                          className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-foreground hover:file:bg-accent/90"
                          onChange={handleBulkUpload}
                          disabled={loading}
                        />
                        {loading && <div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded-md"><Loader2 className="h-4 w-4 animate-spin" /></div>}
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 text-blue-800 text-[10px] border border-blue-200">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-bold">Important Policy:</p>
                        <ul className="list-disc ml-4 mt-1 space-y-0.5">
                          <li>1 Token will be deducted per successful Job Card entry.</li>
                          <li>Non-SuperAdmins: Cards are automatically assigned to you.</li>
                          <li>Duplicates are checked across the entire system.</li>
                          <li>Token khatm hone par bulk upload ruk jayega.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 h-11 px-6 shadow-lg">
                  <Plus className="h-5 w-5" /> Manual Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                  <DialogTitle>New Job Card Entry</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {profile && profile.role !== 'SuperAdmin' && profile.tokensAvailable <= 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No Tokens Left</AlertTitle>
                      <AlertDescription>
                        Token recharge karao to add new cards.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">Job Card Number <span className="text-destructive">*</span></Label>
                      <Input 
                        placeholder="RJ-00-123..." 
                        value={newJC.jobCardNumber} 
                        onChange={e => setNewJC({...newJC, jobCardNumber: e.target.value})} 
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">Worker Name <span className="text-destructive">*</span></Label>
                      <Input placeholder="Full Name" value={newJC.workerName} onChange={e => setNewJC({...newJC, workerName: e.target.value})} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">Father's Name <span className="text-destructive">*</span></Label>
                      <Input placeholder="Father's Full Name" value={newJC.fatherName} onChange={e => setNewJC({...newJC, fatherName: e.target.value})} required />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">Gender <span className="text-destructive">*</span></Label>
                      <Select value={newJC.gender} onValueChange={(v: any) => setNewJC({...newJC, gender: v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Gram Panchayat</Label>
                      <Input placeholder="GP Name" value={newJC.gramPanchayat} onChange={e => setNewJC({...newJC, gramPanchayat: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Block</Label>
                      <Input placeholder="Block Name" value={newJC.block} onChange={e => setNewJC({...newJC, block: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Mandays <span className="text-destructive">*</span></Label>
                    <Input type="number" value={newJC.mandays} onChange={e => setNewJC({...newJC, mandays: parseInt(e.target.value) || 0})} required />
                  </div>
                  
                  {profile?.role === 'SuperAdmin' && (
                    <div className="space-y-2">
                      <Label>Send to User (Optional)</Label>
                      <Select onValueChange={setAssignOnCreateTarget}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a User to Assign" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name} ({u.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Worker Video (Max 20 seconds)</Label>
                    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-6 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <Video className="h-8 w-8 text-muted-foreground" />
                        <div className="flex-1 text-sm">
                          <input type="file" accept="video/*" onChange={e => setVideoFile(e.target.files?.[0] || null)} />
                        </div>
                      </div>
                      {loading && uploadProgress > 0 && (
                        <div className="space-y-1">
                          <Progress value={uploadProgress} className="h-2" />
                          <p className="text-[10px] text-center font-medium">Uploading: {Math.round(uploadProgress)}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddJobCard} disabled={loading || (profile?.role !== 'SuperAdmin' && profile?.tokensAvailable <= 0)}>
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : (profile?.role === 'SuperAdmin' ? (assignOnCreateTarget ? 'Assign Directly' : 'Save as Draft') : 'Add & Assign to Me')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {(profile?.role === 'SuperAdmin' || profile?.role === 'Admin') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">User Load Summary</h2>
              {filterUserId && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => setFilterUserId(null)}>
                  <XCircle className="h-3 w-3" /> Clear Filter
                </Button>
              )}
            </div>
            <ScrollArea className="w-full pb-4">
              <div className="flex gap-4">
                {users.map(u => {
                  const count = userJobCardCounts[u.id] || 0;
                  const isActive = filterUserId === u.id;
                  return (
                    <Card 
                      className={`min-w-[180px] cursor-pointer transition-all hover:border-primary/50 ${isActive ? 'ring-2 ring-primary border-primary shadow-md' : 'border-border/40'}`}
                      key={u.id}
                      onClick={() => setFilterUserId(isActive ? null : u.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          <UserIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-bold truncate">{u.name}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">{u.role}</span>
                            <Badge variant="secondary" className="h-5 px-1.5 font-bold">{count}</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-1 shadow-sm max-w-xs flex-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search workers..." 
              className="border-none shadow-none focus-visible:ring-0 h-9 text-sm" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          {(filters.gender !== 'All' || filters.location || filters.minMandays || filters.maxMandays) && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs gap-2 text-destructive"
              onClick={() => setFilters({ gender: 'All', minMandays: '', maxMandays: '', location: '' })}
            >
              <FilterX className="h-4 w-4" /> Clear All Filters
            </Button>
          )}
        </div>

        <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>{activeJCOfAssign ? 'Assign Job Card' : `Bulk Assign ${selectedIds.length} Cards`}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Select User</Label>
                <Select onValueChange={setAssignTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an Admin/User" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAssignOpen(false)}>Cancel</Button>
              <Button onClick={handleAssign} disabled={loading || !assignTarget}>
                {loading ? 'Assigning...' : 'Confirm Assignment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDemandOpen} onOpenChange={setIsDemandOpen}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>Apply Demand & Export</DialogTitle>
              <p className="text-sm text-muted-foreground">Apply worker demand for {selectedIds.length} workers.</p>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Number of Days for Demand</Label>
                <Input type="number" value={demandDays} onChange={e => setDemandDays(parseInt(e.target.value) || 0)} min={1} />
              </div>
              
              <div className="space-y-2">
                <Label>Recipient (Send Demand To)</Label>
                <Select value={selectedRecipientId || 'SYSTEM_ADMIN'} onValueChange={setSelectedRecipientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {profile?.createdByUserId && creatorAdmin && (
                      <SelectItem value={profile.createdByUserId}>
                        {creatorAdmin.name} (Assigned Admin)
                      </SelectItem>
                    )}
                    <SelectItem value="SYSTEM_ADMIN">
                      SuperAdmin (Direct)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground italic">Priority is given to your assigned Admin by default.</p>
              </div>

              <div className="rounded-lg bg-muted/30 p-4 border space-y-3">
                <p className="text-xs font-bold text-primary flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Selected Recipient Info
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                    {selectedRecipientId === 'SYSTEM_ADMIN' ? 'S' : (creatorAdmin?.name?.charAt(0) || 'A')}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{selectedRecipientId === 'SYSTEM_ADMIN' ? 'SuperAdmin (System)' : (creatorAdmin?.name || 'Assigned Admin')}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{selectedRecipientId === 'SYSTEM_ADMIN' ? 'System Authority' : 'Assigned User'}</p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" className="sm:flex-1 gap-2" onClick={() => handleApplyDemand(false)} disabled={loading}>
                <FileOutput className="h-4 w-4" /> PDF Only
              </Button>
              <Button className="sm:flex-1 gap-2 bg-accent text-accent-foreground" onClick={() => handleApplyDemand(true)} disabled={loading}>
                <Send className="h-4 w-4" /> Apply & Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>Edit Job Card</DialogTitle>
            </DialogHeader>
            {editingJC && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Job Card Number <span className="text-destructive">*</span></Label>
                    <Input value={editingJC.jobCardNumber} onChange={e => setEditingJC({...editingJC, jobCardNumber: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Worker Name <span className="text-destructive">*</span></Label>
                    <Input value={editingJC.workerName} onChange={e => setEditingJC({...editingJC, workerName: e.target.value})} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Father's Name <span className="text-destructive">*</span></Label>
                    <Input value={editingJC.fatherName} onChange={e => setEditingJC({...editingJC, fatherName: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Gender <span className="text-destructive">*</span></Label>
                    <Select value={editingJC.gender || 'Male'} onValueChange={(v: any) => setEditingJC({...editingJC, gender: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Gram Panchayat</Label>
                    <Input value={editingJC.gramPanchayat} onChange={e => setEditingJC({...editingJC, gramPanchayat: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Block</Label>
                    <Input value={editingJC.block} onChange={e => setEditingJC({...editingJC, block: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">Mandays <span className="text-destructive">*</span></Label>
                  <Input type="number" value={editingJC.mandays} onChange={e => setEditingJC({...editingJC, mandays: parseInt(e.target.value) || 0})} required />
                </div>
                <div className="space-y-2">
                  <Label>Update Video</Label>
                  <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 bg-muted/20">
                    <input type="file" accept="video/*" onChange={e => setEditingVideoFile(e.target.files?.[0] || null)} />
                    {loading && uploadProgress > 0 && (
                      <Progress value={uploadProgress} className="h-1.5" />
                    )}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateJobCard} disabled={loading}>
                {loading ? 'Saving...' : 'Update Job Card'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="active" className="w-full" onValueChange={() => setSelectedIds([])}>
          <TabsList className="bg-card border h-11 mb-6">
            <TabsTrigger value="active" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Active Cards
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-2">
              <FileText className="h-4 w-4" /> Drafts & Pending
            </TabsTrigger>
            <TabsTrigger value="inbox" className="gap-2">
              <Inbox className="h-4 w-4" /> My Inbox {inbox.length > 0 && <Badge className="ml-1 bg-accent text-accent-foreground h-5 px-1.5">{inbox.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <JCTable 
              data={accepted} 
              type="active" 
              selectedIds={selectedIds}
              toggleSelectAll={toggleSelectAll}
              toggleSelectOne={toggleSelectOne}
              users={users}
              profile={profile}
              handleAccept={handleAccept}
              handleSinglePullBack={handleSinglePullBack}
              setActiveJCOfAssign={setActiveJCOfAssign}
              setIsAssignOpen={setIsAssignOpen}
              handleVerify={handleVerify}
              loading={loading}
              setEditingJC={setEditingJC}
              setIsEditOpen={setIsEditOpen}
              deleteJC={deleteJC}
              filters={filters}
              setFilters={setFilters}
            />
          </TabsContent>
          
          <TabsContent value="drafts">
            <JCTable 
              data={drafts} 
              type="draft" 
              selectedIds={selectedIds}
              toggleSelectAll={toggleSelectAll}
              toggleSelectOne={toggleSelectOne}
              users={users}
              profile={profile}
              handleAccept={handleAccept}
              handleSinglePullBack={handleSinglePullBack}
              setActiveJCOfAssign={setActiveJCOfAssign}
              setIsAssignOpen={setIsAssignOpen}
              handleVerify={handleVerify}
              loading={loading}
              setEditingJC={setEditingJC}
              setIsEditOpen={setIsEditOpen}
              deleteJC={deleteJC}
              filters={filters}
              setFilters={setFilters}
            />
          </TabsContent>

          <TabsContent value="inbox">
            <JCTable 
              data={inbox} 
              type="inbox" 
              selectedIds={selectedIds}
              toggleSelectAll={toggleSelectAll}
              toggleSelectOne={toggleSelectOne}
              users={users}
              profile={profile}
              handleAccept={handleAccept}
              handleSinglePullBack={handleSinglePullBack}
              setActiveJCOfAssign={setActiveJCOfAssign}
              setIsAssignOpen={setIsAssignOpen}
              handleVerify={handleVerify}
              loading={loading}
              setEditingJC={setEditingJC}
              setIsEditOpen={setIsEditOpen}
              deleteJC={deleteJC}
              filters={filters}
              setFilters={setFilters}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function JCTable({ data, type, selectedIds, toggleSelectAll, toggleSelectOne, users, profile, handleAccept, handleSinglePullBack, setActiveJCOfAssign, setIsAssignOpen, handleVerify, loading, setEditingJC, setIsEditOpen, deleteJC, filters, setFilters }: any) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[50px] text-center">
               <Checkbox 
                checked={data.length > 0 && selectedIds.length === data.length} 
                onCheckedChange={() => toggleSelectAll(data)}
              />
            </TableHead>
            <TableHead className="w-[60px]">S.No.</TableHead>
            <TableHead>Job Card #</TableHead>
            <TableHead>Worker Details</TableHead>
            
            {/* Gender Header with Filter */}
            <TableHead className="w-[120px]">
              <div className="flex items-center gap-2">
                Gender
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 p-0 hover:bg-primary/10">
                      <Filter className={`h-3 w-3 ${filters.gender !== 'All' ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-2" align="start">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground px-2">Filter Gender</p>
                      <Select value={filters.gender} onValueChange={(v) => setFilters({ ...filters, gender: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All</SelectItem>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </TableHead>

            {/* Mandays Header with Filter */}
            <TableHead className="w-[140px]">
              <div className="flex items-center gap-2">
                Mandays
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 p-0 hover:bg-primary/10">
                      <Filter className={`h-3 w-3 ${filters.minMandays || filters.maxMandays ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-3" align="start">
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Mandays Range</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Min</Label>
                          <Input 
                            type="number" 
                            className="h-8 text-xs" 
                            value={filters.minMandays} 
                            onChange={(e) => setFilters({ ...filters, minMandays: e.target.value })} 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Max</Label>
                          <Input 
                            type="number" 
                            className="h-8 text-xs" 
                            value={filters.maxMandays} 
                            onChange={(e) => setFilters({ ...filters, maxMandays: e.target.value })} 
                          />
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </TableHead>

            {/* Location Header with Filter */}
            <TableHead>
              <div className="flex items-center gap-2">
                Location
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 p-0 hover:bg-primary/10">
                      <Filter className={`h-3 w-3 ${filters.location ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="start">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground px-2">Search Location</p>
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                        <Input 
                          placeholder="GP or Block Name..." 
                          className="h-8 text-xs pl-7" 
                          value={filters.location}
                          onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </TableHead>

            <TableHead>AI Status</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? data.map((jc: any, index: number) => (
            <TableRow key={jc.id} className="group transition-colors hover:bg-muted/5">
              <TableCell className="text-center">
                <Checkbox 
                  checked={selectedIds.includes(jc.id)} 
                  onCheckedChange={() => toggleSelectOne(jc.id)}
                />
              </TableCell>
              <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
              <TableCell className="font-mono font-bold text-primary">{jc.jobCardNumber}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold">{jc.workerName}</span>
                  <span className="text-xs text-muted-foreground italic">S/o {jc.fatherName}</span>
                </div>
              </TableCell>
              
              {/* Gender Cell */}
              <TableCell>
                <Badge variant="outline" className={`font-medium ${jc.gender === 'Female' ? 'border-pink-200 text-pink-700 bg-pink-50' : 'border-blue-200 text-blue-700 bg-blue-50'}`}>
                  {jc.gender || 'M'}
                </Badge>
              </TableCell>

              {/* Mandays Cell */}
              <TableCell className="font-black text-primary">
                {jc.mandays}
              </TableCell>

              {/* Location Cell */}
              <TableCell className="text-xs font-medium">
                <p>{jc.gramPanchayat}</p>
                <p className="text-muted-foreground text-[10px]">{jc.block}</p>
              </TableCell>

              <TableCell>
                <Badge variant={jc.status === 'Assigned' ? 'secondary' : (jc.videoVerificationStatus === 'Verified' ? 'default' : 'outline')} className={jc.videoVerificationStatus === 'Verified' ? 'bg-accent text-accent-foreground' : ''}>
                  {jc.status === 'Assigned' ? 'Pending Acceptance' : jc.videoVerificationStatus}
                </Badge>
              </TableCell>
              <TableCell>
                {jc.status === 'Draft' ? (
                  <span className="text-muted-foreground italic text-xs">Not Assigned</span>
                ) : (
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">
                      {users.find((u: any) => u.id === (jc.assignedToUserId || jc.acceptedByUserId))?.name || 'Unknown User'}
                    </span>
                    <span className="text-[10px] uppercase text-muted-foreground leading-none mt-1">
                      {jc.status}
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {type === 'draft' && (
                    jc.status === 'Draft' ? (
                      <Button variant="outline" size="sm" className="gap-2 h-8" onClick={() => { setActiveJCOfAssign(jc); setIsAssignOpen(true); }}>
                        <Send className="h-4 w-4" /> Assign
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-2 h-8 border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleSinglePullBack(jc.id)}>
                        <RotateCcw className="h-4 w-4" /> Pull Back
                      </Button>
                    )
                  )}
                  {type === 'inbox' && (
                    <div className="flex gap-2">
                      <Button variant="default" size="sm" className="gap-2 h-8 bg-accent text-accent-foreground" onClick={() => handleAccept(jc)}>
                        <CheckCircle2 className="h-4 w-4" /> Accept
                      </Button>
                      {(profile?.role === 'SuperAdmin' || profile?.role === 'Admin') && (
                        <Button variant="outline" size="sm" className="gap-2 h-8 border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleSinglePullBack(jc.id)}>
                          <RotateCcw className="h-4 w-4" /> Pull Back
                        </Button>
                      )}
                    </div>
                  )}
                  {type === 'active' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleVerify(jc)} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 text-accent" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingJC(jc); setIsEditOpen(true); }}>
                    <Edit className="h-4 w-4 text-primary" />
                  </Button>
                  {(profile?.role === 'SuperAdmin' || jc.status === 'Draft') && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteJC(jc.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-10 text-muted-foreground italic">No job cards found with these filters.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
