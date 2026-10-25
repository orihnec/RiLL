import { calendarModule } from "./modules/calendar";
import { kbModule } from "./modules/knowledge";
import { webModule } from "./modules/web";
import { jobsModule } from "./modules/jobs";
import { scoutModule } from "./modules/scout";
import { todoModule } from "./modules/todo";
import { themeModule } from "./modules/theme";
import { mailModule } from "./modules/mail";

/** ★ 全应用唯一模块清单：新增模块 = 在这里加一行，内核零改动。 */
export const modules = [
  calendarModule,
  kbModule,
  webModule,
  jobsModule,
  scoutModule,
  todoModule,
  themeModule,
  mailModule,
];
