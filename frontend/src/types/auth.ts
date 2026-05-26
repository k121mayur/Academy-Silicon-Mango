export type UserRole = "admin" | "instructor" | "student";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  display_name?: string | null;
  avatar_url?: string | null;
  profile_complete: boolean;
}
