import { calendarModule } from "./modules/calendar";
import { kbModule } from "./modules/knowledge";

/** ★ 全应用唯一模块清单：新增模块 = 在这里加一行，内核零改动。 */
export const modules = [calendarModule, kbModule];
