import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowsClockwise,
  Check,
  ClipboardText,
  Clock,
  Copy,
  DotsSixVertical,
  Eye,
  EyeSlash,
  HardDrives,
  Key,
  Lightning,
  Plus,
  Sparkle,
  Trash,
  WarningCircle,
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
import brandLogo from "./assets/brand-logo.svg";
import packageJson from "../package.json";

type ViewKey = "generate" | "history" | "settings";
type BusyMap = Record<string, boolean>;
type TimeRangeMode = "shared" | "perRepository";
type DateRange = Pick<RepositoryDraft, "startAt" | "endAt">;

interface RepositoryDraft {
  projectName: string;
  selectedBranch: string;
  authors: string[];
  startAt: string;
  endAt: string;
}

interface UpdateUiState {
  checkedOnce: boolean;
  checking: boolean;
  available: UpdaterResult | null;
  message: string;
  showPopover: boolean;
}

interface ToastState {
  type: "success" | "info";
  text: string;
}

interface MultiSelectDropdownProps {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}

const emptySettings: AppSettings = {
  defaultWorkHours: 8,
  defaultGenerationMode: "message",
};

const defaultDuration: DurationOptions = {
  enabled: false,
  totalHours: 8,
  strategy: "equal",
};

const emptyModelForm = {
  id: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
};

const appVersion = packageJson.version;
const appRepositoryUrl = "https://github.com/MraleBel/auto-daily-report.git";

function todayStartLocal() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return toDatetimeLocal(date);
}

function todayEndLocal() {
  const date = new Date();
  date.setHours(23, 59, 0, 0);
  return toDatetimeLocal(date);
}

function toDatetimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateRange(startAt: string, endAt: string) {
  return `${formatDateInput(startAt)} 至 ${formatDateInput(endAt)}`;
}

