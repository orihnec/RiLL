/** 钥匙串服务名（和 LLM API key 同一个服务，靠 user 前缀区分）。保持旧名以免已存的授权码失效。 */
export const KEYRING_SERVICE = "com.riliagent.app";

export const keyringUser = (accountId: string) => `mail:${accountId}`;

// 列清单：直接用 * —— 行类型已显式声明字段，SQLite 返回的列名与之一致即可。
export const ACCOUNT_COLS = "*";
export const FOLDER_COLS = "*";
export const MESSAGE_COLS = "*";
