# Instructor Flow & Functionality

This document describes the Instructor role in the platform from a pure product/flow perspective. It is meant to be re-implemented as-is in another project. No technical/implementation details — only screens, fields, actions, and rules.

The Instructor is the **teaching role**. The instructor doesn't create courses or batches and doesn't enrol students — the admin does that. The instructor is given batches to teach and runs everything inside those batches: sessions, resources, attendance, assignments, grading, and batch completion.

---

## 1. Instructor login & onboarding

- Instructors are **never** self-signup. An admin creates each instructor account with email, default password, and skills.
- Login is via the shared landing page (email + password). The role on the account routes to the **Instructor Panel** automatically.
- On first login, the dashboard may be **empty** — the instructor will only see batches once the admin has:
  1. Assigned them to a course.
  2. Assigned them to a specific batch of that course.
- An empty dashboard shows an explanation that batches will appear once the admin assigns them.

---

## 2. Instructor sidebar (8 sections)

The instructor panel uses a left sidebar with these sections, in this order:

1. Dashboard
2. Assigned Batches
3. Create Assignment
4. Course Plan
5. Sessions & Resources
6. Attendance
7. Submissions & Grading
8. Completion

Each section is described in detail below.

---

## 3. Dashboard

The landing page of the instructor panel. Pure overview.

**Summary cards:**

- **Assigned Batches** — count of batches currently assigned to this instructor.
- **Students** — unique student count across all assigned batches.
- **Active Sessions** — total session count across all assigned batches.
- **Pending Grading** — number of submissions in "submitted" status (awaiting grading).

**Below the summary:**

- List of active batches.
- List of completed batches.
- The 5 most recent batches as cards with quick links.

A "View Batches" shortcut button is on the title bar.

---

## 4. Assigned Batches

A list/picker of every batch the instructor is assigned to. Selecting one makes it the **current batch** for all the other sections (Course Plan, Sessions, Attendance, Grading, Completion).

**Each batch card shows:**

- Course name and batch number
- Delivery mode — Live or Recorded
- Date range (start → end)
- Schedule slots
- Number of enrolled students
- Number of sessions
- Number of assignments
- Certificate issue status

The selected batch persists across the other sidebar sections so the instructor doesn't have to re-pick it on every screen.

---

## 5. Create Assignment

A form to add an assignment within the **currently selected batch**.

**Fields:**

- **Week number** (or day number, for day-based courses) — picks where the assignment sits in the plan.
- **Linked session** (optional) — attach the assignment to a specific session in that week/day.
- **Title**
- **Description**
- **Assignment type** — one of:
  - **Quiz**
  - **PDF upload** (student uploads a PDF)
  - **Text upload** (student types/uploads text)
  - **File upload** (any file type)
  - **Link submission** (student submits a URL)
- **Due date/time** (optional)
- **Max points** (optional)
- **Allow late submission** — yes/no
- **Resource URL** (optional) — the brief/spec the student should read before submitting.

**Behavior on submit:**

- Assignment is created against the batch.
- It appears in the instructor's grading workspace as soon as submissions arrive.
- It appears in the student's **My Courses** view of that batch.

---

## 6. Course Plan

Read-only view of the inherited week/day plan for the selected batch.

**What it shows:**

- Every week (or day) in the plan with its title and summary.
- The sessions placed on those dates.
- The assignments tied to that week/day.

**Notes:**

- The plan structure itself is owned by the admin (edited in **Batch Operations**). Instructors don't edit week/day titles here.
- This is the orientation view — "what am I teaching, and when".

---

## 7. Sessions & Resources

The instructor's main day-to-day workspace.

### 7.1 Inherited sessions (auto-created from the plan)

For every existing inherited session, the instructor can:

- Edit **title** and **description**
- Edit **date**, **start time**, **end time**
- Add a **meeting URL** (Zoom / Google Meet / etc.) for live sessions
- Add a **recording URL** for recorded sessions
- Change **status** — Scheduled / Completed / Cancelled
- Save changes

**Important rule:** Saving a session edit triggers an **email notification to all enrolled students** about the change. This is automatic.

### 7.2 Create a manual session

In addition to inherited sessions, the instructor can add their own.

**Fields:**

- Week/day
- Title
- Description
- Date, start time, end time
- Meeting URL (live) or Recording URL (recorded)
- (Optional) One or more **resources** attached to the same form — file or URL with a title and resource type (attachment, video, link, etc.)

### 7.3 Upload resources to any existing session

For any session (inherited or manual):

