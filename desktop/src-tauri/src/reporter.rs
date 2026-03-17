use std::time::Duration;

use crate::commands::{AuthTokenState, EngineState};

/// Background task that reports seed stats to the PeerWeights API every 5 minutes.
pub async fn run_reporter(
    engine: EngineState,
    auth_token: AuthTokenState,
    api_base: String,
) {
    let client = reqwest::Client::new();
    let interval = Duration::from_secs(300); // 5 minutes

    loop {
        tokio::time::sleep(interval).await;

        // Sync live stats to persistent state
        {
            let mut eng = engine.lock().await;
            eng.sync_uploaded_stats();
        }

        // Check if we have an auth token
        let token = {
            let auth = auth_token.lock().await;
            match auth.clone() {
                Some(t) => t,
                None => continue, // Not logged in, skip
            }
        };

        // Get report data
        let report_data = {
            let eng = engine.lock().await;
            eng.get_report_data()
        };

        // Report each version's stats
        for (version_id, bytes_uploaded, seeding_seconds) in report_data {
            let body = serde_json::json!({
                "modelVersionId": version_id,
                "bytesUploaded": bytes_uploaded,
                "seedingSeconds": seeding_seconds,
            });

            let url = format!("{}/torrents/seed-stats", api_base);
            let resp = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await;

            match resp {
                Ok(r) if r.status().is_success() => {
                    log::debug!("Reported seed stats for version {}", version_id);
                }
                Ok(r) => {
                    log::warn!(
                        "Seed stats report failed for version {}: status {}",
                        version_id,
                        r.status()
                    );
                }
                Err(e) => {
                    log::warn!("Seed stats report error for version {}: {}", version_id, e);
                }
            }
        }
    }
}
