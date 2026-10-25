// re-export 保持既有 `import ... from "../service"` 不变；实现按模块拆在 ./service/ 下。
export * from "./service/types";
export * from "./service/accounts";
export * from "./service/remote";
export * from "./service/folders";
export * from "./service/threads";
export * from "./service/messages";
export * from "./service/bodies";