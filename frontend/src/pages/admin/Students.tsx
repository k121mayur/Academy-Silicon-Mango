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
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createStudent({ email: email.trim(), display_name: name.trim(), password, phone: phone || undefined, city: city || undefined });
      toast.success("Student created");
      setEmail(""); setName(""); setPassword(""); setPhone(""); setCity("");
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
        <Button onClick={(e) => submit(e as any)} loading={submitting}>Create</Button>
      </>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required leftIcon="mail" />
        <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} required leftIcon="person" />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required hint="Min 8 characters" />
        <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} leftIcon="phone" />
        <Input label="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} leftIcon="location_on" />
      </form>
    </Modal>
  );
}
