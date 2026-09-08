use base64::Engine;
use reqwest::header::{CONTENT_DISPOSITION, CONTENT_TYPE, LOCATION};
use std::net::{IpAddr, TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct VoiceInfo {
    pub name: String,
    pub lang: String,
    pub sample: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AudioResult {
    pub audio_b64: String,
    pub duration: f64,
    pub sample_rate: u32,
}

fn is_server_alive(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    if let Ok(socket_addr) = addr.parse() {
        TcpStream::connect_timeout(&socket_addr, Duration::from_millis(150)).is_ok()
    } else {
        false
    }
}

#[tauri::command]
fn is_python_server_running(port: Option<u16>) -> bool {
    let p = port.unwrap_or(ENGINE_PORT);
    is_server_alive(p)
}

const ENGINE_PORT: u16 = 8765;
const MAX_URL_SOURCE_BYTES: usize = 100 * 1024 * 1024;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UrlSourceMetadata {
    final_url: String,
    filename: String,
    content_type: String,
    size: usize,
}

fn is_private_or_special_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_unspecified()
                || ip.is_multicast()
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || ip.is_unspecified()
                || ip.is_multicast()
        }
    }
}

async fn validate_public_web_url(url: &url::Url) -> Result<(), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Use an HTTPS, HTTP, or file URL.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URLs containing usernames or passwords are not supported.".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "This URL has no host.".to_string())?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return Err("Use a file URL for content stored on this computer.".to_string());
    }
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "This URL uses an unsupported port.".to_string())?;
    let addresses = tauri::async_runtime::spawn_blocking(move || {
        (host.as_str(), port)
            .to_socket_addrs()
            .map(|items| items.collect::<Vec<_>>())
    })
    .await
    .map_err(|_| "Could not validate this address.".to_string())?
    .map_err(|_| "Could not find this website.".to_string())?;
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|address| is_private_or_special_ip(address.ip()))
    {
        return Err(
            "Private-network web addresses are not supported. Use a file URL for local documents."
                .to_string(),
        );
    }
    Ok(())
}

fn source_filename(url: &url::Url, disposition: Option<&str>) -> String {
    let from_header = disposition.and_then(|value| {
        value.split(';').find_map(|part| {
            let (key, value) = part.trim().split_once('=')?;
            if !key.eq_ignore_ascii_case("filename") {
                return None;
            }
            let value = value.trim().trim_matches('"');
            (!value.is_empty()).then_some(value.to_string())
        })
    });
    let candidate = from_header.or_else(|| {
        url.path_segments()
            .and_then(|mut parts| parts.next_back())
            .filter(|part| !part.is_empty())
            .map(|part| part.to_string())
    });
    candidate
        .and_then(|name| {
            PathBuf::from(name)
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
        })
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "web-document.html".to_string())
        .chars()
        .take(180)
        .collect()
}

