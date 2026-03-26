# **App Name**: NREGA GURU

## Core Features:

- User Authentication & Authorization: Secure login and signup for Super Admin, Admin, and regular Users. The first registered user is automatically designated as Super Admin. Features are displayed based on assigned roles.
- User Management: Super Admin and Admin can create, view, edit, update, and activate/deactivate users (Admin, User types). Displays lists of Admins and Users with relevant details. Only Super Admin can permanently delete users.
- Job Card Management (Entry & Upload): Manual entry of individual job cards with worker details and 20-second video uploads to Firebase Storage. Supports bulk upload of job cards via Excel template, with duplicate detection based on 'JobCard Number + Worker Name'.
- Job Card Assignment & Inbox System: Super Admin can assign job cards to active users via a dropdown. Assigned job cards appear in the user's Inbox, allowing users to review, select, and accept job cards to their account.
- Token System: Each user has a limited number of tokens (default 20). Accepting a job card consumes one token. Users cannot accept or create job cards if they lack sufficient tokens.
- AI Video Verification Tool: An AI-powered tool to detect a worker's face from an uploaded video and verify their identity against the job card information, assigning a 'Verified' or 'Pending Verification' status.
- Admin Monitoring & Basic Reporting: Super Admin dashboard with analytics on total, active, and inactive users (Super Admin, Admin, Users). Real-time notifications for new user sign-ups. Includes a section to track job card additions by user.

## Style Guidelines:

- Primary interactive color: Professional slate-blue (#3D748F), selected for its clear and stable aesthetic, providing good contrast on light backgrounds.
- Background color: A very light, almost off-white hue (#F0F3F5), with a subtle cool undertone to maintain visual lightness and enhance readability for an admin panel.
- Accent color: A vibrant lime-green (#BBDB26) is used to draw attention to critical actions and provide distinct visual feedback, contrasting effectively with the primary color.
- Both headlines and body text will use the 'Inter' sans-serif font, chosen for its modern, clear, and objective readability suitable for data-rich administrative interfaces.
- Clean, modern line icons in the accent color should be used throughout the application to signify actions, navigation, and status, enhancing clarity and user experience.
- The layout features a persistent left sidebar navigation and a clear top header, with content organized into responsive dashboard cards and data tables utilizing search filters and pagination for efficient data management.
- Subtle, purpose-driven animations will be integrated for user feedback on actions (e.g., form submissions, status updates) and smooth transitions during navigation, avoiding distractions.