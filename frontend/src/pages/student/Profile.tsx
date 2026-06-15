import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { queryClient } from "@/lib/queryClient";
import { qk } from "@/lib/queryKeys";
import { extractErrorMessage } from "@/lib/api";
import { ROUTES } from "@/router/routes";
import type { AuthUser } from "@/types/auth";
import {
  fetchProfile,
  updateProfile,
  type EducationEntry,
  type ExperienceEntry,
  type ProfileUpdate,
} from "@/services/student.service";

const YEARS: string[] = (() => {
  const start = 2030;
  const list: string[] = ["Pursuing"];
  for (let y = start; y >= 1975; y--) list.push(String(y));
  return list;
})();

const emptyEducation = (): EducationEntry => ({
  qualification: "",
  institution: "",
  field_of_study: "",
  completion_year: "",
});
const emptyExperience = (): ExperienceEntry => ({ organisation: "", post: "", description: "" });

interface FormState {
  first_name: string;
  middle_name: string;
  last_name: string;
  mobile: string;
  city: string;
  occupation: "student" | "employee";
  education: EducationEntry[];
  experience: ExperienceEntry[];
}

const EMPTY_FORM: FormState = {
  first_name: "",
  middle_name: "",
  last_name: "",
  mobile: "",
  city: "",
  occupation: "student",
  education: [emptyEducation()],
  experience: [],
};

