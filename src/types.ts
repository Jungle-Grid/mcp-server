export type WorkloadType = "inference" | "training" | "fine-tuning" | "batch";
export type OptimizeFor = "balanced" | "cost" | "speed";
export type Priority = "low" | "balanced" | "high";
export type GPUClass = "consumer" | "datacenter";
export type RegionMode = "prefer" | "strict";
export type JobStatus =
  | "pending"
  | "queued"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "rejected"
  | "cancelled";

export interface Job {
  job_id: string;
  name?: string;
  status: JobStatus | string;
  status_reason?: string;
  workload_type?: WorkloadType | string;
  optimize_for?: OptimizeFor | string;
  gpu_type?: string;
  gpu_class?: GPUClass | string;
  region_preference?: string;
  region_mode?: RegionMode | string;
  constraints_relaxed?: boolean;
  execution_route?: string;
  requested_route?: string;
  initial_route?: string;
  effective_route?: string;
  route_status?: string;
  route_reason?: string;
  constraint_mask?: string[];
  warm_pool_fallback?: boolean;
  selected_region?: string;
  reasoning?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  assigned_node_id?: string;
  failure?: JobFailure;
  input_files?: JobInput[];
  script_file?: JobInput;
  artifact_contract?: ArtifactContract;
}

export interface JobFailure {
  code?: string;
  summary?: string;
  stage?: string;
  log_excerpt?: string;
  retryable?: boolean;
}

export interface JobRuntime {
  job_id: string;
  stdout_tail?: string;
  stderr_tail?: string;
  exit_code?: number;
  timed_out?: boolean;
  runtime_availability?: RuntimeAvailability;
  diagnostics?: string[];
}

export interface RuntimeFieldAvailability {
  state?: "available" | "delayed" | "partial_loss" | "truncated" | "unsupported";
  reason?: string;
}

export interface RuntimeAvailability {
  exit_code?: RuntimeFieldAvailability;
  stdout_tail?: RuntimeFieldAvailability;
  stderr_tail?: RuntimeFieldAvailability;
}

export interface JobEstimate {
  available: boolean;
  routed_gpu_tier?: string;
  likely_gpu_type?: string;
  likely_gpu_family?: string;
  estimated_hourly_rate_usd?: number;
  estimated_cost_usd?: number;
  estimated_cost_min_usd?: number;
  estimated_cost_max_usd?: number;
  estimated_runtime_min_minutes: number;
  estimated_runtime_max_minutes: number;
  candidate_count: number;
  constraints_relaxed?: string[];
  constraints_relaxed_applied?: boolean;
  confidence: string;
  explanation?: string;
  unavailable_reason?: string;
  unavailable_code?: string;
  free_inference_trial_eligible?: boolean;
  free_inference_jobs_remaining?: number;
  free_inference_trial_max_cost_usd?: number;
  free_inference_trial_over_cost_limit?: boolean;
  warnings?: string[];
  screening?: JobScreening;
}

export interface JobScreening {
  policy_version: string;
  status: string;
  can_submit: boolean;
  checks: JobScreeningCheck[];
}

export interface JobScreeningCheck {
  code: string;
  severity: string;
  status: string;
  field?: string;
  message: string;
  action?: string;
  fix_applied?: boolean;
}

export interface JobRoutingConstraints {
  gpu_type?: string;
  gpu_class?: GPUClass;
  region_preference?: string;
  region_mode?: RegionMode;
  latency_priority?: Priority;
  cost_priority?: Priority;
}

export interface SubmitJobInput {
  name?: string;
  workload_type: WorkloadType;
  image: string;
  command?: string;
  args?: string[];
  model_size_gb?: number;
  disk_gb?: number;
  optimize_for?: OptimizeFor;
  latency_priority?: Priority;
  cost_priority?: Priority;
  constraints?: JobRoutingConstraints;
  environment?: Record<string, string>;
  huggingface_credential_id?: string;
  webhook_url?: string;
  input_files?: string[];
  script_file?: string;
  expected_artifacts?: string[];
}

export interface SubmitJobResult {
  job_id: string;
  status: JobStatus | string;
  queued_at: string;
  execution_route?: string;
  route_reason?: string;
  constraint_mask?: string[];
  warm_pool_fallback?: boolean;
  free_inference_trial_applied?: boolean;
  free_inference_jobs_remaining?: number;
  free_inference_trial_max_cost_usd?: number;
  free_inference_trial_over_cost_limit?: boolean;
  artifacts?: JobArtifactUpload[];
  input_files?: JobInput[];
  script_file?: JobInput;
  artifact_contract?: ArtifactContract;
  requested_route?: string;
  initial_route?: string;
  effective_route?: string;
  route_status?: string;
}

export interface JobInput {
  input_id: string;
  filename: string;
  content_type?: string;
  size_bytes?: number;
  kind?: string;
  status?: string;
  ready?: boolean;
  mount_path?: string;
}

export interface JobInputUpload {
  input_id: string;
  filename: string;
  method: string;
  upload_url: string;
  token?: string;
  expires_at: string;
  complete_url: string;
}

export interface JobInputUploadResult {
  upload: JobInputUpload;
}

export interface JobInputListResult {
  inputs: JobInput[];
}

export interface ArtifactContract {
  expected_artifacts?: { path: string; filename?: string; required?: boolean }[];
  automatic_collection_dir: string;
  system_generated_metadata?: string[];
  available_artifacts?: JobArtifact[];
}

export interface JobLogLine {
  entry_id: number;
  node_id?: string;
  source?: string;
  stream: string;
  message: string;
  truncated?: boolean;
  created_at?: string;
}

export interface JobLogPage {
  job_id: string;
  status: string;
  status_reason?: string;
  items: JobLogLine[];
  limit: number;
  stream?: string;
  next_cursor?: number;
  has_more: boolean;
  failure_highlight?: string;
  usage_hint?: string;
}

export interface JobArtifactUpload {
  artifact_id: string;
  filename: string;
  method: string;
  upload_url: string;
  expires_at: string;
}

export interface JobArtifact {
  artifact_id: string;
  job_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
  uploaded_at?: string;
}

export interface JobArtifactListResult {
  artifacts: JobArtifact[];
}

export interface JobArtifactDownloadResult {
  artifact: JobArtifact;
  url: string;
  expires_at: string;
}

export interface ListJobsResult {
  jobs: Job[];
}
