import { deletePassword, getPassword, setPassword } from "tauri-plugin-keyring-api";
import { createCredentialVault } from "./credentialVault";

const SERVICE = "com.riliagent.app";
export const feishuCredentialStore = createCredentialVault({
  get: (key) => getPassword(SERVICE, key),
  set: (key, value) => setPassword(SERVICE, key, value),
  remove: async (key) => { if (await getPassword(SERVICE, key)) await deletePassword(SERVICE, key); },
}, "jobs:feishu:connection");
