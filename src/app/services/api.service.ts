import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ─────────────────────────────────────────────
//  Shared / utility
// ─────────────────────────────────────────────

/** Matches backend FilePath domain object */
export interface FilePath {
  filePath: string[];
}

// ─────────────────────────────────────────────
//  Auth  →  POST /api/auth/register|login
// ─────────────────────────────────────────────

export interface RegisterRequest {
  userName: string;
  fullName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  userNameOrEmail: string;
  password: string;
}

export interface AuthResponse {
  token?: string;
  id?: string;        // UUID stored as string
  userName?: string;
  email?: string;
  isAdmin?: boolean;
  roles?: string[];
  message?: string;
}

// ─────────────────────────────────────────────
//  Query  →  POST /query
// ─────────────────────────────────────────────

export interface QueryRequest {
  metadata: { serviceReferenceId?: string };
  requestData: {
    request_id: string;
    email: string;
    username: string;
    question: string;
    question_id: number;
    conversation_id?: string;
    product_name?: string;
    profile?: string;
    user_id?: string;   // UUID — backend uses java.util.UUID
  };
}

export interface AnswerItem {
  Text: string;
  Table?: Record<string, unknown>[];
}

export interface QueryResponse {
  responseData: {
    request_id: string;
    email: string;
    username: string;
    question_id: number;
    response_type: string;
    answer: AnswerItem[];
    citations: Record<string, unknown>;
    conversation_id: string;
    product_name: string;
    profile: string;
    user_id: string;          // UUID
    response_timeStamp: string;
    standalone_query: string;
    conversation_context: string;
  };
}

// ─────────────────────────────────────────────
//  Documents  →  /api/documents/*
// ─────────────────────────────────────────────

export interface DocumentLinkResponse {
  documentId: string;
  fileName: string;
  downloadLink: string;
  viewLink: string;
}

// ─────────────────────────────────────────────
//  Schema  →  /api/v1/schema/*
// ─────────────────────────────────────────────

export interface ActiveSchemasResponse {
  views: string[];
  descriptions: Record<string, string>;
  routing_metadata: Record<string, unknown>;
}

export interface SchemaRefreshResponse {
  status: string;
  message: string;
}

// ─────────────────────────────────────────────
//  Error response  (matches backend ErrorResponse DTO)
// ─────────────────────────────────────────────

export interface ErrorResponse {
  status: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}

// ─────────────────────────────────────────────
//  App info  →  GET /  |  /health  |  /metrics
// ─────────────────────────────────────────────

export interface AppInfoResponse {
  name: string;
  version: string;
  features: string[];
  endpoints: Record<string, string>;
}

export interface HealthResponse {
  status: string;          // 'healthy' | 'unhealthy'
  timestamp: string;
  db_pool_status: string;
  worker_pid: number;
}

export interface MetricsResponse {
  timestamp: string;
  config: {
    request_timeout_seconds: number;
    conversation_cache_size: number;
    conversation_timeout_seconds: number;
  };
  current: {
    active_conversations: number;
    expired_conversations: number;
    conversation_cache_size: number;
    conversation_timeout_seconds: number;
    request_count: number;
  };
}

// ─────────────────────────────────────────────
//  Azure Indexing Service  →  /api/indexing/* (port 8086)
// ─────────────────────────────────────────────

export interface BlobInventoryItem {
  blobUri: string;
  blobName: string;
  fileName: string;
  lastModified: string;
  sizeBytes: number;
  etag: string;
}

export interface BlobScanResult {
  scanned: number;
  queuedForIngestion: number;
  queuedForDeletion: number;
  unchanged: number;
  ingestionBlobUris: string[];
  deletionBlobUris: string[];
}

export interface JobProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export interface TriggerIndexRequest {
  blobUri: string;
  blobName: string;
  fileName: string;
}

export interface IndexListResponse {
  indexes: string[];
}

// ─────────────────────────────────────────────
//  Permissions  →  /permissions/*
// ─────────────────────────────────────────────

export interface PermissionCheckRequest {
  folder_ids: string[];
}

export interface PermissionCheckResponse {
  username: string;
  permissions: Record<string, boolean>;
  restricted_count: number;
  accessible_count: number;
}

