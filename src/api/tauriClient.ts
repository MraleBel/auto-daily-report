import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import type {
  AddRepositoryInput,
  AppSettings,
  AppSnapshot,
  BranchInfo,
  GenerateReportInput,
  ModelConfig,
  ReportRecord,
  Repository,
  SaveModelInput,
  UpdateRepositoryInput,
  UpdateStatus,
  UpdaterResult,
} from "../types";

const desktopAvailable = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>, fallback?: () => T | Promise<T>): Promise<T> {
  if (desktopAvailable()) {
    return invoke<T>(command, args);
  }

  if (fallback) {
    return fallback();
  }

  throw new Error(`Tauri command unavailable in browser preview: ${command}`);
}

const now = new Date().toISOString();
const previewRepositories: Repository[] = [
  {
    id: "preview-web",
    url: "git@github.com:preview/web-console.git",
    name: "web-console",
    projectName: "Web 控制台",
    localPath: "Preview mode",
    defaultBranch: "main",
    selectedBranch: "main",
    sortOrder: 1,
    lastSyncAt: now,
    createdAt: now,
  },
  {
    id: "preview-api",
    url: "git@github.com:preview/api-service.git",
    name: "api-service",
    projectName: "接口服务",
    localPath: "Preview mode",
    defaultBranch: "develop",
    selectedBranch: "develop",
    sortOrder: 2,
    lastSyncAt: now,
    createdAt: now,
  },
  {
    id: "preview-mobile",
    url: "git@github.com:preview/mobile-app.git",
    name: "mobile-app",
    projectName: "移动端",
    localPath: "Preview mode",
    defaultBranch: "main",
    selectedBranch: "main",
    sortOrder: 3,
    lastSyncAt: now,
    createdAt: now,
  },
];

const previewSnapshot: AppSnapshot = {
  repositories: previewRepositories,
  modelConfigs: [
    {
      id: "preview-model",
      name: "Preview Model",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "preview-key",
      model: "gpt-4o-mini",
      createdAt: now,
    },
  ],
  settings: {
    defaultWorkHours: 8,
    defaultGenerationMode: "message",
  },
  reports: [],
  defaultAuthor: {
    name: "Current Git User",
    email: "user@example.com",
  },
};

export const tauriClient = {
  isDesktop: desktopAvailable,

  getSnapshot() {
    return call<AppSnapshot>("get_snapshot", undefined, () => previewSnapshot);
  },

  addRepository(input: AddRepositoryInput) {
    return call<Repository>("add_repository", { input }, () => ({
      id: crypto.randomUUID(),
      url: input.url,
      name: input.url.split(/[/:]/).pop()?.replace(/\.git$/, "") || "repository",
      projectName: input.projectName,
      localPath: "Preview mode",
      defaultBranch: "main",
      selectedBranch: "main",
      sortOrder: Date.now(),
      lastSyncAt: now,
      createdAt: now,
    }));
  },

  updateRepository(input: UpdateRepositoryInput) {
    return call<Repository>("update_repository", { input }, () => ({
      id: input.id,
      url: "git@github.com:preview/repository.git",
      name: "repository",
      projectName: input.projectName,
      localPath: "Preview mode",
      defaultBranch: input.selectedBranch || "main",
      selectedBranch: input.selectedBranch || "main",
      sortOrder: input.sortOrder ?? Date.now(),
      lastSyncAt: now,
      createdAt: now,
    }));
  },

  removeRepository(id: string) {
    return call<void>("remove_repository", { id }, () => undefined);
  },

  refreshRepository(id: string) {
    return call<Repository>("refresh_repository", { id }, () => ({
      ...(previewRepositories.find((repo) => repo.id === id) ?? previewRepositories[0]),
      localPath: "Preview mode",
      lastSyncAt: new Date().toISOString(),
    }));
  },

  listBranches(repositoryId: string) {
    return call<BranchInfo[]>("list_branches", { repositoryId }, () => [
      { name: previewRepositories.find((repo) => repo.id === repositoryId)?.selectedBranch || "main", isCurrent: true },
      { name: "release/weekly", isCurrent: false },
    ]);
  },

  listAuthors(repositoryId: string) {
    return call<string[]>("list_authors", { repositoryId }, () => [
      "Current Git User <user@example.com>",
      "Teammate <teammate@example.com>",
    ]);
  },

  generateReport(input: GenerateReportInput) {
    return call<ReportRecord>("generate_report", { input }, async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      const repo = previewRepositories.find((item) => item.id === input.repositoryId);
      const repoName = repo?.projectName || repo?.name || "Preview Repository";
      return {
        id: crypto.randomUUID(),
        repositoryId: input.repositoryId,
        repositoryName: repo?.name || repoName,
        projectName: repo?.projectName,
        branch: input.branch,
        author: input.authors?.join(", "),
        startAt: input.startAt,
        endAt: input.endAt,
        generationMode: input.generationMode,
        duration: input.duration,
        commits: [],
        text: [
          "1. 开发：整理日报生成流程",
          "2. 优化：完善仓库配置、时间选择和批量生成交互",
        ].join("\n"),
        createdAt: new Date().toISOString(),
      };
    });
  },

  saveModelConfig(input: SaveModelInput) {
    return call<ModelConfig>("save_model_config", { input }, () => ({
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      createdAt: now,
    }));
  },

  deleteModelConfig(id: string) {
    return call<void>("delete_model_config", { id }, () => undefined);
  },

  updateSettings(settings: AppSettings) {
    return call<AppSettings>("update_settings", { settings }, () => settings);
  },

  deleteReport(id: string) {
    return call<void>("delete_report", { id }, () => undefined);
  },

  checkUpdateStatus() {
    return call<UpdateStatus>("check_update_status", undefined, () => ({
      configured: false,
      message: "当前版本仅支持检查是否有新版本，实际更新请前往 Git 仓库或 Release 页面处理。",
    }));
  },

  async checkForAppUpdate(): Promise<UpdaterResult> {
    if (!desktopAvailable()) {
      return { available: false };
    }

    const update = await check();
    if (!update) {
      return { available: false };
    }

    return {
      available: true,
      version: update.version,
      date: update.date,
      body: update.body,
    };
  },

};
