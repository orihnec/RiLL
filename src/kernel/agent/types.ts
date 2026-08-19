/**
 * Agent 工具。命名规范：{模块}_{动词}（如 calendar_createEvent）。
 * description 写给 LLM 看：写清使用时机与参数含义。
 * 全量注入（< 30 个工具无需路由）。
 */
export interface Tool {
  name: string;
  description: string;
  /** 执行工具，返回给 LLM 的文本结果 */
  execute: (args: Record<string, unknown>) => Promise<string>;
}
