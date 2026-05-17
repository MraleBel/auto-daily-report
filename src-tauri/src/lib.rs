use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: String,
    pub url: String,
    pub name: String,
    pub project_name: Option<String>,
    pub local_path: String,
    pub default_branch: Option<String>,
    pub selected_branch: Option<String>,
    pub sort_order: i64,
    pub last_sync_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_work_hours: f32,
    pub default_generation_mode: GenerationMode,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_work_hours: 8.0,
            default_generation_mode: GenerationMode::Message,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReportRecord {
    pub id: String,
    pub repository_id: String,
    pub repository_name: String,
    pub project_name: Option<String>,
    pub branch: String,
    pub author: Option<String>,
    pub start_at: String,
    pub end_at: String,
    pub generation_mode: GenerationMode,
    pub duration: Option<DurationOptions>,
    pub commits: Vec<CommitInfo>,
    pub text: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppStore {
    pub repositories: Vec<Repository>,
    pub model_configs: Vec<ModelConfig>,
    pub settings: AppSettings,
    pub reports: Vec<ReportRecord>,
}

impl Default for AppStore {
    fn default() -> Self {
        Self {
            repositories: Vec::new(),
            model_configs: Vec::new(),
            settings: AppSettings::default(),
            reports: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub repositories: Vec<Repository>,
    pub model_configs: Vec<ModelConfigPublic>,
    pub settings: AppSettings,
    pub reports: Vec<ReportRecord>,
    pub default_author: DefaultAuthor,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfigPublic {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DefaultAuthor {
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AddRepositoryInput {
    pub url: String,
    pub project_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRepositoryInput {
    pub id: String,
    pub project_name: Option<String>,
    pub selected_branch: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveModelInput {
    pub id: Option<String>,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerateReportInput {
    pub repository_id: String,
    pub branch: String,
    pub authors: Option<Vec<String>>,
    pub start_at: String,
    pub end_at: String,
    pub generation_mode: GenerationMode,
    pub model_id: Option<String>,
    pub duration: Option<DurationOptions>,
    pub custom_prompt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GenerationMode {
    Message,
    Ai,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct DurationOptions {
    pub enabled: bool,
    pub total_hours: f32,
    pub strategy: DurationStrategy,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DurationStrategy {
    Equal,
    CommitWeighted,
    AiEstimate,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub subject: String,
    pub body: String,
    pub diff: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub configured: bool,
    pub message: String,
}

pub struct AppStateData {
    store: Mutex<AppStore>,
    store_path: PathBuf,
    repos_dir: PathBuf,
}

type AppResult<T> = Result<T, String>;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let repos_dir = data_dir.join("repositories");
            fs::create_dir_all(&repos_dir)?;
            let store_path = data_dir.join("store.json");
            let store = load_store(&store_path).unwrap_or_default();
            app.manage(AppStateData {
                store: Mutex::new(store),
                store_path,
                repos_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            add_repository,
            update_repository,
            remove_repository,
            refresh_repository,
            list_branches,
            list_authors,
            default_author,
            generate_report,
            save_model_config,
            delete_model_config,
            update_settings,
            delete_report,
            check_update_status
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Auto Daily Report");
}

#[tauri::command]
fn get_snapshot(state: State<'_, AppStateData>) -> AppResult<AppSnapshot> {
    let store = state.store.lock().map_err(|_| "store lock poisoned")?;
    Ok(AppSnapshot {
        repositories: sorted_repositories(&store.repositories),
        model_configs: public_models(&store.model_configs),
        settings: store.settings.clone(),
        reports: store.reports.clone(),
        default_author: read_default_author(),
    })
}

#[tauri::command]
fn default_author() -> DefaultAuthor {
    read_default_author()
}

#[tauri::command]
fn add_repository(state: State<'_, AppStateData>, input: AddRepositoryInput) -> AppResult<Repository> {
    let url = input.url.trim().to_string();
    if url.is_empty() {
        return Err("仓库地址不能为空".into());
    }

    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    if store.repositories.iter().any(|repo| repo.url == url) {
        return Err("该仓库已经添加过".into());
    }

    let id = stable_repo_id(&url);
    let local_path = state.repos_dir.join(&id);
    if !local_path.exists() {
        run_git(None, &["clone", "--progress", &url, path_to_str(&local_path)?])?;
    }

    let default_branch = git_current_branch(&local_path).ok();
    let now = now_iso();
    let repo = Repository {
        id,
        url: url.clone(),
        name: infer_repo_name(&url),
        project_name: normalize_optional(input.project_name),
        local_path: local_path.to_string_lossy().to_string(),
        selected_branch: default_branch.clone(),
        default_branch,
        sort_order: next_sort_order(&store.repositories),
        last_sync_at: Some(now.clone()),
        created_at: now,
    };

    store.repositories.push(repo.clone());
    save_store(&state.store_path, &store)?;
    Ok(repo)
}

#[tauri::command]
fn update_repository(
    state: State<'_, AppStateData>,
    input: UpdateRepositoryInput,
) -> AppResult<Repository> {
    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    let repo = store
        .repositories
        .iter_mut()
        .find(|repo| repo.id == input.id)
        .ok_or_else(|| "仓库不存在".to_string())?;

    repo.project_name = normalize_optional(input.project_name);
    if input.selected_branch.is_some() {
        repo.selected_branch = input.selected_branch;
    }
    if let Some(sort_order) = input.sort_order {
        repo.sort_order = sort_order;
    }

    let updated = repo.clone();
    save_store(&state.store_path, &store)?;
    Ok(updated)
}

#[tauri::command]
fn remove_repository(state: State<'_, AppStateData>, id: String) -> AppResult<()> {
    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    let repo = store
        .repositories
        .iter()
        .find(|repo| repo.id == id)
        .cloned()
        .ok_or_else(|| "仓库不存在".to_string())?;
    store.repositories.retain(|repo| repo.id != id);
    store.reports.retain(|report| report.repository_id != id);
    save_store(&state.store_path, &store)?;

    let path = PathBuf::from(repo.local_path);
    if path.starts_with(&state.repos_dir) && path.exists() {
        fs::remove_dir_all(path).map_err(|err| format!("删除本地仓库失败: {err}"))?;
    }
    Ok(())
}

#[tauri::command]
fn refresh_repository(state: State<'_, AppStateData>, id: String) -> AppResult<Repository> {
    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    let repo = store
        .repositories
        .iter_mut()
        .find(|repo| repo.id == id)
        .ok_or_else(|| "仓库不存在".to_string())?;
    let path = PathBuf::from(&repo.local_path);
    run_git(Some(&path), &["fetch", "--all", "--prune"])?;
    repo.last_sync_at = Some(now_iso());
    let updated = repo.clone();
    save_store(&state.store_path, &store)?;
    Ok(updated)
}

#[tauri::command]
fn list_branches(state: State<'_, AppStateData>, repository_id: String) -> AppResult<Vec<BranchInfo>> {
    let repo = get_repository(&state, &repository_id)?;
    let path = PathBuf::from(repo.local_path);
    let current = git_current_branch(&path).unwrap_or_default();
    let output = run_git(
        Some(&path),
        &["branch", "--all", "--format=%(refname:short)"],
    )?;
    let mut seen = BTreeMap::<String, bool>::new();
    for raw in output.lines() {
        let mut name = raw.trim().to_string();
        if name.is_empty() || name.contains("HEAD ->") {
            continue;
        }
        if let Some(stripped) = name.strip_prefix("origin/") {
            name = stripped.to_string();
        }
        if let Some(stripped) = name.strip_prefix("remotes/origin/") {
            name = stripped.to_string();
        }
        seen.entry(name.clone()).or_insert(name == current);
    }
    Ok(seen
        .into_iter()
        .map(|(name, is_current)| BranchInfo { name, is_current })
        .collect())
}

#[tauri::command]
fn list_authors(state: State<'_, AppStateData>, repository_id: String) -> AppResult<Vec<String>> {
    let repo = get_repository(&state, &repository_id)?;
    let path = PathBuf::from(repo.local_path);
    let output = run_git(Some(&path), &["log", "--format=%an <%ae>", "--all"])?;
    let mut counts = HashMap::<String, usize>::new();
    for author in output.lines().map(str::trim).filter(|line| !line.is_empty()) {
        *counts.entry(author.to_string()).or_insert(0) += 1;
    }
    let mut authors: Vec<_> = counts.into_iter().collect();
    authors.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    Ok(authors.into_iter().map(|(author, _)| author).collect())
}

#[tauri::command]
async fn generate_report(
    state: State<'_, AppStateData>,
    input: GenerateReportInput,
) -> AppResult<ReportRecord> {
    let (repo, model) = {
        let store = state.store.lock().map_err(|_| "store lock poisoned")?;
        let repo = store
            .repositories
            .iter()
            .find(|repo| repo.id == input.repository_id)
            .cloned()
            .ok_or_else(|| "仓库不存在".to_string())?;
        let model = input
            .model_id
            .as_ref()
            .and_then(|id| store.model_configs.iter().find(|model| &model.id == id).cloned());
        (repo, model)
    };

    if input.generation_mode == GenerationMode::Ai && model.is_none() {
        return Err("AI 生成需要先选择模型配置".into());
    }

    let path = PathBuf::from(&repo.local_path);
    checkout_branch(&path, &input.branch)?;
    let mut commits = git_commits(
        &path,
        &input.branch,
        input.authors.as_deref(),
        &input.start_at,
        &input.end_at,
    )?;

    if input.generation_mode == GenerationMode::Ai
        || input
            .duration
            .map(|duration| duration.enabled && duration.strategy == DurationStrategy::AiEstimate)
            .unwrap_or(false)
    {
        for commit in &mut commits {
            commit.diff = Some(git_commit_diff(&path, &commit.hash)?);
        }
    }

    let text = match input.generation_mode {
        GenerationMode::Message => generate_message_report(&repo, &input, &commits),
        GenerationMode::Ai if commits.is_empty() => generate_message_report(&repo, &input, &commits),
        GenerationMode::Ai => {
            let model = model.ok_or_else(|| "AI 生成需要先选择模型配置".to_string())?;
            generate_ai_report(&repo, &input, &commits, &model)
                .await
                .unwrap_or_else(|err| {
                    let fallback = generate_message_report(&repo, &input, &commits);
                    format!("{fallback}\n\nAI 生成失败，已保留 message 模式结果。\n失败原因：{err}")
                })
        }
    };

    let report = ReportRecord {
        id: Uuid::new_v4().to_string(),
        repository_id: repo.id.clone(),
        repository_name: repo.name.clone(),
        project_name: repo.project_name.clone(),
        branch: input.branch.clone(),
        author: input.authors.as_ref().map(|authors| authors.join(", ")),
        start_at: input.start_at.clone(),
        end_at: input.end_at.clone(),
        generation_mode: input.generation_mode,
        duration: input.duration,
        commits,
        text,
        created_at: now_iso(),
    };

    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    store.reports.insert(0, report.clone());
    save_store(&state.store_path, &store)?;
    Ok(report)
}

#[tauri::command]
fn save_model_config(
    state: State<'_, AppStateData>,
    input: SaveModelInput,
) -> AppResult<ModelConfigPublic> {
    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let config = ModelConfig {
        id: id.clone(),
        name: required(input.name, "模型名称")?,
        base_url: required(input.base_url, "Base URL")?,
        api_key: input.api_key,
        model: required(input.model, "模型名")?,
        created_at: now_iso(),
    };

    if let Some(existing) = store.model_configs.iter_mut().find(|model| model.id == id) {
        *existing = config.clone();
    } else {
        store.model_configs.push(config.clone());
    }
    save_store(&state.store_path, &store)?;
    Ok(public_model(&config))
}

#[tauri::command]
fn delete_model_config(state: State<'_, AppStateData>, id: String) -> AppResult<()> {
    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    store.model_configs.retain(|model| model.id != id);
    save_store(&state.store_path, &store)?;
    Ok(())
}

#[tauri::command]
fn update_settings(state: State<'_, AppStateData>, settings: AppSettings) -> AppResult<AppSettings> {
    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    store.settings = settings.clone();
    save_store(&state.store_path, &store)?;
    Ok(settings)
}

#[tauri::command]
fn delete_report(state: State<'_, AppStateData>, id: String) -> AppResult<()> {
    let mut store = state.store.lock().map_err(|_| "store lock poisoned")?;
    store.reports.retain(|report| report.id != id);
    save_store(&state.store_path, &store)?;
    Ok(())
}

#[tauri::command]
fn check_update_status(_app: AppHandle) -> UpdateStatus {
    UpdateStatus {
        configured: false,
        message: "当前版本仅支持检查是否有新版本，实际更新请前往 Git 仓库或 Release 页面处理。".to_string(),
    }
}

fn load_store(path: &Path) -> AppResult<AppStore> {
    if !path.exists() {
        return Ok(AppStore::default());
    }
    let content = fs::read_to_string(path).map_err(|err| format!("读取配置失败: {err}"))?;
    serde_json::from_str(&content).map_err(|err| format!("解析配置失败: {err}"))
}

fn save_store(path: &Path, store: &AppStore) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建配置目录失败: {err}"))?;
    }
    let content = serde_json::to_string_pretty(store).map_err(|err| format!("序列化配置失败: {err}"))?;
    fs::write(path, content).map_err(|err| format!("保存配置失败: {err}"))
}

fn sorted_repositories(repositories: &[Repository]) -> Vec<Repository> {
    let mut repos = repositories.to_vec();
    repos.sort_by(|a, b| a.sort_order.cmp(&b.sort_order).then_with(|| a.name.cmp(&b.name)));
    repos
}

fn public_models(models: &[ModelConfig]) -> Vec<ModelConfigPublic> {
    models.iter().map(public_model).collect()
}

fn public_model(model: &ModelConfig) -> ModelConfigPublic {
    ModelConfigPublic {
        id: model.id.clone(),
        name: model.name.clone(),
        base_url: model.base_url.clone(),
        api_key: model.api_key.clone(),
        model: model.model.clone(),
        created_at: model.created_at.clone(),
    }
}

fn get_repository(state: &State<'_, AppStateData>, repository_id: &str) -> AppResult<Repository> {
    let store = state.store.lock().map_err(|_| "store lock poisoned")?;
    store
        .repositories
        .iter()
        .find(|repo| repo.id == repository_id)
        .cloned()
        .ok_or_else(|| "仓库不存在".to_string())
}

fn read_default_author() -> DefaultAuthor {
    DefaultAuthor {
        name: run_git(None, &["config", "--global", "user.name"]).ok().map(trim_owned),
        email: run_git(None, &["config", "--global", "user.email"]).ok().map(trim_owned),
    }
}

fn run_git(cwd: Option<&Path>, args: &[&str]) -> AppResult<String> {
    let mut command = Command::new("git");
    command.args(args);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let output = command
        .output()
        .map_err(|err| format!("无法执行 git 命令，请确认已安装 Git: {err}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if stderr.is_empty() { stdout } else { stderr };
        Err(format!(
            "Git 命令失败：git {}\n\n{}\n\n私有仓库请确认本机 SSH key、系统凭据或仓库 URL 有访问权限。",
            args.join(" "),
            detail
        ))
    }
}

fn checkout_branch(path: &Path, branch: &str) -> AppResult<()> {
    run_git(Some(path), &["checkout", branch]).map(|_| ())
}

fn git_current_branch(path: &Path) -> AppResult<String> {
    run_git(Some(path), &["branch", "--show-current"]).map(trim_owned)
}

fn git_commits(
    path: &Path,
    branch: &str,
    authors: Option<&[String]>,
    start_at: &str,
    end_at: &str,
) -> AppResult<Vec<CommitInfo>> {
    let start_at = normalize_git_datetime(start_at)?;
    let end_at = normalize_git_datetime(end_at)?;
    let mut owned_args = vec![
        "log".to_string(),
        branch.to_string(),
        "--date=iso-strict".to_string(),
        "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s%x1f%b%x1e".to_string(),
        format!("--since={start_at}"),
        format!("--until={end_at}"),
    ];
    if let Some(authors) = authors {
        for author in authors.iter().map(|value| value.trim()).filter(|value| !value.is_empty()) {
            owned_args.push(format!("--author={author}"));
        }
    }
    let args: Vec<&str> = owned_args.iter().map(String::as_str).collect();
    let output = run_git(Some(path), &args)?;
    let mut commits = Vec::new();
    for record in output.split('\x1e') {
        let record = record.trim_matches(['\n', '\r']);
        if record.is_empty() {
            continue;
        }
        let parts: Vec<&str> = record.splitn(7, '\x1f').collect();
        if parts.len() < 7 {
            continue;
        }
        commits.push(CommitInfo {
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            author_name: parts[2].to_string(),
            author_email: parts[3].to_string(),
            date: parts[4].to_string(),
            subject: parts[5].to_string(),
            body: parts[6].trim().to_string(),
            diff: None,
        });
    }
    commits.reverse();
    Ok(commits)
}

fn git_commit_diff(path: &Path, hash: &str) -> AppResult<String> {
    let diff = run_git(
        Some(path),
        &["show", "--format=", "--find-renames", "--find-copies", "--stat", "--patch", hash],
    )?;
    const MAX_DIFF_CHARS: usize = 24_000;
    if diff.chars().count() > MAX_DIFF_CHARS {
        let truncated: String = diff.chars().take(MAX_DIFF_CHARS).collect();
        Ok(format!("{truncated}\n\n[diff 已截断，仅发送前 {MAX_DIFF_CHARS} 字符]"))
    } else {
        Ok(diff)
    }
}

fn generate_message_report(
    repo: &Repository,
    input: &GenerateReportInput,
    commits: &[CommitInfo],
) -> String {
    if commits.is_empty() {
        return format!(
            "{}：{} 至 {} 暂无匹配提交。",
            report_title(repo, &input.branch),
            input.start_at,
            input.end_at
        );
    }

    let mut grouped: BTreeMap<&'static str, Vec<&CommitInfo>> = BTreeMap::new();
    for commit in commits {
        grouped.entry(classify_commit(&commit.subject)).or_default().push(commit);
    }

    let allocations = allocate_durations(input.duration, &grouped);
    let mut lines = Vec::new();
    let mut item_number = 1;
    for (category, items) in grouped {
        for (index, commit) in items.iter().enumerate() {
            let summary = clean_commit_subject(&commit.subject);
            let duration = allocations
                .get(&(category.to_string(), index))
                .map(|hours| format!("（{hours:.1}小时）"))
                .unwrap_or_default();
            lines.push(format!("{item_number}. {category}：{summary}{duration}"));
            item_number += 1;
        }
    }
    lines.join("\n")
}

fn allocate_durations(
    options: Option<DurationOptions>,
    grouped: &BTreeMap<&'static str, Vec<&CommitInfo>>,
) -> HashMap<(String, usize), f32> {
    let Some(options) = options else {
        return HashMap::new();
    };
    if !options.enabled || options.total_hours <= 0.0 {
        return HashMap::new();
    }

    let total_items: usize = grouped.values().map(Vec::len).sum();
    if total_items == 0 {
        return HashMap::new();
    }

    let mut allocations = HashMap::new();
    let hours = round_half(options.total_hours / total_items as f32);
    for (category, items) in grouped {
        for index in 0..items.len() {
            allocations.insert((category.to_string(), index), hours.max(0.5));
        }
    }
    allocations
}

async fn generate_ai_report(
    repo: &Repository,
    input: &GenerateReportInput,
    commits: &[CommitInfo],
    model: &ModelConfig,
) -> AppResult<String> {
    let client = reqwest::Client::new();
    let endpoint = format!("{}/chat/completions", model.base_url.trim_end_matches('/'));
    let payload = serde_json::json!({
        "model": model.model,
        "messages": [
            {
                "role": "system",
                "content": "你是一个中文研发日报助手。只输出工作内容，不输出寒暄。输出必须是阿拉伯数字编号列表，每条以“1.”、“2.”这类数字编号开头并独占一行。不要输出 Markdown 横线列表符号、表格、代码块、分类标题或仓库标题。不要出现仓库地址、代码仓库链接、提交链接、PR 链接、Issue 链接或任何 URL。如果用户要求工时，则把工时写在对应条目末尾。只能根据提供的提交记录和 diff 编写日报，不能模拟、补写、扩展或编造没有依据的工作内容；如果没有指定时间内的提交记录，不生成日报条目。"
            },
            {
                "role": "user",
                "content": build_ai_prompt(repo, input, commits)
            }
        ],
        "temperature": 0.2
    });
    let response: serde_json::Value = client
        .post(endpoint)
        .bearer_auth(&model.api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|err| format!("请求模型失败: {err}"))?
        .error_for_status()
        .map_err(|err| format!("模型服务返回错误: {err}"))?
        .json()
        .await
        .map_err(|err| format!("解析模型响应失败: {err}"))?;
    response["choices"][0]["message"]["content"]
        .as_str()
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "模型响应为空".to_string())
}

fn build_ai_prompt(repo: &Repository, input: &GenerateReportInput, commits: &[CommitInfo]) -> String {
    let mut prompt = String::new();
    if let Some(custom_prompt) = input
        .custom_prompt
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        prompt.push_str("最高优先级要求：\n");
        prompt.push_str(custom_prompt);
        prompt.push_str("\n\n");
    }
    prompt.push_str(&format!("标题：{}\n", report_title(repo, &input.branch)));
    prompt.push_str(&format!("时间区间：{} 至 {}\n", input.start_at, input.end_at));
    if let Some(authors) = input.authors.as_ref().filter(|authors| !authors.is_empty()) {
        prompt.push_str(&format!("提交者：{}\n", authors.join("、")));
    }
    if let Some(duration) = input.duration.filter(|duration| duration.enabled) {
        prompt.push_str(&format!(
            "请把总工时 {:.1} 小时按 {:?} 策略分配到工作条目。\n",
            duration.total_hours, duration.strategy
        ));
    }
    prompt.push_str("输出格式要求：\n");
    prompt.push_str("1. 必须使用阿拉伯数字编号开头，例如“1.”、“2.”、“3.”。\n");
    prompt.push_str("2. 每条内容单独一行，垂直排列，不要在同一行塞入多条内容。\n");
    prompt.push_str("3. 不要输出仓库地址、代码仓库相关链接、提交链接、PR 链接、Issue 链接或任何 URL。\n");
    prompt.push_str("4. 直接输出可复制的日报正文，不要附加说明、总结、前言或标题解释。\n");
    prompt.push_str("5. 不要使用“-”、“*”、“•”等横线或符号列表，不要输出 Markdown 列表。\n");
    prompt.push_str("6. 不要输出仓库标题、分类标题或小标题，只输出数字编号条目。\n");
    prompt.push_str("7. 只允许根据下面提供的提交记录和 diff 生成内容；没有证据的工作不要模拟、不要猜测、不要编造。\n");
    prompt.push_str("8. 如果没有指定时间内的提交记录，不需要生成任何日报条目。\n");
    prompt.push_str("提交记录和 diff：\n");
    for commit in commits {
        prompt.push_str(&format!(
            "\nCommit {} {} <{}>\nMessage: {}\n{}\nDiff:\n{}\n",
            commit.short_hash,
            commit.author_name,
            commit.author_email,
            commit.subject,
            commit.body,
            commit.diff.as_deref().unwrap_or("")
        ));
    }
    prompt
}

fn classify_commit(subject: &str) -> &'static str {
    let lower = subject.trim().to_lowercase();
    let subject = lower.as_str();
    if subject.starts_with("feat") || subject.starts_with("feature") || subject.starts_with("开发") {
        "开发"
    } else if subject.starts_with("fix") || subject.starts_with("bug") || subject.starts_with("修复") {
        "修复"
    } else if subject.starts_with("perf")
        || subject.starts_with("refactor")
        || subject.starts_with("optimize")
        || subject.starts_with("优化")
        || subject.starts_with("重构")
    {
        "优化"
    } else if subject.starts_with("test") || subject.starts_with("测试") {
        "测试"
    } else if subject.starts_with("docs") || subject.starts_with("doc") || subject.starts_with("文档") {
        "文档"
    } else {
        "其他工作"
    }
}

fn clean_commit_subject(subject: &str) -> String {
    let trimmed = subject.trim();
    let separators = [": ", "：", " - ", "- "];
    for separator in separators {
        if let Some((prefix, rest)) = trimmed.split_once(separator) {
            let prefix_lower = prefix.to_lowercase();
            if matches!(
                prefix_lower.as_str(),
                "feat" | "feature" | "fix" | "bug" | "perf" | "refactor" | "optimize" | "test" | "docs" | "doc" | "chore"
            ) || ["开发", "修复", "优化", "重构", "测试", "文档"].contains(&prefix)
            {
                return rest.trim().to_string();
            }
        }
    }
    trimmed.to_string()
}

fn report_title(repo: &Repository, branch: &str) -> String {
    match repo.project_name.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        Some(project_name) => project_name.to_string(),
        None => format!("{} ({branch})", repo.name),
    }
}

fn infer_repo_name(url: &str) -> String {
    let last = url
        .trim_end_matches('/')
        .rsplit(['/', ':'])
        .next()
        .unwrap_or("repository");
    last.strip_suffix(".git").unwrap_or(last).to_string()
}

fn stable_repo_id(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    sanitize_filename::sanitize(format!("{}-{}", infer_repo_name(url), &hash[..12]))
}

fn next_sort_order(repositories: &[Repository]) -> i64 {
    repositories.iter().map(|repo| repo.sort_order).max().unwrap_or(0) + 1
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn path_to_str(path: &Path) -> AppResult<&str> {
    path.to_str().ok_or_else(|| "路径包含无效字符".to_string())
}

fn trim_owned(value: String) -> String {
    value.trim().to_string()
}

fn required(value: String, label: &str) -> AppResult<String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(format!("{label}不能为空"))
    } else {
        Ok(value)
    }
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn round_half(value: f32) -> f32 {
    (value * 2.0).round() / 2.0
}

fn normalize_git_datetime(value: &str) -> AppResult<String> {
    let parsed = DateTime::parse_from_rfc3339(value)
        .map_err(|err| format!("时间格式无效：{err}"))?
        .with_timezone(&Local);
    Ok(parsed.format("%Y-%m-%d %H:%M:%S %z").to_string())
}

#[allow(dead_code)]
fn local_day_bounds(date: NaiveDate) -> (String, String) {
    let start = Local
        .from_local_datetime(&date.and_hms_opt(0, 0, 0).expect("valid start time"))
        .single()
        .unwrap();
    let end = Local::now();
    (DateTime::<Utc>::from(start).to_rfc3339(), end.to_rfc3339())
}
