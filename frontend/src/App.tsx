import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import PublicLayout from "@/components/layout/PublicLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import InstructorLayout from "@/components/layout/InstructorLayout";
import StudentLayout from "@/components/layout/StudentLayout";
import ProtectedRoute from "@/router/ProtectedRoute";
import { Spinner } from "@/components/ui/Spinner";

import Landing from "@/pages/Landing";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import VerifyCertificate from "@/pages/public/VerifyCertificate";
import VerifyWebinarRegistration from "@/pages/public/VerifyWebinarRegistration";
import WebinarListing from "@/pages/WebinarListing";
import WebinarDetail from "@/pages/WebinarDetail";
import WebinarRegister from "@/pages/WebinarRegister";
import ChangePasswordPage from "@/pages/account/ChangePassword";

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
import AdminEnrollments from "@/pages/admin/Enrollments";
import BatchOps from "@/pages/admin/BatchOps";
import AdminCertificates from "@/pages/admin/Certificates";
import AdminPayments from "@/pages/admin/Payments";
import PaymentSettings from "@/pages/admin/PaymentSettings";
import AdminCatalogue from "@/pages/admin/Catalogue";
import AdminWebinars from "@/pages/admin/Webinars";
import WebinarForm from "@/pages/admin/WebinarForm";
import WebinarDetailAdmin from "@/pages/admin/WebinarDetailAdmin";

// Student pages are lazy-loaded so the catalogue route never ships the video player / heavy libs.
const StudentProfile = lazy(() => import("@/pages/student/Profile"));
const ExploreCatalogue = lazy(() => import("@/pages/student/explore/ExploreCatalogue"));
const CourseDetails = lazy(() => import("@/pages/student/explore/CourseDetails"));
const BatchSelection = lazy(() => import("@/pages/student/explore/BatchSelection"));
const MyCourses = lazy(() => import("@/pages/student/MyCourses"));
const BatchWorkspace = lazy(() => import("@/pages/student/BatchWorkspace"));
const SelfPacedCourse = lazy(() => import("@/pages/student/SelfPacedCourse"));

import InstructorDashboard from "@/pages/instructor/Dashboard";
import AssignedBatches from "@/pages/instructor/AssignedBatches";
import CoursePlan from "@/pages/instructor/CoursePlan";
import SessionsResources from "@/pages/instructor/SessionsResources";
import CreateAssignmentPage from "@/pages/instructor/CreateAssignment";
import AttendancePage from "@/pages/instructor/Attendance";
import GradingPage from "@/pages/instructor/Grading";
import CompletionPage from "@/pages/instructor/Completion";

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="webinars" element={<WebinarListing />} />
        <Route path="webinars/:idOrSlug" element={<WebinarDetail />} />
        <Route path="webinars/:idOrSlug/register" element={<WebinarRegister />} />
      </Route>

      <Route path="verify/:certId" element={<VerifyCertificate />} />
      <Route path="webinars/verify/:token" element={<VerifyWebinarRegistration />} />

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
          <Route path="enrollments" element={<AdminEnrollments />} />
          <Route path="batch-ops" element={<BatchOps />} />
          <Route path="certificates" element={<AdminCertificates />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="payment-settings" element={<PaymentSettings />} />
          <Route path="catalogue" element={<AdminCatalogue />} />
          <Route path="webinars" element={<AdminWebinars />} />
          <Route path="webinars/create" element={<WebinarForm />} />
          <Route path="webinars/:id/edit" element={<WebinarForm />} />
          <Route path="webinars/:id" element={<WebinarDetailAdmin />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={["instructor"]} />}>
        <Route path="instructor" element={<InstructorLayout />}>
          <Route index element={<Navigate to="/instructor/dashboard" replace />} />
          <Route path="dashboard" element={<InstructorDashboard />} />
          <Route path="batches" element={<AssignedBatches />} />
          <Route path="plan" element={<CoursePlan />} />
          <Route path="sessions" element={<SessionsResources />} />
          <Route path="assignments/new" element={<CreateAssignmentPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="grading" element={<GradingPage />} />
          <Route path="completion" element={<CompletionPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="account/change-password" element={<ChangePasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute roles={["student"]} requireProfileComplete />}>
        <Route path="portal" element={<StudentLayout />}>
          <Route index element={<Navigate to="/portal/my-courses" replace />} />
          <Route path="profile" element={<StudentProfile />} />
          <Route path="explore" element={<ExploreCatalogue />} />
          <Route path="explore/:courseId" element={<CourseDetails />} />
          <Route path="explore/:courseId/batches" element={<BatchSelection />} />
          <Route path="my-courses" element={<MyCourses />} />
          <Route path="my-courses/:batchId" element={<BatchWorkspace />} />
          <Route path="dashboard" element={<Navigate to="/portal/my-courses" replace />} />
        </Route>
        {/* Self-paced viewer keeps its own full-screen chrome, outside the portal layout. */}
        <Route
          path="portal/courses/:batchId"
          element={
            <Suspense
              fallback={
                <div className="min-h-screen grid place-items-center bg-surface">
                  <Spinner size={28} className="text-primary" />
                </div>
              }
            >
              <SelfPacedCourse />
            </Suspense>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
