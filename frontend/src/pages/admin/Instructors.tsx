import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { extractErrorMessage } from "@/lib/api";
import { createInstructor, deleteInstructor, listInstructors, updateInstructor, InstructorDTO } from "@/services/admin.service";

export default function AdminInstructors() {
  const [items, setItems] = useState<InstructorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string; emailSent: boolean } | null>(null);
  const [editTarget, setEditTarget] = useState<InstructorDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InstructorDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await listInstructors({ search });
      setItems(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [search]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInstructor(deleteTarget.user_id);
      toast.success("Instructor removed");
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Instructors</h1>
          <p className="text-body-sm text-ink-variant">Manage your teaching team</p>
        </div>
        <Button leftIcon="person_add" onClick={() => setCreateOpen(true)}>Add Instructor</Button>
      </div>

      <Input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon="search" containerClassName="max-w-sm" />

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No instructors" icon="psychology" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Skills</TH>
              <TH>Status</TH>
              <TH>Joined</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {items.map((u) => (
              <TR key={u.user_id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.display_name} src={u.avatar_url} size="sm" />
                    <span className="font-medium">{u.display_name}</span>
                  </div>
                </TD>
                <TD className="text-ink-variant">{u.email}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {(u.skills || []).slice(0, 3).map((s, i) => <Badge key={i} tone="neutral">{s}</Badge>)}
                    {u.skills && u.skills.length > 3 && <Badge tone="neutral">+{u.skills.length - 3}</Badge>}
                  </div>
                </TD>
                <TD><Badge tone={u.is_active ? "success" : "danger"}>{u.is_active ? "Active" : "Inactive"}</Badge></TD>
                <TD>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" leftIcon="edit" title="Edit instructor" onClick={() => setEditTarget(u)} />
                    <Button size="sm" variant="ghost" leftIcon="delete" title="Remove instructor" className="text-danger" onClick={() => setDeleteTarget(u)} />
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <CreateInstructorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(payload) => {
          setCreated(payload);
          setCreateOpen(false);
          fetchData();
        }}
      />

      <Modal open={!!created} onClose={() => setCreated(null)} title="Instructor account created" size="sm">
        <p className="text-body-sm text-ink-variant mb-3">
          {created?.emailSent
            ? "A welcome email has been sent. Save these credentials:"
            : "⚠️ The welcome email could NOT be sent. Share these credentials with the instructor manually, and ask your administrator to fix the server's email settings:"}
        </p>
        <div className="bg-surface-containerLow rounded-xl p-3 space-y-2">
          <p className="text-label text-ink-outline">Email</p>
          <p className="font-mono text-body-sm">{created?.email}</p>
          <p className="text-label text-ink-outline mt-2">Temporary password</p>
          <p className="font-mono text-body-sm">{created?.password}</p>
        </div>
        <Button className="mt-4" fullWidth onClick={() => setCreated(null)}>Done</Button>
      </Modal>

      <EditInstructorModal
        instructor={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); fetchData(); }}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Remove ${deleteTarget?.display_name || "instructor"}?`}
        description="This permanently deletes the instructor's account. Batches they teach will be left without an assigned instructor. This cannot be undone."
        confirmLabel="Remove instructor"
        destructive
        loading={deleting}
      />
    </div>
  );
}

function EditInstructorModal({ instructor, onClose, onSaved }: { instructor: InstructorDTO | null; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [active, setActive] = useState("true");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearErr = (field: string) => setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });

  useEffect(() => {
    if (!instructor) return;
    setEmail(instructor.email);
    setName(instructor.display_name);
    setBio(instructor.bio || "");
    setSkills((instructor.skills || []).join(", "));
    setActive(instructor.is_active ? "true" : "false");
    setErrors({});
  }, [instructor]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      e.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      e.email = "Enter a valid email address";
    }
    if (!name.trim()) e.display_name = "Display name is required";
    const skillsList = skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (skillsList.length === 0) e.skills = "At least one skill is required";
    setErrors(e);
    if (Object.keys(e).length > 0) toast.error(Object.values(e)[0]);
    return Object.keys(e).length === 0;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!instructor || !validate()) return;
    setSubmitting(true);
    try {
      await updateInstructor(instructor.user_id, {
        email: email.trim(),
        display_name: name.trim(),
        bio: bio.trim() || null,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        is_active: active === "true",
      });
      toast.success("Instructor updated");
      onSaved();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!instructor} onClose={onClose} title="Edit Instructor" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={(e) => submit(e as any)} loading={submitting}>Save changes</Button>
      </>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearErr("email"); }} leftIcon="mail" error={errors.email} />
        <Input label="Display name" value={name} onChange={(e) => { setName(e.target.value); clearErr("display_name"); }} leftIcon="person" error={errors.display_name} />
        <Textarea label="Bio (optional)" value={bio} onChange={(e) => setBio(e.target.value)} rows={2} />
        <Input label="Skills (comma-separated)" value={skills} onChange={(e) => { setSkills(e.target.value); clearErr("skills"); }} placeholder="Python, ML, Data Science" error={errors.skills} />
        <Select
          label="Status"
          value={active}
          onChange={(e) => setActive(e.target.value)}
          options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]}
        />
      </form>
    </Modal>
  );
}

function CreateInstructorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: { email: string; password: string; emailSent: boolean }) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [password, setPassword] = useState("");
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
    const skillsList = skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (skillsList.length === 0) e.skills = "At least one skill is required";
    if (!password) {
      e.password = "Password is required";
    } else if (password.length < 8) {
      e.password = "Password must be at least 8 characters";
    }
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
      const res = await createInstructor({
        email: email.trim(),
        display_name: name.trim(),
        bio,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        password,
      });
      if (res.email_sent === false) {
        toast(res.warning || "Instructor created, but the welcome email could not be sent.", { icon: "⚠️", duration: 6000 });
      } else {
        toast.success("Instructor created");
      }
      onCreated({ email: res.email, password: res.temporary_password || password, emailSent: res.email_sent !== false });
      setEmail(""); setName(""); setBio(""); setSkills(""); setPassword(""); setErrors({});
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Instructor" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={(e) => submit(e as any)} loading={submitting}>Create</Button>
      </>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearErr("email"); }} leftIcon="mail" error={errors.email} />
        <Input label="Display name" value={name} onChange={(e) => { setName(e.target.value); clearErr("display_name"); }} leftIcon="person" error={errors.display_name} />
        <Textarea label="Bio (optional)" value={bio} onChange={(e) => setBio(e.target.value)} rows={2} />
        <Input label="Skills (comma-separated)" value={skills} onChange={(e) => { setSkills(e.target.value); clearErr("skills"); }} placeholder="Python, ML, Data Science" error={errors.skills} />
        <Input label="Password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); clearErr("password"); }} hint="Min 8 characters" error={errors.password} />
      </form>
    </Modal>
  );
}
