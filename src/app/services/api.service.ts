import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ── Request / Response shapes matching the Spring AI backend ──

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
    user_id?: number;
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
    user_id: number;
    response_timeStamp: string;
    standalone_query: string;
    conversation_context: string;
  };
}

export interface DocumentLinkResponse {
  documentId: string;
  fileName: string;
  downloadLink: string;
  viewLink: string;
}

// ── Auth ──
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
  id?: string;
  userName?: string;
  email?: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = '';

  constructor(private http: HttpClient) {}

  /** POST /api/auth/register */
  register(payload: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/api/auth/register`, payload);
  }

  /** POST /api/auth/login */
  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/api/auth/login`, payload);
  }

  /** POST /query — ask the AI a question */
  query(payload: QueryRequest): Observable<QueryResponse> {
    return this.http.post<QueryResponse>(`${this.base}/query`, payload);
  }

  /** POST /api/documents/upload — upload a file to Azure Blob Storage */
  uploadDocument(file: File, folderId: string, username: string): Observable<string> {
    const form = new FormData();
    form.append('file', file);
    form.append('folderId', folderId);
    form.append('username', username);
    return this.http.post(`${this.base}/api/documents/upload`, form, { responseType: 'text' });
  }

  /** GET /api/documents/{id}/links — get temporary SAS links for a document */
  getDocumentLinks(documentId: string): Observable<DocumentLinkResponse> {
    return this.http.get<DocumentLinkResponse>(
      `${this.base}/api/documents/${documentId}/links`
    );
  }

  /** GET /api/documents/download/{id} — download a document as a Blob */
  downloadDocument(documentId: string): Observable<Blob> {
    return this.http.get(
      `${this.base}/api/documents/download/${documentId}`,
      { responseType: 'blob' }
    );
  }
}