// ─────────────────────────────────────────────
//  Service
// ─────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = '';

  constructor(private http: HttpClient) {}

  // ── Auth ────────────────────────────────────

  /** POST /api/auth/register */
  register(payload: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/api/auth/register`, payload);
  }

  /** POST /api/auth/login */
  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/api/auth/login`, payload);
  }

  // ── Query ────────────────────────────────────

  /** POST /query — ask the AI a question */
  query(payload: QueryRequest): Observable<QueryResponse> {
    return this.http.post<QueryResponse>(`${this.base}/query`, payload);
  }

  // ── Documents ────────────────────────────────

  /** POST /api/documents/upload — filePath: ["apps", "cresen", "internship", "chatbot", filename] */
  uploadDocument(file: File, folderId: string, username: string): Observable<string> {
    const fileInfo: FilePath = { filePath: ['apps', 'cresen', 'internship', 'chatbot', file.name] };
    const form = new FormData();
    form.append('fileInfo', new Blob([JSON.stringify(fileInfo)], { type: 'application/json' }));
    form.append('file', file);
    const url = `${this.base}/api/documents/upload?username=${encodeURIComponent(username)}`;
    return this.http.post(url, form, { responseType: 'text' });
  }

  /** POST /api/documents/upload-multiple — upload several files at once */
  uploadMultipleDocuments(files: File[], folderId: string, username: string): Observable<{ results: boolean[]; totalFiles: number }> {
    const fileInfos: FilePath[] = files.map(f => ({ filePath: ['apps', 'cresen', 'internship', 'chatbot', f.name] }));
    const form = new FormData();
    form.append('fileInfos', new Blob([JSON.stringify(fileInfos)], { type: 'application/json' }));
    files.forEach(f => form.append('files', f));
    const url = `${this.base}/api/documents/upload-multiple?username=${encodeURIComponent(username)}`;
    return this.http.post<{ results: boolean[]; totalFiles: number }>(url, form);
  }

  /** GET /api/documents/download/{documentId} — download via Spring Resource */
  downloadDocument(documentId: string): Observable<Blob> {
    return this.http.get(
      `${this.base}/api/documents/download/${documentId}`,
      { responseType: 'blob' }
    );
  }

  /** GET /api/documents/download-by-document-id/{documentId} — download byte[] by DB id */
  downloadByDocumentId(documentId: string): Observable<Blob> {
    return this.http.get(
      `${this.base}/api/documents/download-by-document-id/${documentId}`,
      { responseType: 'blob' }
    );
  }

  /** GET /api/documents/download-by-path?path=... — download byte[] by full blob path */
  downloadByPath(blobPath: string): Observable<Blob> {
    return this.http.get(
      `${this.base}/api/documents/download-by-path?path=${encodeURIComponent(blobPath)}`,
      { responseType: 'blob' }
    );
  }

  /** POST /api/documents/download-file — download byte[] by FilePath JSON body */
  downloadFile(filePath: string[]): Observable<Blob> {
    return this.http.post(
      `${this.base}/api/documents/download-file`,
      { filePath } satisfies FilePath,
      { responseType: 'blob' }
    );
  }

  /** GET /api/documents/{documentId}/links — get temporary SAS view/download links */
  getDocumentLinks(documentId: string): Observable<DocumentLinkResponse> {
    return this.http.get<DocumentLinkResponse>(
      `${this.base}/api/documents/${documentId}/links`
    );
  }

  /** GET /api/documents/health */
  documentHealth(): Observable<string> {
    return this.http.get(`${this.base}/api/documents/health`, { responseType: 'text' });
  }

  /** POST /api/documents/sync-from-azure — trigger manual Azure → DB sync */
  syncFromAzure(): Observable<string> {
    return this.http.post(`${this.base}/api/documents/sync-from-azure`, null, { responseType: 'text' });
  }

  // ── Permissions ──────────────────────────────
  // X-Username / X-User-Email headers are attached automatically by authInterceptor.

  /** POST /permissions/check — check access for a list of folder IDs */
  checkPermissions(folderIds: string[]): Observable<PermissionCheckResponse> {
    const body: PermissionCheckRequest = { folder_ids: folderIds };
    return this.http.post<PermissionCheckResponse>(`${this.base}/permissions/check`, body);
  }

  /** GET /permissions/my-access — get current user's full access map */
  getMyAccess(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.base}/permissions/my-access`);
  }

  /** POST /permissions/clear-cache — clear permission cache for current user */
  clearPermissionCache(): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.base}/permissions/clear-cache`, null);
  }

  // ── App Info ─────────────────────────────────

  /** GET / — service name, version and endpoint map */
  getAppInfo(): Observable<AppInfoResponse> {
    return this.http.get<AppInfoResponse>(`${this.base}/`);
  }

  /** GET /health — liveness check (requires auth) */
  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.base}/health`);
  }

  /** GET /metrics — workflow stats and config (requires auth) */
  getMetrics(): Observable<MetricsResponse> {
    return this.http.get<MetricsResponse>(`${this.base}/metrics`);
  }

  // ── Schema ───────────────────────────────────

  /** GET /api/v1/schema/active — get active views, descriptions and routing metadata */
  getActiveSchemas(): Observable<ActiveSchemasResponse> {
    return this.http.get<ActiveSchemasResponse>(`${this.base}/api/v1/schema/active`);
  }

  /** POST /api/v1/schema/refresh — refresh the schema registry */
  refreshSchemas(): Observable<SchemaRefreshResponse> {
    return this.http.post<SchemaRefreshResponse>(`${this.base}/api/v1/schema/refresh`, null);
  }

  // ── Azure Indexing Service (port 8086) ────────────────────────────────

  /** GET /api/indexing/blobs — list all indexable blobs in Azure Storage */
  listIndexableBlobs(): Observable<BlobInventoryItem[]> {
    return this.http.get<BlobInventoryItem[]>(`${this.base}/api/indexing/blobs`);
  }

  /** POST /api/indexing/blobs/scan — scan container and queue new/modified blobs */
  scanAndQueue(): Observable<BlobScanResult> {
    return this.http.post<BlobScanResult>(`${this.base}/api/indexing/blobs/scan`, null);
  }

  /** POST /api/indexing/blobs/requeue-stable — reset stable files back for re-indexing */
  requeueStableFiles(): Observable<{ queued: number }> {
    return this.http.post<{ queued: number }>(`${this.base}/api/indexing/blobs/requeue-stable`, null);
  }

  /** GET /api/indexing/blobs/jobs/count?status= — count jobs by status */
  countJobs(status = 'to_be_ingested'): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.base}/api/indexing/blobs/jobs/count?status=${encodeURIComponent(status)}`);
  }

  /** POST /api/indexing/jobs/process — run queued ingestion jobs */
  processJobs(maxJobs?: number): Observable<JobProcessResult> {
    const params = maxJobs != null ? `?maxJobs=${maxJobs}` : '';
    return this.http.post<JobProcessResult>(`${this.base}/api/indexing/jobs/process${params}`, null);
  }

  /** POST /api/indexing/jobs/index-schema — create or upgrade Azure Search index schema */
  createOrUpdateIndexSchema(): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.base}/api/indexing/jobs/index-schema`, null);
  }

  /** GET /api/indexing/jobs/indexes — list Azure Search indexes */
  listIndexes(): Observable<IndexListResponse> {
    return this.http.get<IndexListResponse>(`${this.base}/api/indexing/jobs/indexes`);
  }

  /** DELETE /api/indexing/jobs/indexes/{indexName} — delete a search index */
  deleteIndex(indexName: string): Observable<Record<string, unknown>> {
    return this.http.delete<Record<string, unknown>>(
      `${this.base}/api/indexing/jobs/indexes/${encodeURIComponent(indexName)}`
    );
  }

  /** DELETE /api/indexing/jobs/index-schema — delete configured search index */
  deleteConfiguredIndex(): Observable<Record<string, unknown>> {
    return this.http.delete<Record<string, unknown>>(`${this.base}/api/indexing/jobs/index-schema`);
  }

  /** DELETE /api/indexing/jobs/documents — clear all docs from configured search index */
  clearIndexDocuments(): Observable<Record<string, unknown>> {
    return this.http.delete<Record<string, unknown>>(`${this.base}/api/indexing/jobs/documents`);
  }

  /** POST /api/indexing/blobs/trigger — queue a single blob for immediate indexing */
  triggerBlobIndexing(req: TriggerIndexRequest): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.base}/api/indexing/blobs/trigger`, req);
  }
}
