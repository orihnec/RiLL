import { useCallback, useEffect, useRef, useState } from "react";
import { errMsg } from "../../../lib/error";
import { useTwoStepConfirm } from "../../../lib/useTwoStepConfirm";
import { deleteJob, listJobs, updateJob, type JobApplication } from "../service";
import { useJobsVersion } from "../changes";
import { useJobStatusStore } from "../statusStore";

export function usePreparingBoard() {
  const version = useJobsVersion((state) => state.version), statuses = useJobStatusStore((state) => state.statuses);
  const [rows, setRows] = useState<JobApplication[]>([]), [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const sequence = useRef(0), del = useTwoStepConfirm();
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError(null);
    try { const rows = await listJobs("preparing"); if (request === sequence.current) setRows(rows); }
    catch (error) { if (request === sequence.current) setError(errMsg(error)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { const reload = () => { void refresh(); }; reload(); window.addEventListener("focus", reload); return () => window.removeEventListener("focus", reload); }, [refresh, version]);
  const markApplied = async (id: string) => {
    setBusyId(id);
    try { await updateJob(id, { status: "applied", appliedAt: Date.now() }); }
    catch (error) { setError(errMsg(error)); }
    finally { setBusyId(null); }
  };
  const remove = async (id: string) => {
    if (!del.armed(id)) return;
    try { await deleteJob(id); } catch (error) { setError(errMsg(error)); }
  };
  return { rows, loading, busyId, error, del, statuses, refresh, markApplied, remove };
}
