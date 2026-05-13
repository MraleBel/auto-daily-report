import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  CalendarBlank,
  CheckCircle,
  ClipboardText,
  Clock,
  Copy,
  DownloadSimple,
  Eye,
  EyeSlash,
  GitBranch,
  GitPullRequest,
  HardDrives,
  Key,
  Lightning,
  Plus,
  Sparkle,
  Trash,
  User,
} from "@phosphor-icons/react";
import { tauriClient } from "./api/tauriClient";
import type {
  AppSettings,
  BranchInfo,
  DurationOptions,
  DurationStrategy,
  GenerateReportInput,
  GenerationMode,
  ModelConfig,
  Repository,
  ReportRecord,
  UpdaterResult,
} from "./types";

type ViewKey = "generate" | "history" | "settings";
type BusyMap = Record<string, boolean>;

const emptySettings: AppSettings = {
  defaultWorkHours: 8,
  defaultGenerationMode: "message",
  confirmAiDiffUpload: true,
};

const defaultDuration: DurationOptions = {
  enabled: false,
  totalHours: 8,
  strategy: "equal",
};

const emptyModelForm = {
  id: "",
  name: "",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

function todayStartLocal() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return toDatetimeLocal(date);
}

function toDatetimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

export default function App() {
  const [view, setView] = useState<ViewKey>("generate");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoProjectName, setRepoProjectName] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [author, setAuthor] = useState("");
  const [startAt, setStartAt] = useState(todayStartLocal);
  const [endAt, setEndAt] = useState(() => toDatetimeLocal(new Date()));
  const [generationMode, setGenerationMode] = useState<GenerationMode>("message");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [duration, setDuration] = useState<DurationOptions>(defaultDuration);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<BusyMap>({});
  const [copied, setCopied] = useState("");
  const [modelForm, setModelForm] = useState(emptyModelForm);
  const [showApiKey, setShowApiKey] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<UpdaterResult | null>(null);

  const selectedRepo = useMemo(
    () => repositories.find((repo) => repo.id === selectedRepoId) ?? repositories[0],
    [repositories, selectedRepoId],
  );

  const reportByRepo = useMemo(() => {
    return new Map(reports.map((report) => [report.repositoryId, report]));
  }, [reports]);

  const orderedReports = useMemo(() => {
    return repositories
      .map((repo) => reportByRepo.get(repo.id))
      .filter((report): report is ReportRecord => Boolean(report));
  }, [repositories, reportByRepo]);

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    if (!selectedRepo) {
      setSelectedRepoId("");
      setSelectedBranch("");
      setBranches([]);
      setAuthors([]);
      return;
    }

    setSelectedRepoId(selectedRepo.id);
    setSelectedBranch(selectedRepo.selectedBranch ?? selectedRepo.defaultBranch ?? "");
    setRepoProjectName(selectedRepo.projectName ?? "");
    void loadRepoMetadata(selectedRepo.id);
  }, [selectedRepo?.id]);

  async function loadSnapshot() {
    setError("");
    try {
      const snapshot = await tauriClient.getSnapshot();
      setRepositories(snapshot.repositories);
      setModels(snapshot.modelConfigs);
      setSettings(snapshot.settings);
      setGenerationMode(snapshot.settings.defaultGenerationMode);
      setDuration((current) => ({
        ...current,
        totalHours: snapshot.settings.defaultWorkHours,
      }));
      setReports(snapshot.reports);
      setSelectedRepoId(snapshot.repositories[0]?.id ?? "");
      const gitAuthor = [snapshot.defaultAuthor.name, snapshot.defaultAuthor.email ? `<${snapshot.defaultAuthor.email}>` : ""]
        .filter(Boolean)
        .join(" ");
      setAuthor(gitAuthor);
      setSelectedModelId(snapshot.modelConfigs[0]?.id ?? "");
      await checkUpdate();
    } catch (caught) {
      setError(readError(caught));
    }
  }

  async function loadRepoMetadata(repositoryId: string) {
    try {
      const [nextBranches, nextAuthors] = await Promise.all([
        tauriClient.listBranches(repositoryId),
        tauriClient.listAuthors(repositoryId),
      ]);
      setBranches(nextBranches);
      setAuthors(nextAuthors);
      setSelectedBranch((current) => current || nextBranches[0]?.name || "");
    } catch (caught) {
      setError(readError(caught));
    }
  }

  async function addRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyFlag("add-repo", true);
    setError("");
    try {
      const repo = await tauriClient.addRepository({
        url: repoUrl,
        projectName: repoProjectName,
      });
      setRepositories((current) => [...current, repo].sort((a, b) => a.sortOrder - b.sortOrder));
      setSelectedRepoId(repo.id);
      setRepoUrl("");
      setMessage("仓库已添加并托管到应用数据目录。");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("add-repo", false);
    }
  }

  async function saveSelectedRepo() {
    if (!selectedRepo) {
      return;
    }
    setBusyFlag("repo-save", true);
    try {
      const updated = await tauriClient.updateRepository({
        id: selectedRepo.id,
        projectName: repoProjectName,
        selectedBranch,
      });
      setRepositories((current) => current.map((repo) => (repo.id === updated.id ? updated : repo)));
      setMessage("仓库设置已保存。");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("repo-save", false);
    }
  }

  async function refreshSelectedRepo(repo = selectedRepo) {
    if (!repo) {
      return;
    }
    setBusyFlag(`refresh-${repo.id}`, true);
    setError("");
    try {
      const updated = await tauriClient.refreshRepository(repo.id);
      setRepositories((current) => current.map((item) => (item.id === repo.id ? updated : item)));
      await loadRepoMetadata(repo.id);
      setMessage(`${updated.name} 已刷新。`);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag(`refresh-${repo.id}`, false);
    }
  }

  async function removeRepository(repo: Repository) {
    setBusyFlag(`remove-${repo.id}`, true);
    try {
      await tauriClient.removeRepository(repo.id);
      setRepositories((current) => current.filter((item) => item.id !== repo.id));
      setReports((current) => current.filter((report) => report.repositoryId !== repo.id));
      setMessage(`${repo.name} 已移除。`);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag(`remove-${repo.id}`, false);
    }
  }

  function makeGenerateInput(repo: Repository): GenerateReportInput {
    const branch = repo.id === selectedRepo?.id ? selectedBranch : repo.selectedBranch ?? repo.defaultBranch ?? selectedBranch;
    return {
      repositoryId: repo.id,
      branch,
      author: author.trim() || undefined,
      startAt: localInputToIso(startAt),
      endAt: localInputToIso(endAt),
      generationMode,
      modelId: generationMode === "ai" ? selectedModelId : undefined,
      duration: duration.enabled ? duration : undefined,
    };
  }

  async function generateForRepo(repo: Repository) {
    if (generationMode === "ai" && !selectedModelId) {
      setError("AI 生成需要先在设置中保存并选择一个模型。");
      return;
    }
    if (generationMode === "ai" && settings.confirmAiDiffUpload) {
      const ok = window.confirm("AI 模式会把 commit message 和相关 diff 发送到你选择的模型服务，是否继续？");
      if (!ok) {
        return;
      }
    }

    setBusyFlag(`generate-${repo.id}`, true);
    setError("");
    try {
      const report = await tauriClient.generateReport(makeGenerateInput(repo));
      setReports((current) => [report, ...current.filter((item) => item.repositoryId !== repo.id)]);
      setMessage(`${repo.name} 日报已生成。`);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag(`generate-${repo.id}`, false);
    }
  }

  async function generateBatch() {
    for (const repo of repositories) {
      await generateForRepo(repo);
    }
  }

  function summarizeReports() {
    const text = orderedReports.map((report) => report.text).join("\n\n");
    setSummary(text);
    if (!text) {
      setMessage("还没有可汇总的仓库日报。");
    }
  }

  async function copyText(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1400);
  }

  async function saveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyFlag("model-save", true);
    try {
      const saved = await tauriClient.saveModelConfig({
        id: modelForm.id || undefined,
        name: modelForm.name,
        baseUrl: modelForm.baseUrl,
        apiKey: modelForm.apiKey,
        model: modelForm.model,
      });
      setModels((current) => {
        const exists = current.some((model) => model.id === saved.id);
        return exists ? current.map((model) => (model.id === saved.id ? saved : model)) : [saved, ...current];
      });
      setSelectedModelId(saved.id);
      setModelForm(emptyModelForm);
      setMessage("模型配置已保存。");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("model-save", false);
    }
  }

  async function deleteModel(id: string) {
    await tauriClient.deleteModelConfig(id);
    setModels((current) => current.filter((model) => model.id !== id));
    if (selectedModelId === id) {
      setSelectedModelId("");
    }
  }

  async function saveSettings(nextSettings = settings) {
    try {
      const saved = await tauriClient.updateSettings(nextSettings);
      setSettings(saved);
      setMessage("设置已保存。");
    } catch (caught) {
      setError(readError(caught));
    }
  }

  async function checkUpdate() {
    try {
      const [status, update] = await Promise.all([
        tauriClient.checkUpdateStatus(),
        tauriClient.checkForAppUpdate().catch(() => ({ available: false })),
      ]);
      setUpdateStatus(status.message);
      setAvailableUpdate(update);
    } catch (caught) {
      setUpdateStatus(readError(caught));
    }
  }

  async function installUpdate() {
    setBusyFlag("install-update", true);
    try {
      await tauriClient.installAppUpdate();
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("install-update", false);
    }
  }

  function setBusyFlag(key: string, value: boolean) {
    setBusy((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            AD
          </div>
          <div>
            <p className="eyebrow">Auto Daily Report</p>
            <h1>日报工作台</h1>
          </div>
        </div>

        <nav className="view-tabs" aria-label="Main navigation">
          <button className={view === "generate" ? "active" : ""} onClick={() => setView("generate")}>
            <ClipboardText size={18} weight="duotone" />
            生成
          </button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            <Clock size={18} weight="duotone" />
            历史
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <Key size={18} weight="duotone" />
            设置
          </button>
        </nav>

        <form className="quick-add" onSubmit={addRepository}>
          <div>
            <p className="eyebrow">托管仓库</p>
            <h2>添加远程仓库</h2>
          </div>
          <Field label="Git URL" value={repoUrl} onChange={setRepoUrl} placeholder="git@github.com:org/repo.git" required />
          <Field label="项目名称" value={repoProjectName} onChange={setRepoProjectName} placeholder="不填则使用仓库名 + 分支" />
          <button className="primary-button full-width" disabled={busy["add-repo"]}>
            <Plus size={17} weight="bold" />
            {busy["add-repo"] ? "正在克隆" : "添加仓库"}
          </button>
        </form>

        <section className="repo-list-wrap">
          <div className="repo-list-header">
            <span>仓库列表</span>
            <button className="icon-button" onClick={() => selectedRepo && refreshSelectedRepo(selectedRepo)} aria-label="Refresh selected repository">
              <ArrowsClockwise size={16} weight="bold" />
            </button>
          </div>
          <div className="repo-list">
            {repositories.length === 0 ? (
              <div className="empty-mini">先添加一个可访问的 Git 仓库。</div>
            ) : (
              repositories.map((repo) => (
                <button
                  key={repo.id}
                  className={`repo-row ${repo.id === selectedRepo?.id ? "selected" : ""}`}
                  onClick={() => setSelectedRepoId(repo.id)}
                >
                  <GitPullRequest size={17} weight="duotone" />
                  <span>
                    <strong>{repo.projectName || repo.name}</strong>
                    <small>{repo.selectedBranch || repo.defaultBranch || "no branch"}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className={`update-panel ${availableUpdate?.available ? "available" : ""}`}>
          <p className="eyebrow">应用更新</p>
          <h2>{availableUpdate?.available ? `发现 ${availableUpdate.version}` : "当前版本可用"}</h2>
          <p>{availableUpdate?.body || updateStatus || "更新检查会在桌面应用中启用。"}</p>
          <div className="split-actions compact">
            <button className="ghost-button" onClick={checkUpdate}>
              <ArrowsClockwise size={16} />
              检查
            </button>
            {availableUpdate?.available && (
              <button className="primary-button" onClick={installUpdate} disabled={busy["install-update"]}>
                <DownloadSimple size={16} />
                更新并重启
              </button>
            )}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Desktop Git Reporter</p>
            <h2>{view === "generate" ? "按仓库生成日报" : view === "history" ? "历史日报" : "模型与偏好"}</h2>
          </div>
          <div className="topbar-actions">
            <Metric label="仓库" value={repositories.length.toString()} />
            <Metric label="报告" value={reports.length.toString()} />
            <button className="primary-button" onClick={generateBatch} disabled={repositories.length === 0}>
              <Lightning size={17} weight="bold" />
              批量生成
            </button>
          </div>
        </header>

        {error && <div className="notice error">{error}</div>}
        {message && <div className="notice success">{message}</div>}

        {view === "generate" && (
          <div className="report-grid">
            <section className="control-column">
              <section className="panel">
                <PanelTitle eyebrow="生成条件" title="仓库与范围" icon={<GitBranch size={20} weight="duotone" />} />
                {selectedRepo ? (
                  <div className="form-stack">
                    <Field label="项目名称" value={repoProjectName} onChange={setRepoProjectName} placeholder={selectedRepo.name} />
                    <label className="field">
                      <span>分支</span>
                      <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>
                        {[selectedBranch, ...branches.map((branch) => branch.name)]
                          .filter(Boolean)
                          .filter((branch, index, all) => all.indexOf(branch) === index)
                          .map((branch) => (
                            <option key={branch} value={branch}>
                              {branch}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>提交者</span>
                      <input list="authors" value={author} onChange={(event) => setAuthor(event.target.value)} />
                      <datalist id="authors">
                        {authors.map((item) => (
                          <option key={item} value={item} />
                        ))}
                      </datalist>
                      <small>默认读取本机 Git user.name / user.email，可手动选择其他作者。</small>
                    </label>
                    <div className="field-grid">
                      <Field label="开始时间" type="datetime-local" value={startAt} onChange={setStartAt} />
                      <Field label="结束时间" type="datetime-local" value={endAt} onChange={setEndAt} />
                    </div>
                    <div className="split-actions">
                      <button className="ghost-button" onClick={saveSelectedRepo} disabled={busy["repo-save"]}>
                        <CheckCircle size={16} />
                        保存仓库设置
                      </button>
                      <button className="ghost-button" onClick={() => refreshSelectedRepo()} disabled={busy[`refresh-${selectedRepo.id}`]}>
                        <ArrowsClockwise size={16} />
                        刷新
                      </button>
                    </div>
                  </div>
                ) : (
                  <EmptyState title="还没有仓库" body="添加 Git URL 后，应用会在数据目录托管 clone，并读取分支与作者。" />
                )}
              </section>

              <section className="panel">
                <PanelTitle eyebrow="生成方式" title="Message 与 AI" icon={<Sparkle size={20} weight="duotone" />} />
                <div className="segmented">
                  <button className={generationMode === "message" ? "active" : ""} onClick={() => setGenerationMode("message")}>
                    Message
                  </button>
                  <button className={generationMode === "ai" ? "active" : ""} onClick={() => setGenerationMode("ai")}>
                    AI Diff
                  </button>
                </div>
                <label className="field">
                  <span>模型</span>
                  <select value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)} disabled={models.length === 0}>
                    <option value="">未选择</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} / {model.model}
                      </option>
                    ))}
                  </select>
                  <small>Message 模式不需要模型；AI 模式会发送 diff 到所选服务。</small>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={duration.enabled}
                    onChange={(event) => setDuration((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  一键时间格式化
                </label>
                {duration.enabled && (
                  <div className="duration-grid">
                    <label className="field">
                      <span>总工时</span>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={duration.totalHours}
                        onChange={(event) =>
                          setDuration((current) => ({ ...current, totalHours: Number(event.target.value) || settings.defaultWorkHours }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>分配策略</span>
                      <select
                        value={duration.strategy}
                        onChange={(event) => setDuration((current) => ({ ...current, strategy: event.target.value as DurationStrategy }))}
                      >
                        <option value="equal">按条目平均</option>
                        <option value="commitWeighted">按提交数加权</option>
                        <option value="aiEstimate">AI 估算</option>
                      </select>
                    </label>
                  </div>
                )}
              </section>
            </section>

            <section className="output-column">
              <div className="report-card-list">
                {repositories.length === 0 ? (
                  <EmptyState title="等待仓库" body="添加仓库后，每个仓库都会有独立生成按钮，也可以批量生成。" />
                ) : (
                  repositories.map((repo) => (
                    <ReportCard
                      key={repo.id}
                      repo={repo}
                      report={reportByRepo.get(repo.id)}
                      busy={busy[`generate-${repo.id}`]}
                      copied={copied === repo.id}
                      onGenerate={() => generateForRepo(repo)}
                      onCopy={(text) => copyText(repo.id, text)}
                      onRemove={() => removeRepository(repo)}
                    />
                  ))
                )}
              </div>

              <section className="panel summary-panel">
                <div className="panel-heading">
                  <PanelTitle eyebrow="一键汇总" title="按仓库顺序合并" icon={<Copy size={20} weight="duotone" />} />
                  <div className="split-actions compact">
                    <button className="ghost-button" onClick={summarizeReports} disabled={orderedReports.length === 0}>
                      汇总
                    </button>
                    <button className="ghost-button" disabled={!summary} onClick={() => copyText("summary", summary)}>
                      {copied === "summary" ? "已复制" : "复制"}
                    </button>
                  </div>
                </div>
                <pre className="plain-output">{summary || "生成多份日报后，点击汇总会按左侧仓库顺序排列到这里。"}</pre>
              </section>
            </section>
          </div>
        )}

        {view === "history" && <History reports={reports} copied={copied} onCopy={copyText} onDelete={deleteReport} />}

        {view === "settings" && (
          <Settings
            models={models}
            modelForm={modelForm}
            setModelForm={setModelForm}
            showApiKey={showApiKey}
            setShowApiKey={setShowApiKey}
            onSaveModel={saveModel}
            onEditModel={(model) => setModelForm(model)}
            onDeleteModel={deleteModel}
            settings={settings}
            onSettingsChange={setSettings}
            onSaveSettings={saveSettings}
            busy={busy["model-save"]}
          />
        )}
      </section>
    </main>
  );

  async function deleteReport(id: string) {
    await tauriClient.deleteReport(id);
    setReports((current) => current.filter((report) => report.id !== id));
  }
}

function ReportCard({
  repo,
  report,
  busy,
  copied,
  onGenerate,
  onCopy,
  onRemove,
}: {
  repo: Repository;
  report?: ReportRecord;
  busy?: boolean;
  copied: boolean;
  onGenerate: () => void;
  onCopy: (text: string) => void;
  onRemove: () => void;
}) {
  return (
    <article className="report-card">
      <div className="report-card-header">
        <div>
          <p className="eyebrow">{repo.url}</p>
          <h3>{repo.projectName || repo.name}</h3>
        </div>
        <span className="status-pill">{repo.selectedBranch || repo.defaultBranch || "branch"}</span>
      </div>
      {busy ? (
        <div className="skeleton-block" />
      ) : (
        <pre className="plain-output">{report?.text || "点击生成后，这里会出现可复制的纯文本日报。"}</pre>
      )}
      <div className="report-card-footer">
        <span>{report ? `${report.commits.length} commits / ${formatDateTime(report.createdAt)}` : repo.lastSyncAt ? `同步于 ${formatDateTime(repo.lastSyncAt)}` : "尚未生成"}</span>
        <div className="split-actions compact">
          <button className="ghost-button" onClick={onGenerate} disabled={busy}>
            <Lightning size={16} />
            {busy ? "生成中" : "生成"}
          </button>
          <button className="ghost-button" onClick={() => report && onCopy(report.text)} disabled={!report}>
            <Copy size={16} />
            {copied ? "已复制" : "复制"}
          </button>
          <button className="danger-button icon-only" onClick={onRemove} aria-label="Remove repository">
            <Trash size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

function History({
  reports,
  copied,
  onCopy,
  onDelete,
}: {
  reports: ReportRecord[];
  copied: string;
  onCopy: (key: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  if (reports.length === 0) {
    return <EmptyState title="暂无历史日报" body="每次生成的日报都会长期保存在本地，方便回看和复制。" />;
  }

  return (
    <section className="history-list">
      {reports.map((report) => (
        <article className="history-row" key={report.id}>
          <div>
            <p className="eyebrow">{formatDateTime(report.createdAt)}</p>
            <h3>{report.projectName || report.repositoryName}</h3>
            <p>{report.text.slice(0, 220)}</p>
          </div>
          <div className="split-actions compact">
            <button className="ghost-button" onClick={() => onCopy(report.id, report.text)}>
              <Copy size={16} />
              {copied === report.id ? "已复制" : "复制"}
            </button>
            <button className="danger-button icon-only" onClick={() => onDelete(report.id)} aria-label="Delete report">
              <Trash size={16} />
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function Settings({
  models,
  modelForm,
  setModelForm,
  showApiKey,
  setShowApiKey,
  onSaveModel,
  onEditModel,
  onDeleteModel,
  settings,
  onSettingsChange,
  onSaveSettings,
  busy,
}: {
  models: ModelConfig[];
  modelForm: typeof emptyModelForm;
  setModelForm: (form: typeof emptyModelForm) => void;
  showApiKey: boolean;
  setShowApiKey: (show: boolean) => void;
  onSaveModel: (event: FormEvent<HTMLFormElement>) => void;
  onEditModel: (model: ModelConfig) => void;
  onDeleteModel: (id: string) => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSaveSettings: (settings?: AppSettings) => void;
  busy?: boolean;
}) {
  return (
    <div className="settings-grid">
      <form className="panel form-stack" onSubmit={onSaveModel}>
        <PanelTitle eyebrow="模型管理" title="OpenAI-compatible" icon={<Key size={20} weight="duotone" />} />
        <Field label="配置名称" value={modelForm.name} onChange={(name) => setModelForm({ ...modelForm, name })} required />
        <Field label="Base URL" value={modelForm.baseUrl} onChange={(baseUrl) => setModelForm({ ...modelForm, baseUrl })} required />
        <Field label="模型名" value={modelForm.model} onChange={(model) => setModelForm({ ...modelForm, model })} required />
        <label className="field secret-field">
          <span>API Key</span>
          <div>
            <input
              type={showApiKey ? "text" : "password"}
              value={modelForm.apiKey}
              onChange={(event) => setModelForm({ ...modelForm, apiKey: event.target.value })}
            />
            <button type="button" className="icon-button" onClick={() => setShowApiKey(!showApiKey)} aria-label="Toggle API key visibility">
              {showApiKey ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small>MVP 简单本地保存，界面支持查看和修改。</small>
        </label>
        <button className="primary-button full-width" disabled={busy}>
          <CheckCircle size={17} />
          {modelForm.id ? "保存修改" : "保存模型"}
        </button>
      </form>

      <section className="panel">
        <PanelTitle eyebrow="已配置模型" title="模型列表" icon={<HardDrives size={20} weight="duotone" />} />
        <div className="model-list">
          {models.length === 0 ? (
            <div className="empty-mini">还没有模型配置。AI 模式需要至少一个模型。</div>
          ) : (
            models.map((model) => (
              <div className="model-row" key={model.id}>
                <div>
                  <strong>{model.name}</strong>
                  <small>
                    {model.model} / {model.baseUrl}
                  </small>
                </div>
                <div className="split-actions compact">
                  <button className="ghost-button" onClick={() => onEditModel(model)}>
                    编辑
                  </button>
                  <button className="danger-button icon-only" onClick={() => onDeleteModel(model.id)} aria-label="Delete model">
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <PanelTitle eyebrow="默认偏好" title="生成设置" icon={<CalendarBlank size={20} weight="duotone" />} />
        <div className="duration-grid">
          <label className="field">
            <span>默认工时</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={settings.defaultWorkHours}
              onChange={(event) => onSettingsChange({ ...settings, defaultWorkHours: Number(event.target.value) || 8 })}
            />
          </label>
          <label className="field">
            <span>默认生成方式</span>
            <select
              value={settings.defaultGenerationMode}
              onChange={(event) => onSettingsChange({ ...settings, defaultGenerationMode: event.target.value as GenerationMode })}
            >
              <option value="message">Message</option>
              <option value="ai">AI Diff</option>
            </select>
          </label>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.confirmAiDiffUpload}
            onChange={(event) => onSettingsChange({ ...settings, confirmAiDiffUpload: event.target.checked })}
          />
          AI 发送 diff 前提示确认
        </label>
        <button className="ghost-button" onClick={() => onSaveSettings(settings)}>
          保存偏好
        </button>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function PanelTitle({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ReactNode }) {
  return (
    <div className="panel-title">
      <span className="panel-icon">{icon}</span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="empty-state">
      <div className="empty-line" />
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