- Upload a **file** (PDF, slides, video, etc.) or paste a **URL**.
- Set a **title** and **resource type**.
- Resource appears under that session and becomes visible to enrolled students.

### 7.4 Delete a session

- Manual sessions can be deleted outright.
- Inherited sessions are usually **cancelled** (status change) rather than deleted.

---

## 8. Attendance

Used to record presence for live sessions.

**Rules:**

- Attendance is only available for **live** sessions. Recorded sessions have no attendance UI.

**Flow:**

1. Pick a session within the current batch.
2. For every enrolled student, set status — one of:
   - **Present**
   - **Absent**
   - **Late**
   - **Excused**
   - **Not marked** (default)
3. Optionally add a **note** per student.
4. Save attendance — the entire list is saved in one shot.

---

## 9. Submissions & Grading

The grading workspace. A list of every student submission for every assignment in the current batch.

**For each submission, the instructor sees:**

- Student name
- The submitted artefact (file, link, or text)
- Submission timestamp + on-time / late flag

**For each submission, the instructor can:**

- Enter a **score** (must fit within the assignment's max points)
- Enter **feedback** (free-form text)
- Set the **status** — e.g., submitted, graded, returned for revision
- Save the grade. The save is recorded against the instructor as `graded_by`.

**Dashboard tie-in:**

- "Pending Grading" count on the Dashboard counts submissions that are submitted but not yet graded.

---

## 10. Completion (batch closure)

The end-of-batch workspace. Used to mark students complete and trigger certificates.

### 10.1 Mark batch complete

1. The page shows every enrolled student with a **search box + checklist**.
2. Instructor selects which students passed / completed the batch.
3. Submit.

**What happens automatically:**

- Selected students are marked **completed** for that batch.
- The system generates a **personalised certificate PDF** for each selected student, using the course's certificate template and field coordinates configured by the admin.
- The certificate is **emailed** to each student as an attachment.
- Teaching updates (sessions, attendance, grading) are **locked** for those completed students.

### 10.2 Re-release certificates

- If a certificate email failed, or students were added/completed late, the instructor can re-trigger.
- Pick the affected students from a checklist.
- Submit to re-generate and re-email their certificates.

---

## 11. Rules the instructor must respect

These are the non-obvious rules that govern the instructor's work:

1. **No batch appears until the admin has assigned the instructor at both levels** — to the course **and** to the batch. Course-only assignment does not grant batch access.
2. **Sessions are auto-created from the plan, then editable.** The instructor doesn't create the plan structure — that's the admin's job. The instructor edits or supplements the inherited sessions.
3. **Editing any session always notifies enrolled students by email.** This is automatic and not toggleable.
4. **Attendance only exists for live sessions.** Recorded sessions don't have an attendance UI.
5. **Certificates require three things** — a certificate template PDF, configured field coordinates on the course (both admin tasks), and the batch marked completed for the student. The instructor controls only the last one.
6. **Batch completion is one-way for that student.** Once completed, teaching updates are locked. Only certificate release remains available.

---

## 12. Instructor happy path (end-to-end)

1. Admin creates an instructor account with skills.
2. Instructor logs in — dashboard is empty.
3. Admin assigns the instructor to a course, then to a batch.
4. Instructor refreshes — the batch appears under **Assigned Batches**.
5. Instructor opens **Course Plan** to see the week/day layout.
6. Instructor opens **Sessions & Resources**:
   - Edits inherited sessions to add meeting URLs, descriptions, exact times.
   - Adds manual sessions if needed.
   - Uploads resources (slides, PDFs, recordings) to each session.
7. Instructor creates **assignments** for the appropriate weeks/days.
8. After each live session, instructor marks **attendance**.
9. As students submit work, instructor opens **Submissions & Grading** and scores each submission with feedback.
10. When the batch ends, instructor opens **Completion**:
    - Selects the students who passed.
    - Marks the batch complete.
    - Certificates are auto-generated and emailed.
11. If any certificate fails to send, instructor uses **Re-release certificates** for those students.

---

## 13. Instructor section cheat sheet

| Section | What it does |
| --- | --- |
| Dashboard | Workload numbers + recent batches |
| Assigned Batches | Pick the current batch to act on |
| Create Assignment | Add an assignment to the current batch |
| Course Plan | View the inherited week/day plan |
| Sessions & Resources | Edit/create sessions, upload resources |
| Attendance | Mark presence for live sessions |
| Submissions & Grading | Score and give feedback on submissions |
| Completion | Mark students complete, release certificates |
