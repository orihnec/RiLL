// 纯壳（shell）：只注册 Tauri 插件，不写任何业务逻辑。
// 业务逻辑全部在 TS 侧（kernel / modules）。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
