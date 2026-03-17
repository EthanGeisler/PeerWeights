use std::path::PathBuf;
use std::sync::Arc;

use librqbit::AddTorrent;
use librqbit::AddTorrentOptions;
use librqbit::Session;
use librqbit::SessionOptions;
use librqbit::TorrentStats;
use librqbit::TorrentStatsState;
use serde::Serialize;

use super::state::{SavedTorrent, TorrentState};

/// Wraps librqbit::Session with PeerWeights-specific logic.
pub struct TorrentEngine {
    session: Arc<Session>,
    state: TorrentState,
    download_dir: PathBuf,
}

/// Stats returned to the frontend via IPC.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PwTorrentStats {
    pub id: usize,
    pub model_id: String,
    pub version_id: String,
    pub state: String,
    pub progress_bytes: u64,
    pub uploaded_bytes: u64,
    pub total_bytes: u64,
    pub finished: bool,
    pub seed_ratio: f64,
    pub error: Option<String>,
}

fn state_string(s: TorrentStatsState) -> String {
    match s {
        TorrentStatsState::Initializing => "initializing".into(),
        TorrentStatsState::Live => "live".into(),
        TorrentStatsState::Paused => "paused".into(),
        TorrentStatsState::Error => "error".into(),
    }
}

impl TorrentEngine {
    pub async fn new(download_dir: PathBuf) -> anyhow::Result<Self> {
        std::fs::create_dir_all(&download_dir)?;

        let opts = SessionOptions {
            fastresume: true,
            enable_upnp_port_forwarding: true,
            listen_port_range: Some(6881..6891),
            ..Default::default()
        };

        let session = Session::new_with_opts(download_dir.clone(), opts).await?;
        let state = TorrentState::load();

        Ok(Self {
            session,
            state,
            download_dir,
        })
    }

    /// Add a torrent from raw .torrent bytes.
    pub async fn add_torrent(
        &mut self,
        torrent_bytes: Vec<u8>,
        model_id: String,
        version_id: String,
    ) -> anyhow::Result<usize> {
        let bytes_clone = torrent_bytes.clone();

        let opts = AddTorrentOptions {
            output_folder: Some(self.download_dir.to_string_lossy().into_owned()),
            ..Default::default()
        };

        let response = self
            .session
            .add_torrent(AddTorrent::from_bytes(torrent_bytes), Some(opts))
            .await?;

        let handle = response.into_handle().ok_or_else(|| {
            anyhow::anyhow!("torrent was list-only, no handle returned")
        })?;

        let id = handle.id();
        let info_hash = hex::encode(handle.info_hash().0);

        // Persist state
        use base64::Engine as _;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes_clone);
        self.state.torrents.insert(
            info_hash.clone(),
            SavedTorrent {
                model_id,
                version_id,
                info_hash,
                torrent_bytes_base64: b64,
                download_dir: self.download_dir.to_string_lossy().into_owned(),
                bytes_uploaded: 0,
                bytes_downloaded: 0,
                seeding_seconds: 0,
            },
        );
        self.state.save();

        Ok(id)
    }

    /// Get stats for a single torrent by session ID.
    pub fn get_stats(&self, id: usize) -> Option<PwTorrentStats> {
        let torrent = self.session.get(id.into())?;
        let stats: TorrentStats = torrent.stats();
        let info_hash = hex::encode(torrent.info_hash().0);

        let saved = self.state.torrents.get(&info_hash);
        let (model_id, version_id) = saved
            .map(|s| (s.model_id.clone(), s.version_id.clone()))
            .unwrap_or_else(|| ("unknown".into(), "unknown".into()));

        let ratio = if stats.progress_bytes > 0 {
            stats.uploaded_bytes as f64 / stats.total_bytes as f64
        } else {
            0.0
        };

        Some(PwTorrentStats {
            id,
            model_id,
            version_id,
            state: state_string(stats.state),
            progress_bytes: stats.progress_bytes,
            uploaded_bytes: stats.uploaded_bytes,
            total_bytes: stats.total_bytes,
            finished: stats.finished,
            seed_ratio: ratio,
            error: stats.error,
        })
    }

    /// Get stats for all torrents.
    pub fn get_all_stats(&self) -> Vec<PwTorrentStats> {
        let ids: Vec<usize> = self.session.with_torrents(|iter| {
            iter.map(|(id, _)| id).collect()
        });
        ids.iter()
            .filter_map(|&id| self.get_stats(id))
            .collect()
    }

    /// Pause a torrent.
    pub async fn pause(&self, id: usize) -> anyhow::Result<()> {
        let torrent = self
            .session
            .get(id.into())
            .ok_or_else(|| anyhow::anyhow!("torrent not found"))?;
        self.session.pause(&torrent).await?;
        Ok(())
    }

    /// Resume a paused torrent.
    pub async fn unpause(&self, id: usize) -> anyhow::Result<()> {
        let torrent = self
            .session
            .get(id.into())
            .ok_or_else(|| anyhow::anyhow!("torrent not found"))?;
        self.session.unpause(&torrent).await?;
        Ok(())
    }

    /// Remove a torrent, optionally deleting files.
    pub async fn delete(&self, id: usize, delete_files: bool) -> anyhow::Result<()> {
        self.session.delete(id.into(), delete_files).await?;
        Ok(())
    }

    /// Get download directory.
    pub fn download_dir(&self) -> &PathBuf {
        &self.download_dir
    }

    /// Restore torrents from persistent state (called on startup).
    pub async fn restore_from_state(&mut self) -> Vec<anyhow::Error> {
        let mut errors = Vec::new();
        let entries: Vec<_> = self.state.torrents.values().cloned().collect();

        for saved in entries {
            use base64::Engine as _;
            let bytes = match base64::engine::general_purpose::STANDARD
                .decode(&saved.torrent_bytes_base64)
            {
                Ok(b) => b,
                Err(e) => {
                    errors.push(anyhow::anyhow!(
                        "failed to decode torrent {}: {}",
                        saved.info_hash,
                        e
                    ));
                    continue;
                }
            };

            let opts = AddTorrentOptions {
                output_folder: Some(saved.download_dir.clone()),
                ..Default::default()
            };

            if let Err(e) = self
                .session
                .add_torrent(AddTorrent::from_bytes(bytes), Some(opts))
                .await
            {
                errors.push(anyhow::anyhow!(
                    "failed to restore torrent {}: {}",
                    saved.info_hash,
                    e
                ));
            }
        }

        errors
    }

    /// Update persisted upload stats from live stats.
    pub fn sync_uploaded_stats(&mut self) {
        let updates: Vec<(String, u64, u64)> = self.session.with_torrents(|iter| {
            iter.map(|(_id, torrent)| {
                let info_hash = hex::encode(torrent.info_hash().0);
                let stats = torrent.stats();
                (info_hash, stats.uploaded_bytes, stats.progress_bytes)
            })
            .collect()
        });
        for (info_hash, uploaded, downloaded) in updates {
            if let Some(saved) = self.state.torrents.get_mut(&info_hash) {
                saved.bytes_uploaded = uploaded;
                saved.bytes_downloaded = downloaded;
            }
        }
        self.state.save();
    }

    /// Get seed stats for reporting to the server.
    pub fn get_report_data(&self) -> Vec<(String, u64, u64)> {
        let mut data = Vec::new();
        for saved in self.state.torrents.values() {
            if saved.bytes_uploaded > 0 {
                data.push((
                    saved.version_id.clone(),
                    saved.bytes_uploaded,
                    saved.seeding_seconds,
                ));
            }
        }
        data
    }
}