export default function StudentProfile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.student.profile(),
    queryFn: fetchProfile,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        first_name: data.first_name ?? "",
        middle_name: data.middle_name ?? "",
        last_name: data.last_name ?? "",
        mobile: data.mobile ?? "",
        city: data.city ?? "",
        occupation: (data.occupation as "student" | "employee") ?? "student",
        education: data.education?.length ? data.education : [emptyEducation()],
        experience: data.experience ?? [],
      });
    }
  }, [data]);

  const patch = (p: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
  };

  const setOccupation = (occ: "student" | "employee") =>
    patch({
      occupation: occ,
      experience: occ === "employee" && form.experience.length === 0 ? [emptyExperience()] : form.experience,
    });

  // ----- Education list helpers -----
  const updateEducation = (i: number, p: Partial<EducationEntry>) =>
    patch({ education: form.education.map((e, idx) => (idx === i ? { ...e, ...p } : e)) });
  const addEducation = () => patch({ education: [...form.education, emptyEducation()] });
  const removeEducation = (i: number) =>
    patch({ education: form.education.filter((_, idx) => idx !== i) });

  // ----- Experience list helpers -----
  const updateExperience = (i: number, p: Partial<ExperienceEntry>) =>
    patch({ experience: form.experience.map((e, idx) => (idx === i ? { ...e, ...p } : e)) });
  const addExperience = () => patch({ experience: [...form.experience, emptyExperience()] });
  const removeExperience = (i: number) =>
    patch({ experience: form.experience.filter((_, idx) => idx !== i) });

  // ----- Completeness meter -----
  const completeness = useMemo(() => {
    let total = 4; // first, last, mobile, city
    let done = 0;
    if (form.first_name.trim()) done++;
    if (form.last_name.trim()) done++;
    if (/^[6-9]\d{9}$/.test(form.mobile)) done++;
    if (form.city.trim()) done++;
    const edu = form.education[0];
    total += 1;
    if (edu && edu.qualification && edu.institution && edu.field_of_study && edu.completion_year) done++;
    if (form.occupation === "employee") {
      total += 1;
      const exp = form.experience[0];
      if (exp && exp.organisation && exp.post) done++;
    }
    return Math.round((done / total) * 100);
  }, [form]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.first_name.trim()) e.first_name = "First name is required";
    if (!form.last_name.trim()) e.last_name = "Last name is required";
    if (!/^[6-9]\d{9}$/.test(form.mobile)) e.mobile = "Enter a valid 10-digit mobile number";
    if (!form.city.trim()) e.city = "City is required";

    form.education.forEach((edu, i) => {
      if (!edu.qualification.trim()) e[`edu_${i}_qualification`] = "Required";
      if (!edu.institution.trim()) e[`edu_${i}_institution`] = "Required";
      if (!edu.field_of_study.trim()) e[`edu_${i}_field`] = "Required";
      if (!edu.completion_year.trim()) e[`edu_${i}_year`] = "Required";
    });

    if (form.occupation === "employee") {
      const filled = form.experience.filter((x) => x.organisation.trim() || x.post.trim());
      if (filled.length === 0) e.experience = "Add at least one work experience";
      form.experience.forEach((exp, i) => {
        if (exp.organisation.trim() || exp.post.trim()) {
          if (!exp.organisation.trim()) e[`exp_${i}_org`] = "Required";
          if (!exp.post.trim()) e[`exp_${i}_post`] = "Required";
        }
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const mutation = useMutation({
    mutationFn: (payload: ProfileUpdate) => updateProfile(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.student.profile(), updated);
      const wasIncomplete = !user?.profile_complete;
      if (user) {
        setUser({
          ...(user as AuthUser),
          display_name: updated.display_name ?? user.display_name,
          profile_complete: updated.profile_complete,
        });
      }
      setDirty(false);
      toast.success("Profile saved");
      if (wasIncomplete && updated.profile_complete) {
        navigate(ROUTES.student.myCourses);
      }
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const onSave = () => {
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      const firstError = document.querySelector("[data-error='true']");
      firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const payload: ProfileUpdate = {
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: form.last_name.trim(),
      mobile: form.mobile.trim(),
      city: form.city.trim(),
      occupation: form.occupation,
      education: form.education,
      experience:
        form.occupation === "employee"
          ? form.experience.filter((x) => x.organisation.trim() || x.post.trim())
          : [],
    };
    mutation.mutate(payload);
  };

  if (isError) {
    return (
      <div className="max-w-3xl mx-auto">
        <QueryErrorState error={error} onRetry={() => refetch()} title="Couldn't load your profile" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-28">
      <div className="animate-slide-up">
        <h1 className="font-display font-bold text-display-md text-ink">Your profile</h1>
        <p className="text-body-sm text-ink-variant">
          {user?.profile_complete
            ? "Keep your details up to date — they appear on your certificates."
            : "Complete your profile so we can personalise course recommendations and enrolment."}
        </p>
      </div>

      {/* Completeness meter */}
      <div className="animate-slide-up" style={{ animationDelay: "40ms" }}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-label text-ink-variant font-medium">Profile completeness</p>
          <p className="text-label font-semibold text-primary">{completeness}%</p>
        </div>
        <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              completeness === 100 ? "bg-success" : "bg-primary-fill"
            }`}
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      {isLoading ? (
        <ProfileSkeleton />
      ) : (
        <Card className="animate-slide-up" style={{ animationDelay: "80ms" }}>
          <CardBody className="space-y-8">
            {/* Personal */}
            <section className="space-y-4">
              <SectionTitle icon="badge" title="Personal details" />
              <div className="grid sm:grid-cols-3 gap-3">
                <div data-error={!!errors.first_name}>
                  <Input
                    label="First name *"
                    value={form.first_name}
                    onChange={(e) => patch({ first_name: e.target.value })}
                    error={errors.first_name}
                    placeholder="Asha"
                  />
                </div>
                <Input
                  label="Middle name"
                  value={form.middle_name}
                  onChange={(e) => patch({ middle_name: e.target.value })}
                  placeholder="(optional)"
                />
                <div data-error={!!errors.last_name}>
                  <Input
                    label="Last name *"
                    value={form.last_name}
                    onChange={(e) => patch({ last_name: e.target.value })}
                    error={errors.last_name}
                    placeholder="Sharma"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {/* Mobile with +91 chip */}
                <div className="flex flex-col gap-1.5" data-error={!!errors.mobile}>
                  <label className="text-label text-ink-variant font-medium">Mobile number *</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 h-10 rounded-l-md bg-surface-container border border-r-0 border-ink-outlineVariant text-body-sm text-ink-variant font-medium">
                      +91
                    </span>
                    <input
                      value={form.mobile}
                      inputMode="numeric"
                      maxLength={10}
                      onChange={(e) => patch({ mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                      placeholder="98765 43210"
                      className={`flex-1 h-10 rounded-r-md bg-surface-lowest border text-body-sm text-ink px-3 focus:outline-none focus:ring-4 ${
                        errors.mobile
                          ? "border-danger focus:ring-danger/10"
                          : "border-ink-outlineVariant focus:border-primary focus:ring-primary-container/30"
                      }`}
                    />
                  </div>
                  {errors.mobile && (
                    <p className="text-label text-danger flex items-center gap-1">
                      <span className="icon text-[14px]">error</span>
                      {errors.mobile}
                    </p>
                  )}
                </div>

                <div data-error={!!errors.city}>
                  <Input
                    label="City *"
                    value={form.city}
                    onChange={(e) => patch({ city: e.target.value })}
                    error={errors.city}
                    leftIcon="location_city"
                    placeholder="Pune"
                  />
                </div>
              </div>

              {/* Occupation segmented control */}
              <div>
                <label className="text-label text-ink-variant font-medium">I am a *</label>
                <div className="mt-1.5 inline-flex bg-surface-container rounded-xl p-1">
                  {(["student", "employee"] as const).map((occ) => (
                    <button
                      key={occ}
                      type="button"
                      onClick={() => setOccupation(occ)}
                      className={`px-5 h-9 rounded-lg text-body-sm font-medium capitalize transition-all ${
                        form.occupation === occ
                          ? "bg-surface-lowest shadow-sm text-primary"
                          : "text-ink-variant hover:text-ink"
                      }`}
                    >
                      {occ}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Education */}
            <section className="space-y-3">
              <SectionTitle icon="school" title="Education" hint="At least one entry" />
              {form.education.map((edu, i) => (
                <div
                  key={i}
                  className="bg-surface-containerLow rounded-xl p-4 space-y-3 border border-ink-outlineVariant/30 animate-slide-up"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-label text-ink-outline font-semibold uppercase tracking-wide">
                      Education {i + 1}
                    </p>
                    {form.education.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEducation(i)}
                        className="text-ink-outline hover:text-danger flex items-center gap-1 text-label"
                      >
                        <span className="icon text-[16px]">delete</span> Remove
                      </button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div data-error={!!errors[`edu_${i}_qualification`]}>
                      <Input
                        label="Qualification *"
                        value={edu.qualification}
                        onChange={(e) => updateEducation(i, { qualification: e.target.value })}
                        error={errors[`edu_${i}_qualification`]}
                        placeholder="B.Tech"
                      />
                    </div>
                    <div data-error={!!errors[`edu_${i}_institution`]}>
                      <Input
                        label="Institution *"
                        value={edu.institution}
                        onChange={(e) => updateEducation(i, { institution: e.target.value })}
                        error={errors[`edu_${i}_institution`]}
                        placeholder="University name"
                      />
                    </div>
                    <div data-error={!!errors[`edu_${i}_field`]}>
                      <Input
                        label="Field of study *"
                        value={edu.field_of_study}
                        onChange={(e) => updateEducation(i, { field_of_study: e.target.value })}
                        error={errors[`edu_${i}_field`]}
                        placeholder="Computer Science"
                      />
                    </div>
                    <div data-error={!!errors[`edu_${i}_year`]}>
                      <Select
                        label="Completion year *"
                        value={edu.completion_year}
                        onChange={(e) => updateEducation(i, { completion_year: e.target.value })}
                        error={errors[`edu_${i}_year`]}
                        options={[{ value: "", label: "Select year" }, ...YEARS.map((y) => ({ value: y, label: y }))]}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" leftIcon="add" fullWidth onClick={addEducation}>
                Add education
              </Button>
            </section>

            {/* Experience (employees only) */}
            {form.occupation === "employee" && (
              <section className="space-y-3 animate-slide-up">
                <SectionTitle icon="work" title="Work experience" hint="Required for employees" />
                {errors.experience && (
                  <p className="text-label text-danger flex items-center gap-1">
                    <span className="icon text-[14px]">error</span>
                    {errors.experience}
                  </p>
                )}
                {form.experience.map((exp, i) => (
                  <div
                    key={i}
                    className="bg-surface-containerLow rounded-xl p-4 space-y-3 border border-ink-outlineVariant/30 animate-slide-up"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-label text-ink-outline font-semibold uppercase tracking-wide">
                        Experience {i + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeExperience(i)}
                        className="text-ink-outline hover:text-danger flex items-center gap-1 text-label"
                      >
                        <span className="icon text-[16px]">delete</span> Remove
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div data-error={!!errors[`exp_${i}_org`]}>
                        <Input
                          label="Organisation *"
                          value={exp.organisation}
                          onChange={(e) => updateExperience(i, { organisation: e.target.value })}
                          error={errors[`exp_${i}_org`]}
                          placeholder="Company name"
                        />
                      </div>
                      <div data-error={!!errors[`exp_${i}_post`]}>
                        <Input
                          label="Post *"
                          value={exp.post}
                          onChange={(e) => updateExperience(i, { post: e.target.value })}
                          error={errors[`exp_${i}_post`]}
                          placeholder="Software Engineer"
                        />
                      </div>
                    </div>
                    <Input
                      label="Description"
                      value={exp.description ?? ""}
                      onChange={(e) => updateExperience(i, { description: e.target.value })}
                      placeholder="(optional) what you worked on"
                    />
                  </div>
                ))}
                <Button variant="outline" leftIcon="add" fullWidth onClick={addExperience}>
                  Add experience
                </Button>
              </section>
            )}
          </CardBody>
        </Card>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-surface-lowest/90 backdrop-blur border-t border-ink-outlineVariant/40 p-3 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-1">
          <p className="text-label text-ink-outline hidden sm:block">
            {user?.profile_complete ? "Edit and save anytime." : "Save to unlock courses."}
          </p>
          <Button
            onClick={onSave}
            loading={mutation.isPending}
            disabled={!dirty && !!user?.profile_complete}
            leftIcon="check"
            className="ml-auto"
          >
            Save profile
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="icon text-primary text-[20px]">{icon}</span>
      <h2 className="text-title-md font-semibold text-ink">{title}</h2>
      {hint && <span className="text-label text-ink-outline">· {hint}</span>}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <Card>
      <CardBody className="space-y-6 animate-pulse">
        <div className="h-5 w-40 bg-surface-container rounded" />
        <div className="grid sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-container rounded-md" />
          ))}
        </div>
        <div className="h-24 bg-surface-container rounded-xl" />
        <div className="h-24 bg-surface-container rounded-xl" />
      </CardBody>
    </Card>
  );
}