function formatDateInput(value: string) {
  if (!value) {
    return "未选择";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.replace("T", " ");
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}年${pad(parsed.getMonth() + 1)}月${pad(parsed.getDate())}日 ${pad(parsed.getHours())}:${pad(
    parsed.getMinutes(),
  )}`;
}

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

function createDraft(repo: Repository, settings: AppSettings, defaultAuthor: string): RepositoryDraft {
  return {
    projectName: repo.projectName ?? "",
    selectedBranch: repo.selectedBranch ?? repo.defaultBranch ?? "",
    authors: defaultAuthor ? [defaultAuthor] : [],
    startAt: todayStartLocal(),
    endAt: todayEndLocal(),
  };
}

export default function App() {
  const [view, setView] = useState<ViewKey>("generate");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoProjectName, setRepoProjectName] = useState("");
  const [repoDrafts, setRepoDrafts] = useState<Record<string, RepositoryDraft>>({});
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([]);
  const [branchesByRepo, setBranchesByRepo] = useState<Record<string, BranchInfo[]>>({});
  const [authorsByRepo, setAuthorsByRepo] = useState<Record<string, string[]>>({});
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<BusyMap>({});
  const [copied, setCopied] = useState("");
  const [modelForm, setModelForm] = useState(emptyModelForm);
  const [showApiKey, setShowApiKey] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("message");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [timeRangeMode, setTimeRangeMode] = useState<TimeRangeMode>("shared");
  const [sharedDateRange, setSharedDateRange] = useState<DateRange>({
    startAt: todayStartLocal(),
    endAt: todayEndLocal(),
  });
  const [duration, setDuration] = useState<DurationOptions>(defaultDuration);
  const [customPrompt, setCustomPrompt] = useState("");
  const [sortingMode, setSortingMode] = useState(false);
  const [sortingOrder, setSortingOrder] = useState<string[]>([]);
  const [defaultAuthor, setDefaultAuthor] = useState("");
  const [updateUi, setUpdateUi] = useState<UpdateUiState>({
    checkedOnce: false,
    checking: false,
    available: null,
    message: "",
    showPopover: false,
  });
  const [toast, setToast] = useState<ToastState | null>(null);
  const updatePopoverRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const pointerSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const orderedRepositories = useMemo(() => {
    if (!sortingMode) {
      return repositories;
    }
    const mapped = new Map(repositories.map((repo) => [repo.id, repo]));
    return sortingOrder.map((id) => mapped.get(id)).filter((repo): repo is Repository => Boolean(repo));
  }, [repositories, sortingMode, sortingOrder]);

  const selectedRepositories = useMemo(
    () => orderedRepositories.filter((repo) => selectedRepoIds.includes(repo.id)),
    [orderedRepositories, selectedRepoIds],
  );

  const reportByRepo = useMemo(() => new Map(reports.map((report) => [report.repositoryId, report])), [reports]);

  const orderedReports = useMemo(
    () =>
      orderedRepositories.map((repo) => reportByRepo.get(repo.id)).filter((report): report is ReportRecord => Boolean(report)),
    [orderedRepositories, reportByRepo],
  );

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    if (!sortingMode) {
      setSortingOrder(repositories.map((repo) => repo.id));
    }
  }, [repositories, sortingMode]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!updatePopoverRef.current?.contains(event.target as Node)) {
        setUpdateUi((current) => ({ ...current, showPopover: false }));
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  async function loadSnapshot() {
    setError("");
    setBusyFlag("bootstrap", true);
    try {
      const snapshot = await tauriClient.getSnapshot();
      setRepositories(snapshot.repositories);
      setModels(snapshot.modelConfigs);
      setSettings(snapshot.settings);
      setReports(snapshot.reports);
      setGenerationMode(snapshot.settings.defaultGenerationMode);
      setDuration((current) => ({
        ...current,
        totalHours: snapshot.settings.defaultWorkHours,
      }));
      setSelectedModelId(snapshot.modelConfigs[0]?.id ?? "");
      const gitAuthor = [snapshot.defaultAuthor.name, snapshot.defaultAuthor.email ? `<${snapshot.defaultAuthor.email}>` : ""]
        .filter(Boolean)
        .join(" ");
      setDefaultAuthor(gitAuthor);
      setSelectedRepoIds(snapshot.repositories[0] ? [snapshot.repositories[0].id] : []);
      setRepoDrafts(
        Object.fromEntries(snapshot.repositories.map((repo) => [repo.id, createDraft(repo, snapshot.settings, gitAuthor)])),
      );
      await Promise.all(snapshot.repositories.map((repo) => loadRepoMetadata(repo.id)));
      await checkUpdate({ initial: true });
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("bootstrap", false);
    }
  }

  async function loadRepoMetadata(repositoryId: string) {
    try {
      const [nextBranches, nextAuthors] = await Promise.all([
        tauriClient.listBranches(repositoryId),
        tauriClient.listAuthors(repositoryId),
      ]);
      setBranchesByRepo((current) => ({ ...current, [repositoryId]: nextBranches }));
      setAuthorsByRepo((current) => ({ ...current, [repositoryId]: nextAuthors }));
      setRepoDrafts((current) => {
        const draft = current[repositoryId];
        if (!draft) {
          return current;
        }
        const nextAuthorsSelected =
          draft.authors.length > 0 ? draft.authors : [nextAuthors[0] || defaultAuthor].filter(Boolean);
        const nextBranch = draft.selectedBranch || nextBranches[0]?.name || "";
        return {
          ...current,
          [repositoryId]: {
            ...draft,
            authors: nextAuthorsSelected,
            selectedBranch: nextBranch,
          },
        };
      });
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
      setRepoDrafts((current) => ({
        ...current,
        [repo.id]: {
          ...createDraft(repo, settings, defaultAuthor),
          projectName: repo.projectName ?? repoProjectName,
        },
      }));
      setSelectedRepoIds((current) => Array.from(new Set([...current, repo.id])));
      setRepoUrl("");
      setRepoProjectName("");
      await loadRepoMetadata(repo.id);
      showToast("success", "仓库已添加。");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("add-repo", false);
    }
  }

  function toggleRepositorySelection(repoId: string) {
    if (sortingMode) {
      return;
    }

    setSelectedRepoIds((current) => {
      if (current.includes(repoId)) {
        return current.filter((id) => id !== repoId);
      }
      return [...current, repoId];
    });
  }

  async function persistRepoDraft(repoId: string, partial: Partial<RepositoryDraft>) {
    const draft = repoDrafts[repoId];
    const repo = repositories.find((item) => item.id === repoId);
    if (!draft || !repo) {
      return;
    }

    const nextDraft = { ...draft, ...partial };
    setRepoDrafts((current) => ({ ...current, [repoId]: nextDraft }));
    setBusyFlag(`save-${repoId}`, true);
    try {
      const updated = await tauriClient.updateRepository({
        id: repoId,
        projectName: nextDraft.projectName,
        selectedBranch: nextDraft.selectedBranch,
      });
      setRepositories((current) => current.map((item) => (item.id === repoId ? updated : item)));
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag(`save-${repoId}`, false);
    }
  }

  function updateRepoDraftLocal(repoId: string, partial: Partial<RepositoryDraft>) {
    setRepoDrafts((current) => ({
      ...current,
      [repoId]: {
        ...current[repoId],
        ...partial,
      },
    }));
  }

  async function refreshRepository(repo: Repository) {
    setBusyFlag(`refresh-${repo.id}`, true);
    setError("");
    try {
      const updated = await tauriClient.refreshRepository(repo.id);
      setRepositories((current) => current.map((item) => (item.id === repo.id ? updated : item)));
      await loadRepoMetadata(repo.id);
      showToast("success", `${updated.name} 已同步。`);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag(`refresh-${repo.id}`, false);
    }
  }

  async function refreshAllRepositories() {
    if (repositories.length === 0) {
      return;
    }
    setBusyFlag("refresh-all", true);
    setError("");
    try {
      for (const repo of repositories) {
        const updated = await tauriClient.refreshRepository(repo.id);
        setRepositories((current) => current.map((item) => (item.id === repo.id ? updated : item)));
        await loadRepoMetadata(repo.id);
      }
      showToast("success", "所有仓库已同步。");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("refresh-all", false);
    }
  }

  async function removeRepository(repo: Repository) {
    setBusyFlag(`remove-${repo.id}`, true);
    setError("");
    try {
      await tauriClient.removeRepository(repo.id);
      setRepositories((current) => current.filter((item) => item.id !== repo.id));
      setReports((current) => current.filter((report) => report.repositoryId !== repo.id));
      setRepoDrafts((current) => {
        const next = { ...current };
        delete next[repo.id];
        return next;
      });
      setBranchesByRepo((current) => {
        const next = { ...current };
        delete next[repo.id];
        return next;
      });
      setAuthorsByRepo((current) => {
        const next = { ...current };
        delete next[repo.id];
        return next;
      });
      setSelectedRepoIds((current) => current.filter((id) => id !== repo.id));
      showToast("success", `${repo.name} 已移除。`);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag(`remove-${repo.id}`, false);
    }
  }

  function makeGenerateInput(repo: Repository): GenerateReportInput {
    const draft = repoDrafts[repo.id];
    const dateRange = getDateRangeForRepo(repo);
    return {
      repositoryId: repo.id,
      branch: draft.selectedBranch,
      authors: draft.authors.length > 0 ? draft.authors : undefined,
      startAt: localInputToIso(dateRange.startAt),
      endAt: localInputToIso(dateRange.endAt),
      generationMode,
      modelId: generationMode === "ai" ? selectedModelId : undefined,
      duration: duration.enabled ? duration : undefined,
      customPrompt: generationMode === "ai" ? customPrompt.trim() || undefined : undefined,
    };
  }

  function getDateRangeForRepo(repo: Repository): DateRange {
    const draft = repoDrafts[repo.id];
    if (timeRangeMode === "shared") {
      return sharedDateRange;
    }
    return {
      startAt: draft.startAt,
      endAt: draft.endAt,
    };
  }

  function validateGenerateTargets(targetRepositories: Repository[]) {
    if (targetRepositories.length === 0) {
      setError("请先勾选至少一个仓库。");
      return false;
    }
    if (targetRepositories.some((repo) => !repoDrafts[repo.id])) {
      setError("仓库信息还在加载中，请稍后再生成。");
      return false;
    }
    if (generationMode === "ai" && !selectedModelId) {
      setError("AI 辅助模式需要先在设置中保存并选择一个模型。");
      return false;
    }
    return true;
  }

  async function requestReportForRepo(repo: Repository) {
    const report = await tauriClient.generateReport(makeGenerateInput(repo));
    setReports((current) => [report, ...current.filter((item) => item.repositoryId !== repo.id)]);
    return report;
  }

  async function generateForRepo(repo: Repository) {
    if (!validateGenerateTargets([repo])) {
      return;
    }

    setBusyFlag(`generate-${repo.id}`, true);
    setError("");
    try {
      await requestReportForRepo(repo);
      showToast("success", `${repo.projectName || repo.name} 日报已生成。`);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag(`generate-${repo.id}`, false);
    }
  }

  async function generateBatch() {
    const runnableRepositories = selectedRepositories.filter((repo) => repoDrafts[repo.id]);
    if (!validateGenerateTargets(selectedRepositories)) {
      return;
    }
    setBusyFlag("generate-batch", true);
    setBusyFlags(
      runnableRepositories.map((repo) => `generate-${repo.id}`),
      true,
    );
    setError("");
    try {
      const results = await Promise.allSettled(
        runnableRepositories.map(async (repo) => {
          try {
            await requestReportForRepo(repo);
          } finally {
            setBusyFlag(`generate-${repo.id}`, false);
          }
        }),
      );
      const failedResults = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      const generatedCount = results.length - failedResults.length;
      if (failedResults.length > 0) {
        setError(`有 ${failedResults.length} 个仓库生成失败：${readError(failedResults[0].reason)}`);
      }
      if (generatedCount > 0) {
        showToast("success", `${generatedCount} 个仓库日报已生成。`);
      }
    } finally {
      setBusyFlag("generate-batch", false);
    }
  }

  function summarizeReports() {
    const text = orderedReports.map((report) => `${report.projectName || report.repositoryName}\n${report.text}`).join("\n\n");
    setSummary(text);
    if (!text) {
      showToast("info", "还没有可汇总的仓库日报。");
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
    setError("");
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
      setShowApiKey(false);
      showToast("success", "模型配置已保存。");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("model-save", false);
    }
  }

  async function deleteModel(id: string) {
    setBusyFlag(`delete-model-${id}`, true);
    try {
      await tauriClient.deleteModelConfig(id);
      setModels((current) => current.filter((model) => model.id !== id));
      setSelectedModelId((current) => (current === id ? "" : current));
      setModelForm((current) => (current.id === id ? emptyModelForm : current));
    } finally {
      setBusyFlag(`delete-model-${id}`, false);
    }
  }

  function clearModelForm() {
    setModelForm(emptyModelForm);
    setShowApiKey(false);
  }

  async function saveSettings(nextSettings = settings) {
    setBusyFlag("settings-save", true);
    try {
      const saved = await tauriClient.updateSettings(nextSettings);
      setSettings(saved);
      setGenerationMode(saved.defaultGenerationMode);
      setDuration((current) => ({
        ...current,
        totalHours: current.enabled ? current.totalHours : saved.defaultWorkHours,
      }));
      showToast("success", "默认偏好已保存。");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("settings-save", false);
    }
  }

  async function checkUpdate(options?: { initial?: boolean }) {
    const initial = options?.initial ?? false;
    setUpdateUi((current) => ({ ...current, checking: true, message: initial ? current.message : "正在检查更新…" }));
    try {
      const status = await tauriClient.checkUpdateStatus();
      if (!status.configured) {
        setUpdateUi({
          checkedOnce: true,
          checking: false,
          available: null,
          message: status.message,
          showPopover: false,
        });
        if (!initial) {
          showToast("info", status.message);
        }
        return;
      }
      const update: UpdaterResult = await tauriClient
        .checkForAppUpdate()
        .catch((caught) => ({ available: false, error: readError(caught) } satisfies UpdaterResult));
      if (update.available) {
        setUpdateUi({
          checkedOnce: true,
          checking: false,
          available: update,
          message: update.body || `发现 ${update.version}，请前往 Git 仓库更新。`,
          showPopover: true,
        });
        return;
      }
      setUpdateUi({
        checkedOnce: true,
        checking: false,
        available: null,
        message: update.error || status.message || "暂无可用更新。",
        showPopover: false,
      });
      if (!initial) {
        showToast("info", update.error || "暂无更新版本。");
      }
    } catch (caught) {
      setUpdateUi({
        checkedOnce: true,
        checking: false,
        available: null,
        message: readError(caught),
        showPopover: false,
      });
    }
  }

  function setBusyFlag(key: string, value: boolean) {
    setBusy((current) => ({ ...current, [key]: value }));
  }

  function setBusyFlags(keys: string[], value: boolean) {
    setBusy((current) => ({
      ...current,
      ...Object.fromEntries(keys.map((key) => [key, value])),
    }));
  }

  function startSorting() {
    setSortingOrder(repositories.map((repo) => repo.id));
    setSortingMode(true);
  }

  function cancelSorting() {
    setSortingMode(false);
    setSortingOrder(repositories.map((repo) => repo.id));
  }

  async function confirmSorting() {
    setBusyFlag("sorting-save", true);
    try {
      const nextRepositories = sortingOrder
        .map((id) => repositories.find((repo) => repo.id === id))
        .filter((repo): repo is Repository => Boolean(repo))
        .map((repo, index) => ({
          ...repo,
          sortOrder: index + 1,
        }));

      for (const repo of nextRepositories) {
        await tauriClient.updateRepository({
          id: repo.id,
          sortOrder: repo.sortOrder,
        });
      }
      setRepositories(nextRepositories);
      setSortingMode(false);
      showToast("success", "仓库顺序已更新。");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusyFlag("sorting-save", false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    setSortingOrder((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  async function deleteReport(id: string) {
    setBusyFlag(`delete-report-${id}`, true);
    try {
      await tauriClient.deleteReport(id);
      setReports((current) => current.filter((report) => report.id !== id));
    } finally {
      setBusyFlag(`delete-report-${id}`, false);
    }
  }

  function showToast(type: ToastState["type"], text: string) {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ type, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-shell">
          <div className="brand-block">
            <img className="brand-mark" src={brandLogo} alt="Auto Daily Report logo" />
            <div>
              <h1>日报工作台</h1>
            </div>
          </div>
          <p className="brand-subtitle">汇总多个 Git 仓库的日报生成与版本检查</p>
        </div>

        <nav className="view-tabs" aria-label="主导航">
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
            <p className="eyebrow">仓库接入</p>
            <h2 className="sidebar-title">添加远程仓库</h2>
          </div>
          <Field label="Git 地址" value={repoUrl} onChange={setRepoUrl} placeholder="git@github.com:org/repo.git" required />
          <Field label="项目名称" value={repoProjectName} onChange={setRepoProjectName} placeholder="默认使用仓库名" />
          <button className="primary-button full-width" disabled={busy["add-repo"]}>
            <Plus size={17} weight="bold" />
            {busy["add-repo"] ? "添加中…" : "添加仓库"}
          </button>
        </form>

        <section className="repo-list-wrap">
          <div className="repo-list-header">
            <span>仓库列表</span>
            <div className="repo-list-actions">
              {sortingMode ? (
                <>
                  <button className="ghost-button mini" onClick={cancelSorting}>
                    取消
                  </button>
                  <button className="primary-button mini" onClick={confirmSorting} disabled={busy["sorting-save"]}>
                    {busy["sorting-save"] ? "保存中…" : "确认"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`icon-button ${busy["refresh-all"] ? "is-spinning" : ""}`}
                    onClick={refreshAllRepositories}
                    aria-label="同步所有仓库"
                  >
                    <ArrowsClockwise size={16} weight="bold" />
                  </button>
                  <button className="ghost-button mini" onClick={startSorting} disabled={repositories.length < 2}>
                    排序
                  </button>
                </>
              )}
            </div>
          </div>

          {repositories.length === 0 ? (
            <div className="empty-mini">先添加一个可访问的 Git 仓库。</div>
          ) : sortingMode ? (
            <DndContext sensors={pointerSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortingOrder} strategy={verticalListSortingStrategy}>
                <div className="repo-list">
                  {orderedRepositories.map((repo) => (
                    <SortableRepoRow key={repo.id} repo={repo} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="repo-list">
              {orderedRepositories.map((repo) => (
                <button key={repo.id} className={`repo-row ${selectedRepoIds.includes(repo.id) ? "selected" : ""}`} onClick={() => toggleRepositorySelection(repo.id)}>
                  <span className={`repo-check ${selectedRepoIds.includes(repo.id) ? "active" : ""}`}>
                    {selectedRepoIds.includes(repo.id) && <Check size={14} weight="bold" />}
                  </span>
                  <span className="repo-row-copy">
                    <strong>{repo.projectName || repo.name}</strong>
                    <small>{repo.selectedBranch || repo.defaultBranch || "未选择分支"}</small>
                  </span>
                  <span
                    className={`repo-refresh ${busy[`refresh-${repo.id}`] ? "is-spinning" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void refreshRepository(repo);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <ArrowsClockwise size={15} weight="bold" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </aside>

      <section className={`workspace workspace-${view}`}>
        <header className="topbar hero-band">
          <div className="topbar-mainline">
            <div className="topbar-copy">
              <p className="eyebrow page-kicker">多仓库日报流程</p>
            </div>
            <p className="topbar-inline-text">
              {view === "generate"
                ? "勾选多个仓库后即可批量生成，生成策略和仓库输出会根据窗口宽度自动排布。"
                : view === "history"
                  ? "查看、复制和清理已经生成过的日报记录。"
                  : "管理模型接入与默认生成偏好。"}
            </p>
          </div>
          <div className="topbar-actions topbar-actions-hero">
            <div className="version-strip" ref={updatePopoverRef}>
              <button
                className={`version-badge ${updateUi.available ? "has-update" : ""}`}
                onClick={() => {
                  if (updateUi.available) {
                    setUpdateUi((current) => ({ ...current, showPopover: !current.showPopover }));
                    return;
                  }
                  void checkUpdate();
                }}
              >
                <span>v{appVersion}</span>
                {updateUi.available ? (
                  <WarningCircle size={16} weight="fill" />
                ) : (
                  <ArrowsClockwise size={16} className={updateUi.checking ? "spin" : ""} />
                )}
              </button>
              {updateUi.showPopover && updateUi.available && (
                <div className="update-popover">
                  <p className="eyebrow">版本检查</p>
                  <h3>发现新版本 v{updateUi.available.version}</h3>
                  <p>{updateUi.available.body || "新版本已发布，请前往仓库下载或更新。"} </p>
                  <div className="repository-update-note">
                    <span>Git 仓库</span>
                    <code>{appRepositoryUrl}</code>
                  </div>
                </div>
              )}
            </div>
            <div className="metric-strip metrics-card">
              <Metric label="仓库" value={repositories.length.toString()} />
              <Metric label="已选" value={selectedRepositories.length.toString()} />
              <Metric label="报告" value={reports.length.toString()} />
            </div>
            {view === "generate" && (
              <button className="primary-button" onClick={generateBatch} disabled={selectedRepositories.length === 0 || busy["generate-batch"]}>
                <Lightning size={17} weight="bold" />
                {busy["generate-batch"] ? "批量生成中…" : "批量生成"}
              </button>
            )}
          </div>
        </header>

        {toast && <div className={`floating-toast ${toast.type}`}>{toast.text}</div>}

        {error && <div className="notice error">{error}</div>}

        {view === "generate" && (
          <div className="report-grid">
            <section className="control-column">
              <section className="panel panel-feature strategy-panel">
                <div className="strategy-panel-heading">
                  <span className="panel-icon">
                    <Sparkle size={20} weight="duotone" />
                  </span>
                  <div>
                    <strong>生成配置</strong>
                  </div>
                </div>

                <div className="strategy-section">
                  <div className="section-label">
                    <span>输出策略</span>
                    <small>
                      {generationMode === "message"
                        ? "按提交记录直接整理中文日报，不依赖模型。"
                        : "只根据指定时间内查到的提交和 diff 生成内容。"}
                    </small>
                  </div>
                  <div className="segmented">
                    <button className={generationMode === "message" ? "active" : ""} onClick={() => setGenerationMode("message")}>
                      普通生成
                    </button>
                    <button className={generationMode === "ai" ? "active" : ""} onClick={() => setGenerationMode("ai")}>
                      AI 辅助
                    </button>
                  </div>
                  {generationMode === "ai" && (
                    <div className="global-ai-stack">
                      <SelectField
                        label="模型"
                        value={selectedModelId}
                        options={models.map((model) => model.id)}
                        labels={Object.fromEntries(models.map((model) => [model.id, `${model.name} / ${model.model}`]))}
                        placeholder="请选择模型"
                        onChange={setSelectedModelId}
                      />
                      <TextAreaField
                        label="自定义提示词"
                        value={customPrompt}
                        placeholder="这里填写统一作用于本次 AI 辅助生成的核心提示词，优先级最高。"
                        onChange={setCustomPrompt}
                      />
                      <p className="ai-integrity-note">
                        如果指定时间内没有匹配提交，系统会直接保留无匹配记录，不请求模型续写。
                      </p>
                    </div>
                  )}
                </div>

                <div className="strategy-section">
                  <div className="section-label">
                    <span>时间选择</span>
                    <small>{timeRangeMode === "shared" ? "当前勾选仓库共用一个区间" : "每个仓库单独设置区间"}</small>
                  </div>
                  <div className="segmented">
                    <button
                      className={timeRangeMode === "shared" ? "active" : ""}
                      onClick={() => setTimeRangeMode("shared")}
                    >
                      共用时间
                    </button>
                    <button
                      className={timeRangeMode === "perRepository" ? "active" : ""}
                      onClick={() => setTimeRangeMode("perRepository")}
                    >
                      分别设置
                    </button>
                  </div>
                  {timeRangeMode === "shared" ? (
                    <div className="shared-range-panel">
                      <DateRangeField
                        label="共用时间区间"
                        startAt={sharedDateRange.startAt}
                        endAt={sharedDateRange.endAt}
                        onChange={setSharedDateRange}
                        hint="批量生成时，所有已选仓库都会使用这个时间区间。"
                      />
                    </div>
                  ) : (
                    <p className="helper-text compact-helper">仓库卡片内会显示独立的时间区间选择。</p>
                  )}
                </div>

                <div className="strategy-section">
                  <div className="section-label">
                    <span>工时设置</span>
                    <small>{duration.enabled ? "为每条工作内容补全工时" : "当前不附加工时"}</small>
                  </div>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={duration.enabled}
                      onChange={(event) =>
                        setDuration((current) => ({
                          ...current,
                          enabled: event.target.checked,
                        }))
                      }
                    />
                    自动补全工时
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
                            setDuration((current) => ({
                              ...current,
                              totalHours: Number(event.target.value) || settings.defaultWorkHours,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>分配策略</span>
                        <select
                          value={duration.strategy}
                          onChange={(event) =>
                            setDuration((current) => ({
                              ...current,
                              strategy: event.target.value as DurationStrategy,
                            }))
                          }
                        >
                          <option value="equal">平均分配</option>
                          <option value="commitWeighted">按提交数加权</option>
                          <option value="aiEstimate">AI 估算</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              </section>
            </section>

            <section className="output-column">
              <div className="repo-settings-shell">
                {selectedRepositories.length === 0 ? (
                  <EmptyState title="先勾选仓库" body="左侧勾选一个或多个仓库后，这里会出现对应的仓库设置和日报生成区域。" />
                ) : (
                  selectedRepositories.map((repo) => {
                    const draft = repoDrafts[repo.id];
                    const branches = branchesByRepo[repo.id] ?? [];
                    const authors = authorsByRepo[repo.id] ?? [];
                    const report = reportByRepo.get(repo.id);
                    const reportBusy = busy[`generate-${repo.id}`];
                    const saving = busy[`save-${repo.id}`];

                    if (!draft) {
                      return null;
                    }

                    return (
                      <section className="repo-settings-card" key={repo.id}>
                        <div className="repo-settings-head">
                          <div>
                            <p className="eyebrow repo-url">{repo.url}</p>
                            <div className="repo-title-line">
                              <h3>{repo.projectName || repo.name}</h3>
                              <button
                                className={`icon-button title-refresh ${busy[`refresh-${repo.id}`] ? "is-spinning" : ""}`}
                                onClick={() => refreshRepository(repo)}
                                disabled={busy[`refresh-${repo.id}`]}
                                aria-label={`同步 ${repo.projectName || repo.name}`}
                                title="同步当前仓库"
                              >
                                <ArrowsClockwise size={16} />
                              </button>
                            </div>
                          </div>
                          <div className="repo-settings-side">
                            <span className="status-pill">{repo.selectedBranch || repo.defaultBranch || "未选择分支"}</span>
                            {saving && <span className="mini-loading">同步中…</span>}
                          </div>
                        </div>

                        <div className="repo-settings-body">
                          <div className="repo-config-panel">
                            <div className="repo-inline-settings">
                              <Field
                                label="项目名称"
                                value={draft.projectName}
                                onChange={(value) => {
                                  updateRepoDraftLocal(repo.id, { projectName: value });
                                  void persistRepoDraft(repo.id, { projectName: value });
                                }}
                                placeholder={repo.name}
                              />
                              <SelectField
                                label="分支"
                                value={draft.selectedBranch}
                                options={uniqueStrings([draft.selectedBranch, ...branches.map((branch) => branch.name)])}
                                onChange={(value) => {
                                  updateRepoDraftLocal(repo.id, { selectedBranch: value });
                                  void persistRepoDraft(repo.id, { selectedBranch: value });
                                }}
                              />
                              <MultiSelectDropdown
                                label="提交者"
                                values={draft.authors}
                                options={uniqueStrings([defaultAuthor, ...authors])}
                                onChange={(values) => updateRepoDraftLocal(repo.id, { authors: values })}
                              />
                              {timeRangeMode === "perRepository" && (
                                <DateRangeField
                                  label="时间区间"
                                  startAt={draft.startAt}
                                  endAt={draft.endAt}
                                  onChange={(value) => updateRepoDraftLocal(repo.id, value)}
                                />
                              )}
                            </div>
                          </div>

                          <div className="repo-report-panel">
                            {reportBusy ? (
                              <div className="loading-card">
                                <div className="spinner" />
                                <span>正在生成这份日报…</span>
                              </div>
                            ) : (
                              <pre className="plain-output repo-output">
                                {report?.text || "生成后，这里会出现该仓库的日报内容。"}
                              </pre>
                            )}

                            <div className="report-card-footer stacked">
                              <span>
                                {report
                                  ? `${report.commits.length} 条提交 / ${formatDateTime(report.createdAt)}`
                                  : repo.lastSyncAt
                                    ? `最近同步于 ${formatDateTime(repo.lastSyncAt)}`
                                    : "尚未生成"}
                              </span>
                              <div className="split-actions compact">
                                <button className="primary-button" onClick={() => generateForRepo(repo)} disabled={reportBusy}>
                                  <Lightning size={16} />
                                  {reportBusy ? "生成中…" : "生成"}
                                </button>
                                <button className="ghost-button" onClick={() => report && copyText(repo.id, report.text)} disabled={!report}>
                                  <Copy size={16} />
                                  {copied === repo.id ? "已复制" : "复制"}
                                </button>
                                <button className="danger-button icon-only" onClick={() => removeRepository(repo)} aria-label="删除仓库">
                                  <Trash size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    );
                  })
                )}
              </div>

              <section className="panel panel-dark summary-panel">
                <div className="panel-heading">
                  <PanelTitle eyebrow="汇总输出" title="按排序合并日报" icon={<Copy size={20} weight="duotone" />} />
                  <div className="split-actions compact">
                    <button className="ghost-button" onClick={summarizeReports} disabled={orderedReports.length === 0}>
                      汇总
                    </button>
                    <button className="ghost-button" disabled={!summary} onClick={() => copyText("summary", summary)}>
                      {copied === "summary" ? "已复制" : "复制"}
                    </button>
                  </div>
                </div>
                <pre className="plain-output">{summary || "生成多份日报后，点击汇总会按左侧仓库排序合并到这里。"}</pre>
              </section>
            </section>
          </div>
        )}

        {view === "history" && (
          <History reports={reports} copied={copied} busy={busy} onCopy={copyText} onDelete={deleteReport} />
        )}

        {view === "settings" && (
          <Settings
            models={models}
            modelForm={modelForm}
            setModelForm={setModelForm}
            showApiKey={showApiKey}
            setShowApiKey={setShowApiKey}
            onSaveModel={saveModel}
            onEditModel={(model) => setModelForm(model)}
            onClearModelForm={clearModelForm}
            onDeleteModel={deleteModel}
            busy={busy}
          />
        )}
      </section>
    </main>
  );
}

function SortableRepoRow({ repo }: { repo: Repository }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: repo.id });
  return (
    <div
      ref={setNodeRef}
      className={`repo-row sortable ${isDragging ? "dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <span className="drag-handle" {...attributes} {...listeners}>
        <DotsSixVertical size={18} />
      </span>
      <span className="repo-row-copy">
        <strong>{repo.projectName || repo.name}</strong>
        <small>{repo.selectedBranch || repo.defaultBranch || "未选择分支"}</small>
      </span>
    </div>
  );
}

function History({
  reports,
  copied,
  busy,
  onCopy,
  onDelete,
}: {
  reports: ReportRecord[];
  copied: string;
  busy: BusyMap;
  onCopy: (key: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  if (reports.length === 0) {
    return <EmptyState title="暂无历史日报" body="每次生成的日报都会长期保存在本地，方便回看和复制。" />;
  }

  return (
    <section className="history-list">
      {reports.map((report) => (
        <article className="history-row history-card" key={report.id}>
          <div className="history-copy">
            <p className="eyebrow">{formatDateTime(report.createdAt)}</p>
            <h3>{report.projectName || report.repositoryName}</h3>
            <p>{report.text.slice(0, 220)}</p>
          </div>
          <div className="split-actions compact">
            <button className="ghost-button" onClick={() => onCopy(report.id, report.text)}>
              <Copy size={16} />
              {copied === report.id ? "已复制" : "复制"}
            </button>
            <button className="danger-button icon-only" onClick={() => onDelete(report.id)} disabled={busy[`delete-report-${report.id}`]} aria-label="删除日报">
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
  onClearModelForm,
  onDeleteModel,
  busy,
}: {
  models: ModelConfig[];
  modelForm: typeof emptyModelForm;
  setModelForm: (form: typeof emptyModelForm) => void;
  showApiKey: boolean;
  setShowApiKey: (show: boolean) => void;
  onSaveModel: (event: FormEvent<HTMLFormElement>) => void;
  onEditModel: (model: ModelConfig) => void;
  onClearModelForm: () => void;
  onDeleteModel: (id: string) => void;
  busy: BusyMap;
}) {
  const isEditingModel = Boolean(modelForm.id);
  const hasModelInput = Boolean(modelForm.id || modelForm.name || modelForm.baseUrl || modelForm.model || modelForm.apiKey);

  return (
    <div className="settings-grid">
      <form className="panel panel-dark form-stack" onSubmit={onSaveModel}>
        <div className="settings-panel-heading">
          <PanelTitle eyebrow="模型管理" title={isEditingModel ? "编辑模型接入" : "新增模型接入"} icon={<Key size={20} weight="duotone" />} />
          <div className="settings-heading-actions">
            {isEditingModel && <span className="status-pill edit-pill">编辑中</span>}
            <button type="button" className="ghost-button mini" onClick={onClearModelForm} disabled={!hasModelInput || busy["model-save"]}>
              一键清空
            </button>
          </div>
        </div>
        <Field label="配置名称" value={modelForm.name} onChange={(name) => setModelForm({ ...modelForm, name })} required />
        <Field label="接口地址" value={modelForm.baseUrl} onChange={(baseUrl) => setModelForm({ ...modelForm, baseUrl })} required />
        <Field label="模型名称" value={modelForm.model} onChange={(model) => setModelForm({ ...modelForm, model })} required />
        <label className="field secret-field">
          <span>API Key</span>
          <div>
            <input
              type={showApiKey ? "text" : "password"}
              value={modelForm.apiKey}
              onChange={(event) => setModelForm({ ...modelForm, apiKey: event.target.value })}
            />
            <button type="button" className="icon-button" onClick={() => setShowApiKey(!showApiKey)} aria-label="切换 API Key 可见性">
              {showApiKey ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small>当前阶段按本地明文保存，便于快速接入和调整。</small>
        </label>
        <div className="form-action-row">
          {isEditingModel && (
            <button type="button" className="ghost-button" onClick={onClearModelForm} disabled={busy["model-save"]}>
              新增模型
            </button>
          )}
          <button className="primary-button" disabled={busy["model-save"]}>
            <Check size={17} />
            {busy["model-save"] ? "保存中…" : isEditingModel ? "保存修改" : "保存模型"}
          </button>
        </div>
      </form>

      <section className="panel panel-feature">
        <PanelTitle eyebrow="可用模型" title="模型列表" icon={<HardDrives size={20} weight="duotone" />} />
        <div className="model-list">
          {models.length === 0 ? (
            <div className="empty-mini">还没有模型配置，AI 辅助模式需要至少一个模型。</div>
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
                  <button type="button" className="ghost-button" onClick={() => onEditModel(model)}>
                    编辑
                  </button>
                  <button
                    className="danger-button icon-only"
                    onClick={() => onDeleteModel(model.id)}
                    disabled={busy[`delete-model-${model.id}`]}
                    aria-label="删除模型"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
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

function SelectField({
  label,
  value,
  options,
  labels,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder || "请选择"}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function MultiSelectDropdown({
  label,
  values,
  options,
  onChange,
}: MultiSelectDropdownProps) {
  const selected = new Set(values);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <label className="field">
      <span>{label}</span>
      <div className={`multi-select-dropdown ${open ? "open" : ""}`} ref={containerRef}>
        <button type="button" className="multi-select-trigger" onClick={() => setOpen((current) => !current)}>
          {values.length === 0 ? (
            <span className="multi-select-summary placeholder">请选择提交者</span>
          ) : (
            <span className="multi-select-tags">
              {values.map((value) => (
                <span key={value} className="multi-select-tag">
                  {value}
                </span>
              ))}
            </span>
          )}
          <span className="multi-select-arrow" aria-hidden="true">
            ▾
          </span>
        </button>
        {open && (
          <div className="multi-select-menu">
            {options.map((option) => {
              const active = selected.has(option);
              return (
                <button
                  key={option}
                  type="button"
                  className={`multi-select-option ${active ? "active" : ""}`}
                  onClick={() =>
                    onChange(active ? values.filter((item) => item !== option) : [...values, option])
                  }
                >
                  <span className={`multi-select-check ${active ? "active" : ""}`}>{active ? "✓" : ""}</span>
                  <span className="multi-select-option-text">{option}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </label>
  );
}

function DateRangeField({
  label,
  startAt,
  endAt,
  onChange,
  hint = "默认今天 00:00 到 23:59。",
}: {
  label: string;
  startAt: string;
  endAt: string;
  onChange: (value: { startAt: string; endAt: string }) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <label className="field">
      <span>{label}</span>
      <div className={`multi-select-dropdown ${open ? "open" : ""}`} ref={containerRef}>
        <button type="button" className="multi-select-trigger" onClick={() => setOpen((current) => !current)}>
          <span className="multi-select-summary">{formatDateRange(startAt, endAt)}</span>
          <span className="multi-select-arrow" aria-hidden="true">
            ▾
          </span>
        </button>
        {open && (
          <div className="range-picker-panel">
            <div className="range-picker-header">
              <span>开始时间</span>
              <span>结束时间</span>
            </div>
            <div className="range-picker-row">
              <input
                type="datetime-local"
                value={startAt}
                onChange={(event) =>
                  onChange({
                    startAt: event.target.value,
                    endAt,
                  })
                }
              />
              <span className="range-picker-separator">至</span>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(event) =>
                  onChange({
                    startAt,
                    endAt: event.target.value,
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
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

function uniqueStrings(values: string[]) {
  return values.filter(Boolean).filter((value, index, all) => all.indexOf(value) === index);
}
