// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod reporter;
mod torrent;

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WindowEvent};

use commands::{AuthTokenState, EngineState};
use torrent::engine::TorrentEngine;

const API_BASE: &str = "https://peerweights.com/api";

fn default_download_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PeerWeights")
        .join("models")
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize torrent engine
            let download_dir = default_download_dir();
            let rt = tokio::runtime::Handle::current();

            let engine: EngineState = Arc::new(Mutex::new(
                rt.block_on(async { TorrentEngine::new(download_dir).await })
                    .expect("Failed to initialize torrent engine"),
            ));

            // Restore torrents from persistent state
            let engine_clone = engine.clone();
            rt.spawn(async move {
                let mut eng = engine_clone.lock().await;
                let errors = eng.restore_from_state().await;
                for e in errors {
                    log::warn!("Failed to restore torrent: {}", e);
                }
            });

            let auth_token: AuthTokenState = Arc::new(Mutex::new(None));

            // Start background seed stats reporter
            let reporter_engine = engine.clone();
            let reporter_auth = auth_token.clone();
            rt.spawn(reporter::run_reporter(
                reporter_engine,
                reporter_auth,
                API_BASE.to_string(),
            ));

            // Manage state
            app.manage(engine);
            app.manage(auth_token);

            // System tray
            let open = MenuItemBuilder::with_id("open", "Open PeerWeights").build(app)?;
            let pause_all = MenuItemBuilder::with_id("pause_all", "Pause All").build(app)?;
            let resume_all = MenuItemBuilder::with_id("resume_all", "Resume All").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&open)
                .separator()
                .item(&pause_all)
                .item(&resume_all)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("PeerWeights")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "pause_all" => {
                        let engine = app.state::<EngineState>().inner().clone();
                        tauri::async_runtime::spawn(async move {
                            let eng = engine.lock().await;
                            let stats = eng.get_all_stats();
                            for s in stats {
                                let _ = eng.pause(s.id).await;
                            }
                        });
                    }
                    "resume_all" => {
                        let engine = app.state::<EngineState>().inner().clone();
                        tauri::async_runtime::spawn(async move {
                            let eng = engine.lock().await;
                            let stats = eng.get_all_stats();
                            for s in stats {
                                let _ = eng.unpause(s.id).await;
                            }
                        });
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Minimize to tray on close instead of quitting
            let main_window = app.get_webview_window("main").unwrap();
            let window_for_close = main_window.clone();
            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_for_close.hide();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_desktop,
            commands::get_all_torrents,
            commands::get_torrent_stats,
            commands::start_download,
            commands::fetch_and_start_torrent,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::remove_torrent,
            commands::get_download_dir,
            commands::set_auth_token,
            commands::open_model_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
