
export type UserRole = 'SuperAdmin' | 'Admin' | 'User';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  gramPanchayat: string;
  block: string;
  mobileNumber?: string;
  tokensAvailable: number;
  isActive: boolean;
  photoURL?: string;
  createdByUserId?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface JobCard {
  id: string;
  jobCardNumber: string;
  workerName: string;
  fatherName: string;
  gender?: 'Male' | 'Female' | 'Other';
  gramPanchayat: string;
  block: string;
  mandays: number;
  workerVideoUrl?: string;
  videoVerificationStatus: 'Missing' | 'Uploaded' | 'Pending Verification' | 'Verified';
  addedByUserId: string;
  assignedToUserId?: string;
  acceptedByUserId?: string;
  status: 'Draft' | 'Assigned' | 'Accepted';
  dateAdded: any;
  lastUpdated: any;
}

export interface Notification {
  id: string;
  recipientUserId: string;
  message: string;
  type: 'info' | 'DEMAND_REQUEST' | 'DEMAND_REJECTED' | 'DEMAND_ACCEPTED';
  isRead: boolean;
  relatedEntityId?: string; // Demand ID
  createdAt: any;
}

export interface DemandRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  recipientId: string;
  demandDays: number;
  status: 'Pending' | 'Accepted' | 'Rejected';
  startDate?: any; // The date when demand starts
  rejectionReason?: string; // Reason why demand was rejected
  items: {
    jobCardId: string;
    workerName: string;
    jobCardNumber: string;
    deductedDays: number;
  }[];
  createdAt: any;
  updatedAt?: any;
}

export interface SystemMessage {
  id: string;
  senderName: string;
  senderEmail: string;
  senderUserId: string;
  content: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  isRead: boolean;
  replyContent?: string;
  repliedAt?: any;
  repliedBy?: string;
  createdAt: any;
}