fn source_content_type(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "application/pdf",
        "epub" => "application/epub+zip",
        "html" | "htm" => "text/html",
        "xhtml" => "application/xhtml+xml",
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

fn source_envelope(
    metadata: UrlSourceMetadata,
    bytes: Vec<u8>,
) -> Result<tauri::ipc::Response, String> {
    let metadata = serde_json::to_vec(&metadata)
        .map_err(|_| "Could not prepare the imported document.".to_string())?;
    let metadata_len = u32::try_from(metadata.len())
        .map_err(|_| "Could not prepare the imported document.".to_string())?;
    let mut envelope = Vec::with_capacity(4 + metadata.len() + bytes.len());
    envelope.extend_from_slice(&metadata_len.to_be_bytes());
    envelope.extend_from_slice(&metadata);
    envelope.extend_from_slice(&bytes);
    Ok(tauri::ipc::Response::new(envelope))
}

#[tauri::command]
async fn load_url_source(raw_url: String) -> Result<tauri::ipc::Response, String> {
    log::info!("Loading document URL through the native source reader.");
    if raw_url.len() > 4096 {
        return Err("This URL is too long.".to_string());
    }
    let mut url = url::Url::parse(raw_url.trim())
        .map_err(|_| "Enter a complete HTTPS, HTTP, or file URL.".to_string())?;

    if url.scheme() == "file" {
        if url
            .host_str()
            .is_some_and(|host| !host.is_empty() && host != "localhost")
        {
            return Err("Remote file hosts are not supported.".to_string());
        }
        url.set_query(None);
        url.set_fragment(None);
        let path = url
            .to_file_path()
            .map_err(|_| "This file URL is not valid on this computer.".to_string())?;
        let metadata = std::fs::metadata(&path)
            .map_err(|_| "The local file could not be found or opened.".to_string())?;
        if !metadata.is_file() {
            return Err("Choose a file rather than a folder.".to_string());
        }
        if metadata.len() == 0 {
            return Err("This file is empty.".to_string());
        }
        if metadata.len() > MAX_URL_SOURCE_BYTES as u64 {
            return Err("URL documents must be 100 MB or smaller.".to_string());
        }
        let bytes =
            std::fs::read(&path).map_err(|_| "The local file could not be read.".to_string())?;
        let details = UrlSourceMetadata {
            final_url: url.to_string(),
            filename: path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| "local-document".to_string()),
            content_type: source_content_type(&path).to_string(),
            size: bytes.len(),
        };
        log::info!("Loaded {} bytes from a local file URL.", bytes.len());
        return source_envelope(details, bytes);
    }

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("9-gyo-phi/0.2 (+local listening reader)")
        .build()
        .map_err(|_| "Could not initialize secure web access.".to_string())?;

    for _ in 0..=5 {
        validate_public_web_url(&url).await?;
        let mut response = client.get(url.clone()).send().await.map_err(|error| {
            log::warn!("URL request failed: {error}");
            "The website could not be reached.".to_string()
        })?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "The website returned an invalid redirect.".to_string())?;
            url = url
                .join(location)
                .map_err(|_| "The website returned an invalid redirect.".to_string())?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!(
                "The website returned HTTP {}.",
                response.status().as_u16()
            ));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_URL_SOURCE_BYTES as u64)
        {
            return Err("URL documents must be 100 MB or smaller.".to_string());
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/octet-stream")
            .split(';')
            .next()
            .unwrap_or("application/octet-stream")
            .trim()
            .to_ascii_lowercase();
        let disposition = response
            .headers()
            .get(CONTENT_DISPOSITION)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let filename = source_filename(&url, disposition.as_deref());
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "The website stopped responding during download.".to_string())?
        {
            if bytes.len() + chunk.len() > MAX_URL_SOURCE_BYTES {
                return Err("URL documents must be 100 MB or smaller.".to_string());
            }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.is_empty() {
            return Err("The URL returned an empty document.".to_string());
        }
        let details = UrlSourceMetadata {
            final_url: url.to_string(),
            filename,
            content_type,
            size: bytes.len(),
        };
        log::info!("Loaded {} bytes from a public web URL.", bytes.len());
        return source_envelope(details, bytes);
    }

    Err("The website redirected too many times.".to_string())
}

/// Holds the engine child process this app instance started, if any, so it
/// can be torn down on exit. A `None` here can mean either "not started yet"
/// or "an engine was already running on the port and we didn't touch it" —
/// in both cases there is nothing for us to kill.
struct EngineChild(Mutex<Option<Child>>);

const ENGINE_ARCHIVE_NAME: &str = "9-gyo-phi-engine.zip";
const ENGINE_EXE_NAME: &str = "9-gyo-phi-engine";

