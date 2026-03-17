use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Persistent state — survives app restarts.
/// Stored at ~/.peerweights/torrents.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TorrentState {
    pub torrents: HashMap<String, SavedTorrent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedTorrent {
    pub model_id: String,
    pub version_id: String,
    pub info_hash: String,
    pub torrent_bytes_base64: String,
    pub download_dir: String,
    pub bytes_uploaded: u64,
    pub bytes_downloaded: u64,
    pub seeding_seconds: u64,
}

impl TorrentState {
    pub fn load() -> Self {
        let path = Self::state_path();
        match std::fs::read_to_string(&path) {
            Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) {
        let path = Self::state_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(data) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(&path, data);
        }
    }

    fn state_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".peerweights")
            .join("torrents.json")
    }
}
