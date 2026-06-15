import CourseDetails from "@/pages/student/explore/CourseDetails";

/**
 * Public wrapper around the course detail view. The same component powers the
 * logged-in student portal (where the layout supplies padding); on the public
 * site it needs its own page container. Enrolment behaviour inside CourseDetails
 * is auth-aware — logged-out visitors are prompted to sign in / sign up.
 */
export default function CourseDetailPublic() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <CourseDetails />
    </div>
  );
}
