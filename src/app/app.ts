import {
  Component, signal, ElementRef, ViewChild, computed, inject, AfterViewInit, HostListener
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from './services/api.service';
import { IndexManagementModal } from './index-management/index-management-modal';
import { tokenHasAdminRole } from './services/auth-role.util';
import { ToastService } from './services/toast.service';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  attachedFiles?: string[];
  timestamp: Date;
  citations?: Record<string, any>;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  pinned?: boolean;
}

export interface ManagedFile {
  id: string;
  file: File;
  name: string;
  size: string;
  type: string;
  saved: boolean;
  objectUrl: string;
  safeUrl: SafeResourceUrl;
  sessionTitle?: string;
  uploading?: boolean;
  uploadSuccess?: boolean;
  uploadError?: string;
}

@Component({
  selector: 'app-chat',
  imports: [FormsModule, CommonModule, IndexManagementModal],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit {
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private api = inject(ApiService);
  toast = inject(ToastService);

  private queryCache = this.loadQueryCache();

  @ViewChild('messagesEnd') messagesEnd!: ElementRef;
  @ViewChild('promptTextarea') promptTextarea!: ElementRef<HTMLTextAreaElement>;

  // ── Persistence helpers ──
  private convsKey(): string {
    return `ds_conversations_${localStorage.getItem('ds_current_user') ?? 'guest'}`;
  }

  private loadConversations(): Conversation[] {
    try {
      const raw = localStorage.getItem(this.convsKey());
      if (!raw) return [];
      return (JSON.parse(raw) as any[]).map(c => ({
        ...c,
        createdAt: new Date(c.createdAt),
        messages: c.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
      }));
    } catch { return []; }
  }

  private saveConversations() {
    localStorage.setItem(this.convsKey(), JSON.stringify(this.conversations()));
  }

  private queryCacheKey(): string {
    return `ds_query_cache_${localStorage.getItem('ds_current_user') ?? 'guest'}`;
  }

  private loadQueryCache(): Map<string, any> {
    try {
      const raw = localStorage.getItem(this.queryCacheKey());
      if (!raw) return new Map();
      const entries: { key: string; value: any }[] = JSON.parse(raw);
      return new Map(entries.map(e => [e.key, e.value]));
    } catch { return new Map(); }
  }

  private saveQueryCache() {
    const MAX_ENTRIES = 100;
    const entries = Array.from(this.queryCache.entries())
      .slice(-MAX_ENTRIES)
      .map(([key, value]) => ({ key, value }));
    try {
      localStorage.setItem(this.queryCacheKey(), JSON.stringify(entries));
    } catch { /* storage quota exceeded — skip silently */ }
  }

  private docsKey(): string {
    return `ds_documents_${localStorage.getItem('ds_current_user') ?? 'guest'}`;
  }

  private loadDocuments(): ManagedFile[] {
    try {
      const raw = localStorage.getItem(this.docsKey());
      if (!raw) return [];
      return (JSON.parse(raw) as any[]).map(d => {
        const objectUrl = d.objectUrl || '';
        return {
          ...d,
          file: null as any,
          objectUrl,
          safeUrl: objectUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl) : this.sanitizer.bypassSecurityTrustResourceUrl('about:blank')
        };
      });
    } catch { return []; }
  }

  private saveDocuments() {
    const serializable = this.allDocuments().map(({ file, objectUrl, safeUrl, ...rest }) => rest);
    localStorage.setItem(this.docsKey(), JSON.stringify(serializable));
  }

  // ── Chat state ──
  conversations = signal<Conversation[]>(this.loadConversations());
  activeConvId = signal<string | null>(null);
  prompt = signal('');
  loading = signal(false);

  activeConversation = computed(() =>
    this.conversations().find(c => c.id === this.activeConvId()) ?? null
  );

  pinnedConversations   = computed(() => this.conversations().filter(c => c.pinned));
  unpinnedConversations = computed(() => this.conversations().filter(c => !c.pinned));
  pinnedCount           = computed(() => this.conversations().filter(c => c.pinned).length);

  // ── Conv context menu ──
  openMenuConvId = signal<string | null>(null);

  // ── Sidebar section collapse ──
  pinnedCollapsed = signal(false);

  // ── Theme ──
  darkMode = signal(localStorage.getItem('ds_theme') === 'dark');

  // ── Citations Modal State ──
  viewingCitations = signal<any | null>(null);
  selectedCitationIndex = signal<number>(0);

  openCitationsModal(citations: any, event: MouseEvent) {
    event.stopPropagation();
    this.viewingCitations.set(citations);
    this.selectedCitationIndex.set(0);
  }

  closeCitationsModal() {
    this.viewingCitations.set(null);
  }

  hasKeys(obj: any): boolean {
    return obj && Object.keys(obj).length > 0;
  }

  getCitationsArray(citations: any): any[] {
    if (!citations) return [];
    return Object.keys(citations).map((key, idx) => ({
      index: key,
      arrayIndex: idx,
      ...citations[key]
    }));
  }

  getSelectedCitation(): any | null {
    const arr = this.getCitationsArray(this.viewingCitations());
    const idx = this.selectedCitationIndex();
    return arr.length > idx ? arr[idx] : (arr.length > 0 ? arr[0] : null);
  }

  getCitationPdfUrl(citation: any): SafeResourceUrl | null {
    if (!citation) return null;
    
    let page = 1;
    const pageNum = citation.page;
    if (pageNum !== undefined && pageNum !== null) {
      const match = String(pageNum).match(/\d+/);
      if (match) {
        page = parseInt(match[0], 10);
      }
    }
    if (page < 1) page = 1;

    if (citation.view_link) {
      let rawUrl = citation.view_link;
      if (!rawUrl.includes('#page=')) {
        rawUrl += `#page=${page}`;
      }
      return this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl);
    }

    const doc = this.allDocuments().find(d => d.name === citation.file_name);
    if (doc && doc.objectUrl) {
      const rawUrl = doc.objectUrl + `#page=${page}&title=${encodeURIComponent(citation.file_name)}`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl);
    }
    return null;
  }

  getCitationDownloadUrl(citation: any): string | null {
    if (!citation) return null;
    if (citation.download_link) return citation.download_link;
    const doc = this.allDocuments().find(d => d.name === citation.file_name);
    return doc ? doc.objectUrl : null;
  }

  // ── Streaming ──
  streamingText   = signal<string>('');
  isStreaming     = signal<boolean>(false);
  private streamInterval: any = null;

  messages = computed(() => this.activeConversation()?.messages ?? []);

  // ── Sidebar ──
  sidebarCollapsed = signal(false);
  sidebarWidth     = signal(252);
  private _resizing = false;
  private _resizeStartX = 0;
  private _resizeStartW = 0;

  toggleSidebar() { this.sidebarCollapsed.update(v => !v); }

  startResize(event: MouseEvent) {
    this._resizing     = true;
    this._resizeStartX = event.clientX;
    this._resizeStartW = this.sidebarWidth();
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this._resizing) return;
    const delta = event.clientX - this._resizeStartX;
    const newW  = Math.min(480, Math.max(180, this._resizeStartW + delta));
    this.sidebarWidth.set(newW);
  }

  @HostListener('document:mouseup')
  onMouseUp() { this._resizing = false; }

  // ── Profile dropdown ──
  profileOpen = signal(false);
  currentUser  = signal(localStorage.getItem('ds_current_user') ?? 'User');
  isAdmin      = signal(tokenHasAdminRole(localStorage.getItem('ds_token')));
  toggleProfile(event: MouseEvent) { event.stopPropagation(); this.profileOpen.update(v => !v); }
  closeProfile() { this.profileOpen.set(false); this.openMenuConvId.set(null); }

  toggleTheme() {
    this.darkMode.update(v => !v);
    document.documentElement.setAttribute('data-theme', this.darkMode() ? 'dark' : '');
    localStorage.setItem('ds_theme', this.darkMode() ? 'dark' : 'light');
  }

  // ── Edit conversation title ──
  editingConvId = signal<string | null>(null);
  editingTitle  = signal('');

  startEdit(id: string, title: string, event: MouseEvent) {
    event.stopPropagation();
    this.editingConvId.set(id);
    this.editingTitle.set(title);
  }

  commitEdit(id: string) {
    const t = this.editingTitle().trim();
    if (t) {
      this.conversations.update(cs => cs.map(c => c.id === id ? { ...c, title: t } : c));
      this.saveConversations();
    }
    this.editingConvId.set(null);
  }

  cancelEdit() { this.editingConvId.set(null); }

  openConvMenu(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.openMenuConvId.update(v => v === id ? null : id);
  }

  closeConvMenu() { this.openMenuConvId.set(null); }

  togglePin(id: string, event: MouseEvent) {
    event.stopPropagation();
    const conv = this.conversations().find(c => c.id === id);
    if (!conv) return;
    if (!conv.pinned && this.pinnedCount() >= 3) return;
    this.conversations.update(cs => cs.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
    this.saveConversations();
    this.closeConvMenu();
  }

  onEditKeydown(event: KeyboardEvent, id: string) {
    if (event.key === 'Enter')  { event.preventDefault(); this.commitEdit(id); }
    if (event.key === 'Escape') { this.cancelEdit(); }
  }

  // ── File manager ──
  showUploadModal    = signal(false);
  showManageModal    = signal(false);
  showManageIndexesModal = signal(false);
  stagedFiles        = signal<ManagedFile[]>([]);
  allDocuments       = signal<ManagedFile[]>(this.loadDocuments());
  pendingAttachments = signal<{ id: string; name: string }[]>([]);
  viewingFile        = signal<ManagedFile | null>(null);
  isDragging         = signal(false);
  docCount           = computed(() => this.allDocuments().length);
  manageTab          = signal<'upload' | 'documents'>('documents');

  // -- Delete confirmations --
  deleteConfirmId    = signal<string | null>(null);   // for conversations
  deleteDocConfirmId = signal<string | null>(null);   // for documents

  // ── Suggestion chips ──
  readonly chips = [
    'Summarize this document',
    'What are the key points?',
    'Find action items',
    'Compare these documents',
    'Extract all dates and deadlines',
  ];

  syncChatHistoryFromDb() {
    const rawToken = localStorage.getItem('ds_token');
    if (!rawToken) return;

    this.api.getChatHistory().subscribe({
      next: (dbConversations) => {
        if (!dbConversations || Object.keys(dbConversations).length === 0) {
          return;
        }

        const parsedConvs: Conversation[] = [];
        
        for (const [chatId, entryObj] of Object.entries(dbConversations)) {
          const entry = entryObj as any;
          const messages: Message[] = [];
          
          if (entry.messages && Array.isArray(entry.messages)) {
            for (const msg of entry.messages) {
              const dateVal = msg.timestamp || msg.request_timestamp || msg.response_timestamp || entry.chatDate;
              const date = new Date(dateVal);
              
              if (msg.question) {
                messages.push({
                  role: 'user',
                  content: msg.question,
                  timestamp: date,
                  attachedFiles: msg.metadata?.attachedFiles || []
                });
              }
              if (msg.answer) {
                messages.push({
                  role: 'assistant',
                  content: msg.answer,
                  timestamp: date,
                  citations: msg.citations || msg.metadata?.citations
                });
              }
              
              if (!msg.question && !msg.answer && msg.content) {
                messages.push({
                  role: msg.type === 'user' ? 'user' : 'assistant',
                  content: msg.content,
                  timestamp: date
                });
              }
            }
          }

          parsedConvs.push({
            id: chatId,
            title: entry.chatTitle || 'General Chat',
            messages: messages,
            createdAt: new Date(entry.chatDate || Date.now())
          });
        }

        // Sort by date desc
        parsedConvs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        // Update the conversations signal
        this.conversations.set(parsedConvs);
        this.saveConversations();
        
        // Ensure active Conv is valid
        if (parsedConvs.length > 0 && !this.activeConvId()) {
          this.activeConvId.set(parsedConvs[0].id);
        }
      },
      error: (err) => {
        console.error('Failed to sync chat history from DB:', err);
      }
    });
  }

  clearDbAndLocalStorage() {
    this.api.clearChatHistory().subscribe({
      next: () => {
        this.conversations.set([]);
        localStorage.removeItem(this.convsKey());
        this.activeConvId.set(null);
        this.toast.success('Chat history cleared from database and local storage.');
      },
      error: (err) => {
        console.error('Failed to clear database chat history:', err);
        this.conversations.set([]);
        localStorage.removeItem(this.convsKey());
        this.activeConvId.set(null);
        this.toast.warning('Cleared local chat history, but database failed: ' + (err.error?.message ?? err.message));
      }
    });
  }

  ngAfterViewInit() {
    document.documentElement.setAttribute('data-theme', this.darkMode() ? 'dark' : '');
    
    // Sync chat history from PostgreSQL database on startup
    this.syncChatHistoryFromDb();

    const convs = this.conversations();
    if (convs.length > 0 && !this.activeConvId()) {
      this.activeConvId.set(convs[0].id);
    }
  }

  logout() {
    // Only remove auth tokens — keep ds_documents_<user> and ds_conversations_<user>
    // so data is restored when the same user logs back in
    localStorage.removeItem('ds_token');
    localStorage.removeItem('ds_user_id');
    localStorage.removeItem('ds_current_user');
    localStorage.removeItem('ds_is_admin');
    this.router.navigate(['/login']);
  }

  // ── Conversations ──
  newChat() {
    const empty = this.conversations().find(c => c.messages.length === 0);
    if (empty) {
      this.activeConvId.set(empty.id);
      this.prompt.set('');
      return;
    }
    const id = crypto.randomUUID();
    const conv: Conversation = { id, title: 'New Chat', messages: [], createdAt: new Date() };
    this.conversations.update(c => [conv, ...c]);
    this.saveConversations();
    this.activeConvId.set(id);
    this.prompt.set('');
  }

  selectConversation(id: string) { this.activeConvId.set(id); }

  // ── Delete conversation confirmation ──
  requestDelete(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.deleteConfirmId.set(id);
  }

  confirmDelete() {
    const id = this.deleteConfirmId();
    if (!id) return;
    this.deleteConfirmId.set(null);
    this.conversations.update(c => c.filter(x => x.id !== id));
    this.saveConversations();
    if (this.activeConvId() === id) {
      const remaining = this.conversations();
      this.activeConvId.set(remaining.length ? remaining[0].id : null);
    }
  }

  cancelDelete() { this.deleteConfirmId.set(null); }

  deleteConversation(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.conversations.update(c => c.filter(x => x.id !== id));
    this.saveConversations();
    if (this.activeConvId() === id) {
      const remaining = this.conversations();
      this.activeConvId.set(remaining.length ? remaining[0].id : null);
    }
  }

  useChip(text: string) {
    if (!this.activeConvId()) this.newChat();
    this.prompt.set(text);
    setTimeout(() => this.promptTextarea?.nativeElement?.focus());
  }

  // ── Send ──
  send() {
    const text = this.prompt().trim();
    if (!text || this.loading()) return;

    if (!this.activeConvId()) this.newChat();

    const savedFiles = this.pendingAttachments().map(f => f.name);
    const userMsg: Message = {
      role: 'user',
      content: text,
      attachedFiles: savedFiles.length ? savedFiles : undefined,
      timestamp: new Date()
    };

    this.conversations.update(convs => convs.map(c =>
      c.id === this.activeConvId()
        ? { ...c, title: c.messages.length === 0 ? text.slice(0, 40) : c.title, messages: [...c.messages, userMsg] }
        : c
    ));
    this.saveConversations();

    this.prompt.set('');
    this.pendingAttachments.set([]);
    this.stagedFiles.set([]);
    this.resetTextareaHeight();
    this.loading.set(true);
    setTimeout(() => this.scrollToBottom());

    const currentUser = localStorage.getItem('ds_current_user') ?? 'anonymous';
    const userId = localStorage.getItem('ds_user_id') ?? undefined;
    const convId = this.activeConvId()!;
    const questionIndex = this.messages().length;

    const payload = {
      metadata: { serviceReferenceId: crypto.randomUUID() },
      requestData: {
        request_id: crypto.randomUUID(),
        email: currentUser,
        username: currentUser.split('@')[0],
        question: text,
        question_id: questionIndex,
        conversation_id: convId,
        product_name: 'MM',
        profile: 'dev',
        user_id: userId,
        attached_files: savedFiles.length ? savedFiles : undefined
      }
    };

    const cacheKey = `${convId}:${text.toLowerCase()}`;
    if (this.queryCache.has(cacheKey)) {
      setTimeout(() => {
        const cachedRes = this.queryCache.get(cacheKey);
        const answerText = cachedRes.responseData?.answer?.[0]?.Text
          ?? cachedRes.responseData?.standalone_query
          ?? 'No answer returned.';
        const citations = cachedRes.responseData?.citations;
        this.loading.set(false);
        this.streamResponse(answerText, convId, citations);
      }, 400);
      return;
    }

    this.api.query(payload).subscribe({
      next: (res) => {
        this.queryCache.set(cacheKey, res);
        this.saveQueryCache();
        const answerText = res.responseData?.answer?.[0]?.Text
          ?? res.responseData?.standalone_query
          ?? 'No answer returned.';
        const citations = res.responseData?.citations;
        this.loading.set(false);
        this.streamResponse(answerText, convId, citations);
      },
      error: (err) => {
        let msg: string;
        if (err.status === 401)      msg = 'Session expired. Redirecting to login…';
        else if (err.status === 403) msg = 'Access denied. You may not have permission for this action.';
        else if (err.status === 0)   msg = 'Cannot reach the backend. Is it running on port 8085?';
        else                         msg = err.error?.message ?? err.message ?? 'Unexpected error. Please try again.';
        const errorMsg: Message = { role: 'assistant', content: `Error: ${msg}`, timestamp: new Date() };
        this.conversations.update(convs => convs.map(c =>
          c.id === this.activeConvId() ? { ...c, messages: [...c.messages, errorMsg] } : c
        ));
        this.saveConversations();
        this.loading.set(false);
        setTimeout(() => this.scrollToBottom());
      }
    });
  }

  private streamResponse(fullText: string, convId: string, citations?: any) {
    this.isStreaming.set(true);
    this.streamingText.set('');
    let i = 0;
    const total = fullText.length;
    const tickMs = 18;
    const charsPerTick = Math.max(1, Math.ceil((total / Math.min(2400, Math.max(600, total * 10))) * tickMs));
    this.streamInterval = setInterval(() => {
      i = Math.min(i + charsPerTick, total);
      this.streamingText.set(fullText.slice(0, i));
      this.scrollToBottom();
      if (i >= total) {
        clearInterval(this.streamInterval);
        this.streamingText.set('');
        this.isStreaming.set(false);
        const assistantMsg: Message = { role: 'assistant', content: fullText, timestamp: new Date(), citations };
        this.conversations.update(convs => convs.map(c =>
          c.id === convId ? { ...c, messages: [...c.messages, assistantMsg] } : c
        ));
        this.saveConversations();
        setTimeout(() => this.scrollToBottom());
      }
    }, tickMs);
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.send(); }
  }

  onInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    this.prompt.set(ta.value);
  }

  private resetTextareaHeight() {
    if (this.promptTextarea?.nativeElement) this.promptTextarea.nativeElement.style.height = 'auto';
  }

  private scrollToBottom() {
    this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Upload Modal ──
  openModal()        { this.showUploadModal.set(true); }
  closeModal()       { this.showUploadModal.set(false); }
  openManageModal()  { this.showManageIndexesModal.set(false); this.showManageModal.set(true); }
  closeManageModal() { this.showManageModal.set(false); this.manageTab.set('documents'); }
  openManageIndexesModal()  {
    if (!this.isAdmin()) return;
    this.showManageModal.set(false);
    this.showManageIndexesModal.set(true);
  }
  closeManageIndexesModal() { this.showManageIndexesModal.set(false); }

  onDragOver(event: DragEvent) { event.preventDefault(); this.isDragging.set(true); }
  onDragLeave() { this.isDragging.set(false); }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onModalFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  private addFiles(files: File[]) {
    const allowed = ['application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const newFiles: ManagedFile[] = files
      .filter(f => allowed.includes(f.type) || f.name.endsWith('.docx') || f.name.endsWith('.pdf'))
      .map(f => {
        const objectUrl = URL.createObjectURL(f);
        return {
          id: crypto.randomUUID(), file: f, name: f.name,
          size: this.formatSize(f.size), type: f.type, saved: false,
          objectUrl, safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl)
        };
      });
    this.stagedFiles.update(existing => [...existing, ...newFiles]);
  }

  updateDocUploadingState(id: string, uploading: boolean, success: boolean, errorMsg?: string) {
    this.allDocuments.update(docs => docs.map(d => {
      if (d.id === id) {
        return {
          ...d,
          uploading,
          uploadSuccess: success,
          uploadError: errorMsg
        };
      }
      return d;
    }));
    this.saveDocuments();
  }

  // Save one staged file → move to allDocuments, remove from staged
  saveFile(id: string) {
    const f = this.stagedFiles().find(f => f.id === id);
    if (!f) return;
    
    // Automatically initialize a chat conversation UUID if none is active
    if (!this.activeConvId()) {
      this.newChat();
    }
    
    const sessionTitle = this.activeConversation()?.title ?? 'General';
    const newDoc: ManagedFile = {
      ...f,
      saved: true,
      sessionTitle,
      uploading: true,
      uploadSuccess: false
    };
    this.allDocuments.update(docs => [...docs, newDoc]);
    this.stagedFiles.update(files => files.filter(x => x.id !== id));
    this.pendingAttachments.update(p => [...p, { id: f.id, name: f.name }]);
    this.saveDocuments();

    const username = localStorage.getItem('ds_current_user') ?? 'anonymous';
    const folderId = this.activeConvId() ?? 'default';
    this.api.uploadDocument(f.file, folderId, username).subscribe({
      next: () => {
        this.updateDocUploadingState(f.id, false, true);
        this.toast.success(`"${f.name}" uploaded successfully.`);
      },
      error: (err) => {
        console.error('Upload failed for', f.name, err);
        const errMsg = err.error?.message ?? err.message ?? 'Upload failed';
        this.updateDocUploadingState(f.id, false, false, errMsg);
        this.toast.error(`"${f.name}" upload failed: ${errMsg}`);
      }
    });
  }

  // Save all staged files → move all to allDocuments, clear staged
  saveAllFiles() {
    const unsaved = this.stagedFiles();
    if (unsaved.length === 0) return;
    
    // Automatically initialize a chat conversation UUID if none is active
    if (!this.activeConvId()) {
      this.newChat();
    }
    
    const sessionTitle = this.activeConversation()?.title ?? 'General';
    const docsToAdd = unsaved.map(f => ({
      ...f,
      saved: true,
      sessionTitle,
      uploading: true,
      uploadSuccess: false
    }));
    this.allDocuments.update(docs => [...docs, ...docsToAdd]);
    this.stagedFiles.set([]);
    this.pendingAttachments.update(p => [...p, ...unsaved.map(f => ({ id: f.id, name: f.name }))]);
    this.saveDocuments();

    const username = localStorage.getItem('ds_current_user') ?? 'anonymous';
    const folderId = this.activeConvId() ?? 'default';
    unsaved.forEach(f => {
      this.api.uploadDocument(f.file, folderId, username).subscribe({
        next: () => {
          this.updateDocUploadingState(f.id, false, true);
          this.toast.success(`"${f.name}" uploaded successfully.`);
        },
        error: (err) => {
          console.error('Upload failed for', f.name, err);
          const errMsg = err.error?.message ?? err.message ?? 'Upload failed';
          this.updateDocUploadingState(f.id, false, false, errMsg);
          this.toast.error(`"${f.name}" upload failed: ${errMsg}`);
        }
      });
    });
  }

  removePending(id: string) {
    this.pendingAttachments.update(p => p.filter(f => f.id !== id));
    const doc = this.allDocuments().find(d => d.id === id);
    if (doc) {
      if (doc.objectUrl) URL.revokeObjectURL(doc.objectUrl);
      this.allDocuments.update(docs => docs.filter(d => d.id !== id));
      this.saveDocuments();
      if (this.viewingFile()?.id === id) this.viewingFile.set(null);
    }
  }

  removeStagedFile(id: string) {
    const f = this.stagedFiles().find(f => f.id === id);
    if (!f) return;
    if (f.objectUrl) URL.revokeObjectURL(f.objectUrl);
    this.stagedFiles.update(files => files.filter(x => x.id !== id));
  }

  // ── Delete document confirmation ──
  requestDeleteDocument(id: string) { this.deleteDocConfirmId.set(id); }
  cancelDeleteDocument()            { this.deleteDocConfirmId.set(null); }

  confirmDeleteDocument() {
    const id = this.deleteDocConfirmId();
    if (!id) return;
    this.deleteDocConfirmId.set(null);
    const f = this.allDocuments().find(f => f.id === id);
    if (f?.objectUrl) URL.revokeObjectURL(f.objectUrl);
    this.allDocuments.update(docs => docs.filter(d => d.id !== id));
    this.saveDocuments();
    if (this.viewingFile()?.id === id) this.viewingFile.set(null);
  }

  viewFile(file: ManagedFile) { this.viewingFile.set(file); }
  closeViewer()               { this.viewingFile.set(null); }

  downloadFile(f: ManagedFile) {
    const a = document.createElement('a');
    a.href = f.objectUrl;
    a.download = f.name;
    a.click();
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  getFileIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('image')) return '🖼️';
    if (type.includes('text')) return '📃';
    return '📁';
  }

  getFileExtension(name: string): string {
    return name.split('.').pop()?.toUpperCase() ?? 'FILE';
  }

  onChatFileSelected(event: any) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Automatically initialize a chat conversation UUID if none is active
    if (!this.activeConvId()) {
      this.newChat();
    }

    const sessionTitle = this.activeConversation()?.title ?? 'General';
    const folderId = this.activeConvId() ?? 'default';
    const username = localStorage.getItem('ds_current_user') ?? 'anonymous';

    Array.from(files).forEach((file: any) => {
      const id = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);
      const newDoc: ManagedFile = {
        id,
        file: file,
        name: file.name,
        size: this.formatSize(file.size),
        type: file.type || 'application/octet-stream',
        saved: true,
        sessionTitle,
        uploading: true,
        uploadSuccess: false,
        objectUrl,
        safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl)
      };

      // Add to allDocuments list
      this.allDocuments.update(docs => [...docs, newDoc]);
      // Immediately queue in pendingAttachments so it attaches to the active query!
      this.pendingAttachments.update(p => [...p, { id, name: file.name }]);
      this.saveDocuments();

      this.api.uploadDocument(file, folderId, username).subscribe({
        next: () => {
          this.updateDocUploadingState(id, false, true);
          this.toast.success(`"${file.name}" uploaded and attached successfully.`);
        },
        error: (err) => {
          console.error('Upload failed for', file.name, err);
          const errMsg = err.error?.message ?? err.message ?? 'Upload failed';
          this.updateDocUploadingState(id, false, false, errMsg);
          this.toast.error(`"${file.name}" upload failed: ${errMsg}`);
        }
      });
    });

    event.target.value = '';
  }

  removePendingAttachment(id: string) {
    this.pendingAttachments.update(p => p.filter(f => f.id !== id));
  }
}
