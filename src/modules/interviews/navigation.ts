import { create } from "zustand";
import { useUiStore } from "../../stores/uiStore";
import type { ApplicationChoice } from "./model";

export const useInterviewNavigation = create<{
  jobFilter: ApplicationChoice | null; request: { id: string; job?: ApplicationChoice } | null;
}>(() => ({ jobFilter: null, request: null }));
/** 模块公开入口：从投递携带快照，或直接进入全部面经。 */
export function openInterviews(job?: ApplicationChoice, createNew = false) {
  useInterviewNavigation.setState({ jobFilter: job ?? null, request: createNew ? { id: crypto.randomUUID(), job } : null });
  const ui = useUiStore.getState(); ui.setAppView("jobs"); ui.setJobTab("interviews");
}
