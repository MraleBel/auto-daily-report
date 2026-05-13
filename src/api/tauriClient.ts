import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
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

const previewSnapshot: AppSnapshot = {
  repositories: [],
  modelConfigs: [],
  settings: {
    defaultWorkHours: 8,
    defaultGenerationMode: "message",
    confirmAiDiffUpload: true,
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
    return call<Repository>("update_repository", { input });
  },

  removeRepository(id: string) {
    return call<void>("remove_repository", { id }, () => undefined);
  },

  refreshRepository(id: string) {
    return call<Repository>("refresh_repository", { id });
  },

  listBranches(repositoryId: string) {
    return call<BranchInfo[]>("list_branches", { repositoryId }, () => [{ name: "main", isCurrent: true }]);
  },

  listAuthors(repositoryId: string) {
    return call<string[]>("list_authors", { repositoryId }, () => ["Current Git User <user@example.com>"]);
  },

  generateReport(input: GenerateReportInput) {
    return call<ReportRecord>("generate_report", { input }, () => ({
      id: crypto.randomUUID(),
      repositoryId: input.repositoryId,
      repositoryName: "Preview Repository",
      branch: input.branch,
      author: input.author,
      startAt: input.startAt,
      endAt: input.endAt,
      generationMode: input.generationMode,
      duration: input.duration,
      commits: [],
      text: ["Preview Repository (main)", "- 开发：整理日报生成流程", "- 优化：完善仓库配置和模型配置交互"].join("\n"),
      createdAt: new Date().toISOString(),
    }));
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
      message: "Updater is only available inside the desktop app.",
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

  async installAppUpdate() {
    if (!desktopAvailable()) {
      return;
    }

    const update = await check();
    if (!update) {
      return;
    }

    await update.downloadAndInstall();
    await relaunch();
  },
};
