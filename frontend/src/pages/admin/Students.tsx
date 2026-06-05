import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { extractErrorMessage } from "@/lib/api";
import { createStudent, listStudents, StudentDTO } from "@/services/admin.service";

export default function AdminStudents() {
  const [items, setItems] = useState<StudentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await listStudents({ search });
      setItems(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Students</h1>
          <p className="text-body-sm text-ink-variant">Manage learner accounts</p>
        </div>
        <Button leftIcon="person_add" onClick={() => setCreateOpen(true)}>Add Student</Button>
      </div>

      <Input placeholder="Search by email" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon="search" containerClassName="max-w-sm" />

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No students yet" icon="school" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Phone</TH>
              <TH>City</TH>
              <TH>Profile</TH>
              <TH>Enrollments</TH>
              <TH>Joined</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {items.map((u: any) => (
              <TR key={u.user_id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.display_name} src={u.avatar_url} size="sm" />
                    <Link to={`/admin/users/students/${u.user_id}`} className="font-medium hover:text-primary">{u.display_name}</Link>
                  </div>
                </TD>
                <TD className="text-ink-variant">{u.email}</TD>
                <TD>{u.phone || "—"}</TD>
                <TD>{u.city || "—"}</TD>
                <TD><Badge tone={u.profile_complete ? "success" : "warning"}>{u.profile_complete ? "Complete" : "Incomplete"}</Badge></TD>
                <TD>{u.enrollments_count ?? 0}</TD>
                <TD>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</TD>
                <TD>
                  <Link to={`/admin/users/students/${u.user_id}`}>
                    <Button size="sm" variant="ghost" leftIcon="visibility">View</Button>
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <CreateStudentModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); fetchData(); }} />
    </div>
  );
}

function CreateStudentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [batchName, setBatchName] = useState("");
  const [instructorName, setInstructorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearErr = (field: string) => setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });

  function validate(): boolean {
    const e: Record<string, string> = {};
    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      e.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      e.email = "Enter a valid email address";
    }
    if (!name.trim()) e.display_name = "Display name is required";
    if (!password) {
      e.password = "Password is required";
    } else if (password.length < 8) {
      e.password = "Password must be at least 8 characters";
    }
    const phoneTrimmed = phone.trim();
    if (!phoneTrimmed) {
      e.phone = "Phone number is required";
    } else if (!/^[0-9+\-\s()]{7,20}$/.test(phoneTrimmed)) {
      e.phone = "Enter a valid phone number";
    }
    if (!city.trim()) e.city = "City is required";
    if (!batchName.trim()) e.batchName = "Batch name is required";
    if (!instructorName.trim()) e.instructorName = "Instructor name is required";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = Object.values(e)[0];
      toast.error(first);
    }
    return Object.keys(e).length === 0;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await createStudent({
        email: email.trim(),
        display_name: name.trim(),
        password,
        phone: phone.trim(),
        city: city.trim(),
        batch_name: batchName.trim(),
        instructor_name: instructorName.trim(),
      });
      if (res.email_sent === false) {
        toast(
          res.warning || `Student created, but the welcome email could not be sent. Share the credentials manually (email: ${email.trim()}).`,
          { icon: "⚠️", duration: 6000 }
        );
      } else {
        toast.success("Student created — welcome email sent");
      }
      setEmail(""); setName(""); setPassword(""); setPhone(""); setCity(""); setBatchName(""); setInstructorName("");
      setErrors({});
      onCreated();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Student" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={(e) => submit(e as any)} loading={submitting}>Create & Send Welcome Email</Button>
      </>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearErr("email"); }}
          leftIcon="mail"
          error={errors.email}
        />
        <Input
          label="Display name"
          value={name}
          onChange={(e) => { setName(e.target.value); clearErr("display_name"); }}
          leftIcon="person"
          error={errors.display_name}
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); clearErr("password"); }}
          hint="Min 8 characters"
          error={errors.password}
        />
        <Input label="Phone" value={phone} onChange={(e) => { setPhone(e.target.value); clearErr("phone"); }} leftIcon="phone" error={errors.phone} />
        <Input label="City" value={city} onChange={(e) => { setCity(e.target.value); clearErr("city"); }} leftIcon="location_on" error={errors.city} />
        <div className="border-t border-ink-outlineVariant/40 pt-3">
          <p className="text-label text-ink-outline mb-2">For welcome email</p>
          <div className="space-y-3">
            <Input label="Batch name" value={batchName} onChange={(e) => { setBatchName(e.target.value); clearErr("batchName"); }} leftIcon="groups" placeholder="e.g. Full-Stack Batch 2025" error={errors.batchName} />
            <Input label="Instructor name" value={instructorName} onChange={(e) => { setInstructorName(e.target.value); clearErr("instructorName"); }} leftIcon="school" placeholder="e.g. Rahul Sharma" error={errors.instructorName} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