/// The engine bundled into the packaged app (see `bundle.resources` in
/// tauri.conf.json and scripts/build_engine.sh), if this build has one. It
/// ships as a single zip resource — rather than the raw PyInstaller onedir
/// tree — because Tauri's directory-glob resource copying flattens nested
/// folders instead of preserving them, which breaks the engine's `_internal`
/// dependency layout. We unpack it once into the app's data dir and reuse
/// that extracted copy on later launches.
fn bundled_engine_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let archive = app.path().resource_dir().ok()?.join(ENGINE_ARCHIVE_NAME);
    let archive_meta = std::fs::metadata(&archive).ok()?;
    let dest = app.path().app_data_dir().ok()?.join("engine-bin");
    let marker = dest.join(".bundle-marker");
    let marker_value = format!(
        "{}-{}",
        archive_meta.len(),
        archive_meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0)
    );

    let up_to_date = std::fs::read_to_string(&marker)
        .map(|existing| existing == marker_value)
        .unwrap_or(false);

    if !up_to_date {
        log::info!("Unpacking bundled engine to {:?}", dest);
        let _ = std::fs::remove_dir_all(&dest);
        std::fs::create_dir_all(&dest).ok()?;
        let status = Command::new("/usr/bin/unzip")
            .arg("-q")
            .arg("-o")
            .arg(&archive)
            .arg("-d")
            .arg(&dest)
            .status()
            .ok()?;
        if !status.success() {
            log::warn!("Failed to unpack bundled engine archive.");
            return None;
        }
        std::fs::write(&marker, marker_value).ok()?;
    }

    let exe = dest.join(ENGINE_EXE_NAME);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&exe) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&exe, perms);
        }
    }
    exe.exists().then_some(exe)
}

/// The engine script in this source checkout, used for `tauri dev` and for
/// local builds run from the repo before a bundled engine has been built.
fn dev_engine_script() -> Option<PathBuf> {
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("engine")
        .join("server.py");
    script.exists().then_some(script)
}

fn find_python() -> Option<&'static str> {
    ["python3", "python"].into_iter().find(|bin| {
        Command::new(bin)
            .arg("--version")
            .output()
            .is_ok_and(|o| o.status.success())
    })
}

/// Starts the optional MLX engine in the background, unless one is already
/// listening on `ENGINE_PORT`. The engine is Apple Silicon/macOS-only; on
/// other platforms (or if neither a bundled engine nor a system Python is
/// available) the app just runs without it, same as today.
fn spawn_engine(app: &tauri::AppHandle) -> Option<Child> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    if is_server_alive(ENGINE_PORT) {
        log::info!(
            "Engine already listening on {}; not starting another copy.",
            ENGINE_PORT
        );
        return None;
    }

    let spawned = if let Some(exe) = bundled_engine_path(app) {
        log::info!("Starting bundled engine at {:?}", exe);
        let dir = exe.parent().map(PathBuf::from).unwrap_or_default();
        Command::new(&exe)
            .arg(ENGINE_PORT.to_string())
            .arg("--no-open")
            .current_dir(dir)
            .spawn()
    } else if let (Some(script), Some(python)) = (dev_engine_script(), find_python()) {
        log::info!("Starting engine via {} {:?}", python, script);
        let dir = script.parent().map(PathBuf::from).unwrap_or_default();
        Command::new(python)
            .arg(&script)
            .arg(ENGINE_PORT.to_string())
            .arg("--no-open")
            .current_dir(dir)
            .spawn()
    } else {
        log::warn!(
            "No bundled engine and no engine/server.py + python3 found; \
             the optional MLX engine will not start automatically."
        );
        return None;
    };

    match spawned {
        Ok(child) => {
            log::info!("Engine process started (pid {}).", child.id());
            Some(child)
        }
        Err(err) => {
            log::warn!("Failed to start the optional engine: {err}");
            None
        }
    }
}

