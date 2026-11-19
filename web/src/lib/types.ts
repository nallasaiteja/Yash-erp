export type Page<T> = { items: T[]; total: number; page: number; size: number };
export type RoleBrief = { id: number; name: string };
export type UserBrief = { id: number; full_name: string; email: string };

export type Me = {
  id: number;
  email: string;
  full_name: string;
  role: RoleBrief;
  permissions: string[];
  employee_id: number | null;
};

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: RoleBrief;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type Role = {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
  user_count: number;
};
export type Permission = { id: number; code: string; module: string; action: string };

export type Department = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  head_employee_id: number | null;
  employee_count: number;
};

export type EmpBrief = { id: number; employee_code: string; full_name: string };

export type Employee = {
  id: number;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  department_id: number | null;
  department: { id: number; name: string } | null;
  manager_id: number | null;
  user_id: number | null;
  employment_type: string;
  status: string;
  date_of_joining: string | null;
  date_of_exit: string | null;
  address: string | null;
  emergency_contact: string | null;
  created_at: string;
};

export type Attendance = {
  id: number;
  employee_id: number;
  employee: EmpBrief;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  source: string;
  notes: string | null;
  hours: number | null;
};

export type Leave = {
  id: number;
  employee_id: number;
  employee: EmpBrief;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export type Task = {
  id: number;
  title: string;
  description: string | null;
  assignee: UserBrief | null;
  created_by: UserBrief;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  overdue: boolean;
};

export type Doc = {
  id: number;
  title: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  category: string;
  tags: string[];
  description: string | null;
  employee_id: number | null;
  uploaded_by: UserBrief;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  user: UserBrief | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  ip_address: string | null;
  created_at: string;
};
