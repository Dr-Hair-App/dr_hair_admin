export type Role = "admin" | "super-admin";
export type AdminRoleTemplate =
  | "clinical-admin"
  | "operations-admin"
  | "content-admin"
  | "hair-test-operator"
  | "custom-admin";
export type AdminPermissionId =
  | "patients.view"
  | "assessments.review"
  | "care-plans.edit"
  | "progress.review"
  | "documents.view"
  | "documents.upload"
  | "documents.share"
  | "patients.export"
  | "patients.lookup"
  | "hair-tests.view"
  | "hair-tests.upload"
  | "hair-tests.submit"
  | "reports.approve"
  | "reports.share"
  | "content.edit"
  | "media.upload"
  | "content.publish"
  | "notifications.manage"
  | "products.manage"
  | "orders.manage"
  | "promotions.manage"
  | "commerce.export"
  | "bookings.manage";
export type AdminPermissionOverride = "allow" | "deny";

export type PageKey =
  | "overview"
  | "patients"
  | "catalog"
  | "content"
  | "orders"
  | "tests"
  | "bookings"
  | "team"
  | "activity"
  | "notifications";

export type Status =
  | "Active"
  | "Pending"
  | "Inactive"
  | "Published"
  | "Draft"
  | "Review"
  | "Completed"
  | "Cancelled"
  | "No show"
  | "Suspended";
export type OrderFulfillmentStatus =
  | "New"
  | "Preparing"
  | "Shipped"
  | "Delivered"
  | "Needs attention"
  | "Return requested"
  | "Cancelled"
  | "Refunded";
export type OrderPaymentStatus =
  "Paid" | "Pending" | "Failed" | "Partially refunded" | "Refunded";

export interface PatientRecord {
  id: string;
  patientCode?: string;
  name: string;
  initials: string;
  email: string;
  assessment: string;
  submitted: string;
  status: Status;
  phone?: string;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  occupation?: string | null;
  photoUrl?: string | null;
}

export interface AdminRecord {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: string;
  roleTemplate?: AdminRoleTemplate;
  permissionOverrides?: Partial<
    Record<AdminPermissionId, AdminPermissionOverride>
  >;
  access: string;
  actions: string[];
  lastActive: string;
  status: Status;
}

export interface FeatureRecord {
  id: string;
  title: string;
  description: string;
  group: string;
  enabled: boolean;
  admins: string;
}

export interface ContentRecord {
  id: string;
  title: string;
  section: string;
  updated: string;
  status: Status;
}

export interface OrderRecord {
  id: string;
  customer: string;
  item: string;
  date: string;
  amount: string;
  status: OrderFulfillmentStatus;
  customerEmail?: string;
  paymentMethod?: string;
  paymentStatus?: OrderPaymentStatus;
  totalAmount?: number;
  couponCode?: string;
  customerPhone?: string;
  courier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shiprocketStatus?: string;
  shiprocketShipmentId?: string;
  shiprocketPickupStatus?: string;
  shiprocketRate?: number;
  shiprocketEta?: string;
  shiprocketLabelUrl?: string;
  shiprocketManifestUrl?: string;
  shiprocketReturnShipmentId?: string;
  shiprocketReturnAwb?: string;
  refundAmount?: number;
  refundPendingAmount?: number;
  refundStatus?: "pending" | "processed" | "failed" | "";
  paymentReference?: string;
  refundReference?: string;
  refundHistory?: {
    id: string;
    amount: number;
    currency: string;
    status: "pending" | "processed" | "failed";
    updatedAt?: string;
  }[];
  paymentAttempts?: {
    id: string;
    amount: number;
    currency: string;
    method?: string;
    status: string;
    failureCode?: string;
    attemptedAt?: string;
  }[];
  gatewayAttemptStatus?: string;
  gatewayFailureCode?: string;
  refundReason?: string;
  cancellationReason?: string;
  returnReason?: string;
  subtotal?: number;
  discount?: number;
  shipping?: number;
  tax?: number;
  shippingAddress?: string;
  items?: { name: string; quantity: number; unitPrice: number }[];
  timeline?: { label: string; date: string; done: boolean }[];
}

export interface BookingRecord {
  id: string;
  patientId?: string;
  customer: string;
  service: string;
  date: string;
  startsAt?: string;
  timezone?: string;
  source?: "App" | "Phone" | "WhatsApp" | "Reception";
  status: Status;
  type?: "Physical Clinic Visit" | "Video Consultation";
  doctorName?: string;
  room?: string;
  tokenNumber?: string;
  opdStatus?:
    | "Requested"
    | "Confirmed"
    | "Arrived"
    | "In Consultation"
    | "Completed"
    | "No show"
    | "Cancelled";
  consultationFee?: number;
  paymentStatus?: "Pending" | "Paid" | "Refunded" | "Waived";
  paymentMethod?: string;
  paymentTransactionId?: string;
  refundStatus?: "pending" | "processed" | "failed" | "";
  refundAmount?: number;
  refundPendingAmount?: number;
  cancellationReason?: string;
  cancellation_reason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  rescheduleReason?: string;
  reschedule_reason?: string;
  rescheduledBy?: string;
  rescheduledAt?: string;
}

export interface AuditEventRecord {
  who: string;
  initials: string;
  action: string;
  target: string;
  time: string;
  type:
    | "Access"
    | "Feature"
    | "Content"
    | "Notifications"
    | "App updates"
    | "Commerce"
    | "Orders"
    | "Clinical"
    | "Testing"
    | "Bookings";
}

export interface AdminDashboardSummary {
  patients?: { total?: number };
  appointments?: {
    total?: number;
    today?: number;
    pending?: number;
    confirmed?: number;
    completed?: number;
  };
  assessments?: { total?: number; pending?: number };
  reports?: { total?: number; shared?: number };
  catalog?: { totalProducts?: number; lowStockProducts?: number };
  recentActivity?: Array<{
    id: string;
    who: string;
    action: string;
    target: string;
    type: string;
    time: string;
  }>;
}