fn collect_system_voices() -> Vec<VoiceInfo> {
    let mut voices = Vec::new();

    let default_mac_voices = vec![
        ("Samantha", "en_US", "Hello! My name is Samantha."),
        ("Daniel", "en_GB", "Hello! My name is Daniel."),
        ("Alex", "en_US", "Most people recognize me by my voice."),
        ("Karen", "en_AU", "G'day! My name is Karen."),
        ("Victoria", "en_US", "Isn't it a fine day to read?"),
        ("Fred", "en_US", "I sure like being inside this Macintosh."),
    ];

    if let Ok(output) = Command::new("/usr/bin/say").arg("-v").arg("?").output() {
        if let Ok(text) = String::from_utf8(output.stdout) {
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Some((left, sample)) = trimmed.split_once('#') {
                    let parts: Vec<&str> = left.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let lang = parts.last().unwrap_or(&"").to_string();
                        let name = parts[..parts.len() - 1].join(" ");
                        voices.push(VoiceInfo {
                            name,
                            lang,
                            sample: sample.trim().to_string(),
                        });
                    }
                }
            }
        }
    }

    if voices.is_empty() {
        for (name, lang, sample) in default_mac_voices {
            voices.push(VoiceInfo {
                name: name.to_string(),
                lang: lang.to_string(),
                sample: sample.to_string(),
            });
        }
    }

    voices
}

fn generate_native_speech(
    text: String,
    voice: Option<String>,
    rate: Option<u32>,
) -> Result<AudioResult, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Text cannot be empty".to_string());
    }

    if text.chars().count() > 100_000 {
        return Err("Text must be under 100,000 characters".to_string());
    }
    if rate.is_some_and(|r| !(80..=450).contains(&r)) {
        return Err("Speech rate must be between 80 and 450 words per minute".to_string());
    }
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_file = std::env::temp_dir().join(format!("9_gyo_phi_{}.wav", timestamp));

    let mut cmd = Command::new("/usr/bin/say");
    if let Some(v) = &voice {
        if !v.is_empty()
            && v != "default"
            && !v.starts_with("af_")
            && !v.starts_with("am_")
            && !v.starts_with("bf_")
            && !v.starts_with("bm_")
        {
            cmd.arg("-v").arg(v);
        }
    }
    if let Some(r) = rate {
        cmd.arg("-r").arg(r.to_string());
    }
    cmd.arg("-o").arg(&temp_file);
    cmd.arg("--data-format=LEI16@24000");
    cmd.arg("--").arg(trimmed);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run say command: {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&temp_file);
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Speech synthesis failed: {}", err_msg));
    }

    let wav_bytes =
        std::fs::read(&temp_file).map_err(|e| format!("Failed to read generated wav: {}", e))?;
    let _ = std::fs::remove_file(&temp_file);

    let pcm_bytes = if wav_bytes.len() > 44 {
        wav_bytes.len() - 44
    } else {
        0
    };
    let duration = (pcm_bytes as f64) / 48000.0;
    let audio_b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

    Ok(AudioResult {
        audio_b64,
        duration: (duration * 1000.0).round() / 1000.0,
        sample_rate: 24000,
    })
}

#[tauri::command]
async fn get_system_voices() -> Result<Vec<VoiceInfo>, String> {
    tauri::async_runtime::spawn_blocking(collect_system_voices)
        .await
        .map_err(|e| format!("Voice discovery failed: {}", e))
}

#[tauri::command]
async fn synthesize_native_speech(
    text: String,
    voice: Option<String>,
    rate: Option<u32>,
) -> Result<AudioResult, String> {
    tauri::async_runtime::spawn_blocking(move || generate_native_speech(text, voice, rate))
        .await
        .map_err(|e| format!("Speech task failed: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(EngineChild(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_system_voices,
            synthesize_native_speech,
            is_python_server_running,
            load_url_source
        ])
        .setup(|app| {
            let child = spawn_engine(app.handle());
            *app.state::<EngineChild>().0.lock().unwrap() = child;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(mut child) = app_handle.state::<EngineChild>().0.lock().unwrap().take()
                {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
