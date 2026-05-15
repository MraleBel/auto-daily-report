export type GenerationMode = "message" | "ai";
export type DurationStrategy = "equal" | "commitWeighted" | "aiEstimate";

export interface Repository {
  id: string;
  url: string;
  name: string;
  projectName?: string;
  localPath: string;
  defaultBranch?: string;
  selectedBranch?: string;
  sortOrder: number;
  lastSyncAt?: string;
  createdAt: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  createdAt: string;
}

export interface AppSettings {
  defaultWorkHours: number;
  defaultGenerationMode: GenerationMode;
}

export interface DefaultAuthor {
  name?: string;
  email?: string;
}

export interface AppSnapshot {
  repositories: Repository[];
  modelConfigs: ModelConfig[];
  settings: AppSettings;
  reports: ReportRecord[];
  defaultAuthor: DefaultAuthor;
}

export interface AddRepositoryInput {
  url: string;
  projectName?: string;
}

export interface UpdateRepositoryInput {
  id: string;
  projectName?: string;
  selectedBranch?: string;
  sortOrder?: number;
}

export interface SaveModelInput {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface DurationOptions {
  enabled: boolean;
  totalHours: number;
  strategy: DurationStrategy;
}

export interface GenerateReportInput {
  repositoryId: string;
  branch: string;
  authors?: string[];
  startAt: string;
  endAt: string;
  generationMode: GenerationMode;
  modelId?: string;
  duration?: DurationOptions;
  customPrompt?: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
  diff?: string;
}

export interface ReportRecord {
  id: string;
  repositoryId: string;
  repositoryName: string;
  projectName?: string;
  branch: string;
  author?: string;
  startAt: string;
  endAt: string;
  generationMode: GenerationMode;
  duration?: DurationOptions;
  commits: CommitInfo[];
  text: string;
  createdAt: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
}

export interface UpdateStatus {
  configured: boolean;
  message: string;
}

export interface UpdaterResult {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
  error?: string;
}
