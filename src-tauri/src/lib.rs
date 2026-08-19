// 纯壳（shell）：只注册 Tauri 插件，不写任何业务逻辑。
// 业务逻辑全部在 TS 侧（kernel / modules）。

use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        // LLM 请求走原生层，绕开 webview CORS
        .plugin(tauri_plugin_http::init())
        // API key 存系统钥匙串（Windows 凭据管理器）
        .plugin(tauri_plugin_keyring::init())
        // 全局 Cmd+K：系统级注册，前端收事件打开命令栏
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("riliagent:cmd-k", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            let _ = app.global_shortcut().register("CommandOrControl+K");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
