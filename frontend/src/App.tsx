import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

// Layouts + guards stay eager so navigation chrome paints instantly; every page
// below is code-split via lazy() so a visitor only downloads the route they open.
import PublicLayout from "@/components/layout/PublicLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import InstructorLayout from "@/components/layout/InstructorLayout";
import StudentLayout from "@/components/layout/StudentLayout";
import ProtectedRoute from "@/router/ProtectedRoute";
import { RouteFallback } from "@/components/layout/RouteFallback";

// Public
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Signup = lazy(() => import("@/pages/auth/Signup"));
const VerifyCertificate = lazy(() => import("@/pages/public/VerifyCertificate"));
const VerifyWebinarRegistration = lazy(() => import("@/pages/public/VerifyWebinarRegistration"));
const WebinarListing = lazy(() => import("@/pages/WebinarListing"));
const WebinarDetail = lazy(() => import("@/pages/WebinarDetail"));
const WebinarRegister = lazy(() => import("@/pages/WebinarRegister"));
const CoursesListing = lazy(() => import("@/pages/public/CoursesListing"));
const PublicCourseDetails = lazy(() => import("@/pages/public/CourseDetailPublic"));
const BlogListing = lazy(() => import("@/pages/public/BlogListing"));
const BlogDetail = lazy(() => import("@/pages/public/BlogDetail"));
const ChangePasswordPage = lazy(() => import("@/pages/account/ChangePassword"));

// Admin
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminCourses = lazy(() => import("@/pages/admin/Courses"));
const CourseCreate = lazy(() => import("@/pages/admin/CourseCreate"));
const CourseEdit = lazy(() => import("@/pages/admin/CourseEdit"));
const AdminBatches = lazy(() => import("@/pages/admin/Batches"));
const BatchCreate = lazy(() => import("@/pages/admin/BatchCreate"));
const BatchDetail = lazy(() => import("@/pages/admin/BatchDetail"));
const AdminInstructors = lazy(() => import("@/pages/admin/Instructors"));
const AdminStudents = lazy(() => import("@/pages/admin/Students"));
const StudentDetail = lazy(() => import("@/pages/admin/StudentDetail"));
const AdminEnrollments = lazy(() => import("@/pages/admin/Enrollments"));
const BatchOps = lazy(() => import("@/pages/admin/BatchOps"));
const AdminCertificates = lazy(() => import("@/pages/admin/Certificates"));
const AdminPayments = lazy(() => import("@/pages/admin/Payments"));
const PaymentSettings = lazy(() => import("@/pages/admin/PaymentSettings"));
const AdminCatalogue = lazy(() => import("@/pages/admin/Catalogue"));
const AdminWebinars = lazy(() => import("@/pages/admin/Webinars"));
const WebinarForm = lazy(() => import("@/pages/admin/WebinarForm"));
const WebinarDetailAdmin = lazy(() => import("@/pages/admin/WebinarDetailAdmin"));
const AdminBlogs = lazy(() => import("@/pages/admin/Blogs"));
const BlogForm = lazy(() => import("@/pages/admin/BlogForm"));

// Student
const StudentProfile = lazy(() => import("@/pages/student/Profile"));
const ExploreCatalogue = lazy(() => import("@/pages/student/explore/ExploreCatalogue"));
const CourseDetails = lazy(() => import("@/pages/student/explore/CourseDetails"));
const MyCourses = lazy(() => import("@/pages/student/MyCourses"));
const BatchWorkspace = lazy(() => import("@/pages/student/BatchWorkspace"));
const SelfPacedCourse = lazy(() => import("@/pages/student/SelfPacedCourse"));

// Instructor
const InstructorDashboard = lazy(() => import("@/pages/instructor/Dashboard"));
const AssignedBatches = lazy(() => import("@/pages/instructor/AssignedBatches"));
const CoursePlan = lazy(() => import("@/pages/instructor/CoursePlan"));
const SessionsResources = lazy(() => import("@/pages/instructor/SessionsResources"));
const CreateAssignmentPage = lazy(() => import("@/pages/instructor/CreateAssignment"));
const AttendancePage = lazy(() => import("@/pages/instructor/Attendance"));
const GradingPage = lazy(() => import("@/pages/instructor/Grading"));
const CompletionPage = lazy(() => import("@/pages/instructor/Completion"));

export default function App() {
  return (
    // Top-level boundary catches layout-less lazy routes (verify pages, change-password).
    // Routes nested in a layout resolve at the layout's own Suspense, so chrome never flashes.
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="courses" element={<CoursesListing />} />
          <Route path="courses/:courseId" element={<PublicCourseDetails />} />
          <Route path="blog" element={<BlogListing />} />
          <Route path="blog/:slug" element={<BlogDetail />} />
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
            <Route path="blog" element={<AdminBlogs />} />
            <Route path="blog/create" element={<BlogForm />} />
            <Route path="blog/:id/edit" element={<BlogForm />} />
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
            <Route path="my-courses" element={<MyCourses />} />
            <Route path="my-courses/:batchId" element={<BatchWorkspace />} />
            <Route path="dashboard" element={<Navigate to="/portal/my-courses" replace />} />
          </Route>
          {/* Self-paced viewer keeps its own full-screen chrome, outside the portal layout. */}
          <Route path="portal/courses/:batchId" element={<SelfPacedCourse />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
