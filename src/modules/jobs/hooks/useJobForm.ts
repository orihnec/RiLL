import { useEffect, useState } from "react";
import { errMsg } from "../../../lib/error";
import { createJob, updateJob, type JobApplication } from "../service";
import { toDateInput } from "../format";

export function useJobForm(open: boolean, job: JobApplication | null, fallback: string, onSaved: () => void, onClose: () => void) {
  const [company, setCompany] = useState(""), [position, setPosition] = useState("");
  const [status, setStatus] = useState(""), [url, setUrl] = useState(""), [notes, setNotes] = useState("");
  const [appliedDate, setAppliedDate] = useState(""), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null); setCompany(job?.company ?? ""); setPosition(job?.position ?? "");
    setStatus(job?.status ?? fallback); setUrl(job?.url ?? ""); setNotes(job?.notes ?? "");
    setAppliedDate(toDateInput(job ? job.applied_at : fallback === "preparing" ? null : Date.now()));
  }, [open, job, fallback]);
  const changeStatus = (value: string) => {
    setStatus(value);
    if (value === "preparing") setAppliedDate("");
    else if (status === "preparing") setAppliedDate(toDateInput(Date.now()));
  };
  const save = async () => {
    if (!company.trim() || !position.trim()) { setError("请填写公司和职位"); return; }
    const appliedAt = status === "preparing" || !appliedDate ? null : new Date(`${appliedDate}T00:00:00`).getTime();
    setBusy(true); setError(null);
    try {
      const input = { company, position, status, url, notes, appliedAt };
      if (job) await updateJob(job.id, input); else await createJob(input);
      onSaved(); onClose();
    } catch (error) { setError(errMsg(error)); }
    finally { setBusy(false); }
  };
  return { company, setCompany, position, setPosition, status, setStatus: changeStatus, url, setUrl, notes, setNotes,
    appliedDate, setAppliedDate, busy, error, save };
}
