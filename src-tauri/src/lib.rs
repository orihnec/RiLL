// 纯壳（shell）：只注册 Tauri 插件，不写任何业务逻辑。
// 业务逻辑全部在 TS 侧（kernel / modules）。
// 例外：mail 模块的 IMAP 读信（TCP+TLS，webview 里的 JS 碰不到）。

mod attach;
mod error;
mod mail;
mod window;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 前端「关闭确认」选择「退出程序」时调用：彻底退出（区别于隐藏到托盘）。
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            quit,
            attach::attach_extract,
            mail::mail_test_account,
            mail::mail_sync_headers,
            mail::mail_fetch_body,
            mail::mail_save_attachment,
            mail::mail_set_flags,
            mail::mail_move,
            mail::mail_watch_apply,
            mail::mail_watch_stop
        ])
        .plugin(tauri_plugin_sql::Builder::default().build())
        // LLM 请求走原生层，绕开 webview CORS
        .plugin(tauri_plugin_http::init())
        // API key 存系统钥匙串（Windows 凭据管理器）
        .plugin(tauri_plugin_keyring::init())
        // 聊天 Markdown 链接：用系统默认浏览器打开
        .plugin(tauri_plugin_opener::init())
        // 知识库（M3）：读取本地 Markdown 目录 + 目录选择对话框
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // 日程提醒（Windows 通知）
        .plugin(tauri_plugin_notification::init())
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

            // 今日日程悬浮窗：置顶无边框、不透明（避开 WebView2 透明窗口合成 bug），尺寸可调
            let _overview = WebviewWindowBuilder::new(
                app,
                "overview",
                WebviewUrl::App("index.html?view=overview".into()),
            )
            .title("今日日程")
            .inner_size(340.0, 480.0)
            .min_inner_size(240.0, 300.0)
            .resizable(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .build();

            // 系统托盘：左键/菜单恢复主窗口，菜单可开关悬浮窗、退出
            let show_main = MenuItem::with_id(app, "show_main", "显示 RiliAgent", true, None::<&str>)?;
            let show_overview = MenuItem::with_id(app, "show_overview", "今日日程悬浮窗", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_main, &show_overview, &quit])?;
            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("RiliAgent")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_main" => window::show(app, "main"),
                    "show_overview" => window::toggle(app, "overview"),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        window::show(tray.app_handle(), "main");
                    }
                })
                .build(app)?;

            Ok(())
        })
        // 关闭：主窗口弹出「最小化到托盘 / 退出」确认（前端监听后显示对话框）；
        // 悬浮窗关闭则直接隐藏到托盘。
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "main" {
                    let _ = window.emit("riliagent:close-requested", ());
                } else {
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

