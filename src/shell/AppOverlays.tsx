import { useCalendarStore } from "../stores/calendarStore";
import { useUiStore } from "../stores/uiStore";
import { CommandPalette } from "./CommandPalette";
import { CloseConfirmDialog } from "./CloseConfirmDialog";
import { CategoryManagerDialog } from "./CategoryManagerDialog";
import { EventDialog } from "../modules/calendar/components/EventDialog";
import { HabitDialog } from "../modules/calendar/components/HabitDialog";

/** 弹层栈：设置 / 日程 / 命令栏 / 习惯 / 关闭确认 / 类别管理（邮箱与知识库已升为一级页面）。 */
export function AppOverlays() {
  const createDialog = useUiStore((s) => s.createDialog);
  const closeCreateDialog = useUiStore((s) => s.closeCreateDialog);
  const closeDialogOpen = useUiStore((s) => s.closeDialogOpen);
  const setCloseDialogOpen = useUiStore((s) => s.setCloseDialogOpen);
  const categoryManagerOpen = useUiStore((s) => s.categoryManagerOpen);
  const setCategoryManagerOpen = useUiStore((s) => s.setCategoryManagerOpen);
  const habitsOpen = useUiStore((s) => s.habitsOpen);
  const setHabitsOpen = useUiStore((s) => s.setHabitsOpen);
  const createEvent = useCalendarStore((s) => s.createEvent);

  return (
    <>
      <EventDialog
        state={createDialog}
        onClose={closeCreateDialog}
        onCreate={async (input) => {
          await createEvent(input);
        }}
      />
      <CommandPalette />
      <HabitDialog open={habitsOpen} onClose={() => setHabitsOpen(false)} />
      <CloseConfirmDialog open={closeDialogOpen} onClose={() => setCloseDialogOpen(false)} />
      <CategoryManagerDialog
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
      />
    </>
  );
}
