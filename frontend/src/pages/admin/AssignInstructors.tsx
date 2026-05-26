import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import {
  assignCourseInstructor,
  listCourseInstructors,
  listCourses,
  listInstructors,
  removeCourseInstructor,
} from "@/services/admin.service";

export default function AssignInstructors() {
  const [courses, setCourses] = useState<any[]>([]);
  const [allInstructors, setAllInstructors] = useState<any[]>([]);
  const [courseId, setCourseId] = useState("");
  const [assigned, setAssigned] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    listCourses({ limit: 100 }).then((r) => setCourses(r.data));
    listInstructors({ limit: 100 }).then((r) => setAllInstructors(r.data));
  }, []);

  useEffect(() => {
    if (!courseId) {
      setAssigned([]);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const refresh = async () => {
    if (!courseId) return;
    try {
      const list = await listCourseInstructors(courseId);
      setAssigned(list);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const onAssign = async (instructorUserId: string) => {
    if (!courseId) return;
    try {
      await assignCourseInstructor(courseId, instructorUserId);
      toast.success("Assigned");
      refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const onRemove = async (userId: string) => {
    if (!courseId) return;
    try {
      await removeCourseInstructor(courseId, userId);
      toast.success("Removed");
      refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const assignedUserIds = new Set(assigned.map((a) => a.user_id));
  const candidates = allInstructors
    .filter((i) => !assignedUserIds.has(i.user_id))
    .filter((i) => !search || i.email.toLowerCase().includes(search.toLowerCase()) || i.display_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Assign Instructors</h1>
        <p className="text-body-sm text-ink-variant">Link instructors to courses so they can be assigned to batches</p>
      </div>

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Pick a course</p></CardHeader>
        <CardBody>
          <Select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            options={[{ value: "", label: "Select a course" }, ...courses.map((c) => ({ value: c.id, label: c.title }))]}
          />
        </CardBody>
      </Card>

      {courseId && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><p className="text-title-md font-semibold">Currently assigned</p></CardHeader>
            <CardBody className="space-y-2">
              {assigned.length === 0 ? (
                <p className="text-body-sm text-ink-outline">No instructors assigned yet</p>
              ) : (
                assigned.map((i) => (
                  <div key={i.user_id} className="flex items-center justify-between bg-surface-containerLow rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={i.display_name} src={i.avatar_url} size="sm" />
                      <div>
                        <p className="text-body-sm font-medium">{i.display_name}</p>
                        <p className="text-label text-ink-outline">{i.email}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" leftIcon="close" onClick={() => onRemove(i.user_id)} className="text-danger" />
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><p className="text-title-md font-semibold">Add an instructor</p></CardHeader>
            <CardBody className="space-y-3">
              <Input placeholder="Search instructors" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon="search" />
              {candidates.length === 0 ? (
                <p className="text-body-sm text-ink-outline">No matches</p>
              ) : (
                candidates.slice(0, 10).map((i) => (
                  <div key={i.user_id} className="flex items-center justify-between bg-surface-containerLow rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={i.display_name} src={i.avatar_url} size="sm" />
                      <div>
                        <p className="text-body-sm font-medium">{i.display_name}</p>
                        <p className="text-label text-ink-outline">{i.email}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" leftIcon="add" onClick={() => onAssign(i.user_id)}>Assign</Button>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
