use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use crate::torrent::engine::{PwTorrentStats, TorrentEngine};

pub type EngineState = Arc<Mutex<TorrentEngine>>;
pub type AuthTokenState = Arc<Mutex<Option<String>>>;

#[tauri::command]
pub async fn is_desktop() -> bool {
    true
}

#[tauri::command]
pub async fn get_all_torrents(engine: State<'_, EngineState>) -> Result<Vec<PwTorrentStats>, String> {
    let engine = engine.lock().await;
    Ok(engine.get_all_stats())
}

#[tauri::command]
pub async fn get_torrent_stats(
    id: usize,
    engine: State<'_, EngineState>,
) -> Result<Option<PwTorrentStats>, String> {
    let engine = engine.lock().await;
    Ok(engine.get_stats(id))
}

#[tauri::command]
pub async fn start_download(
    torrent_bytes: Vec<u8>,
    model_id: String,
    version_id: String,
    engine: State<'_, EngineState>,
) -> Result<usize, String> {
    let mut engine = engine.lock().await;
    engine
        .add_torrent(torrent_bytes, model_id, version_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_and_start_torrent(
    model_id: String,
    version_id: String,
    access_token: String,
    api_base: String,
    engine: State<'_, EngineState>,
) -> Result<usize, String> {
    // Fetch .torrent file from API
    let url = format!("{}/torrents/{}/latest/file", api_base, model_id);
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch torrent: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("API returned status {}", resp.status()));
    }

    let torrent_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read torrent bytes: {}", e))?
        .to_vec();

    let mut engine = engine.lock().await;
    engine
        .add_torrent(torrent_bytes, model_id, version_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pause_torrent(id: usize, engine: State<'_, EngineState>) -> Result<(), String> {
    let engine = engine.lock().await;
    engine.pause(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_torrent(id: usize, engine: State<'_, EngineState>) -> Result<(), String> {
    let engine = engine.lock().await;
    engine.unpause(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_torrent(
    id: usize,
    delete_files: bool,
    engine: State<'_, EngineState>,
) -> Result<(), String> {
    let engine = engine.lock().await;
    engine.delete(id, delete_files).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_download_dir(engine: State<'_, EngineState>) -> Result<String, String> {
    let engine = engine.lock().await;
    Ok(engine.download_dir().to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn set_auth_token(
    token: Option<String>,
    auth: State<'_, AuthTokenState>,
) -> Result<(), String> {
    let mut auth = auth.lock().await;
    *auth = token;
    Ok(())
}

#[tauri::command]
pub async fn open_model_folder(
    _id: usize,
    engine: State<'_, EngineState>,
) -> Result<(), String> {
    let engine = engine.lock().await;
    let dir = engine.download_dir().to_string_lossy().into_owned();
    drop(engine);
    open::that(&dir).map_err(|e| e.to_string())
}
