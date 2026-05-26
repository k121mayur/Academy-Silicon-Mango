import { Navigate, Route, Routes } from "react-router-dom";

import PublicLayout from "@/components/layout/PublicLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import ProtectedRoute from "@/router/ProtectedRoute";

import Landing from "@/pages/Landing";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminCourses from "@/pages/admin/Courses";
import CourseCreate from "@/pages/admin/CourseCreate";
import CourseEdit from "@/pages/admin/CourseEdit";
import AdminBatches from "@/pages/admin/Batches";
import BatchCreate from "@/pages/admin/BatchCreate";
import BatchDetail from "@/pages/admin/BatchDetail";
import AdminInstructors from "@/pages/admin/Instructors";
import AdminStudents from "@/pages/admin/Students";
import StudentDetail from "@/pages/admin/StudentDetail";
import AssignInstructors from "@/pages/admin/AssignInstructors";
import AdminEnrollments from "@/pages/admin/Enrollments";
import BatchOps from "@/pages/admin/BatchOps";
import AdminCertificates from "@/pages/admin/Certificates";
import AdminPayments from "@/pages/admin/Payments";
import PaymentSettings from "@/pages/admin/PaymentSettings";
import AdminCatalogue from "@/pages/admin/Catalogue";

import StudentDashboard from "@/pages/student/Dashboard";
import InstructorDashboard from "@/pages/instructor/Dashboard";

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
      </Route>

      <Route element={<ProtectedRoute roles={["admin"]} />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="courses" element={<AdminCourses />} />
          <Route path="courses/create" element={<CourseCreate />} />
          <Route path="courses/:id/edit" element={<CourseEdit />} />
          <Route path="batches" element={<AdminBatches />} />
          <Route path="batches/create" element={<BatchCreate />} />
          <Route path="batches/:id" element={<BatchDetail />} />
          <Route path="users/instructors" element={<AdminInstructors />} />
          <Route path="users/students" element={<AdminStudents />} />
          <Route path="users/students/:id" element={<StudentDetail />} />
          <Route path="assign-instructors" element={<AssignInstructors />} />
          <Route path="enrollments" element={<AdminEnrollments />} />
          <Route path="batch-ops" element={<BatchOps />} />
          <Route path="certificates" element={<AdminCertificates />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="payment-settings" element={<PaymentSettings />} />
          <Route path="catalogue" element={<AdminCatalogue />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={["instructor"]} />}>
        <Route path="instructor/dashboard" element={<InstructorDashboard />} />
      </Route>

      <Route element={<ProtectedRoute roles={["student"]} />}>
        <Route path="portal/dashboard" element={<StudentDashboard />} />
        <Route path="portal/profile" element={<StudentDashboard />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
