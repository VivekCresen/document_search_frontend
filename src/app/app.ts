import {
  Component, signal, ElementRef, ViewChild, computed, inject, AfterViewInit, HostListener
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from './services/api.service';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  attachedFiles?: string[];
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
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
}

@Component({
  selector: 'app-chat',
  imports: [FormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit {
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private api = inject(ApiService);

  private queryCache = new Map<string, any>();

  @ViewChild('messagesEnd') messagesEnd!: ElementRef;
  @ViewChild('promptTextarea') promptTextarea!: ElementRef<HTMLTextAreaElement>;

  // ── Persistence helpers ──
  private loadConversations(): Conversation[] {
    try {
      const raw = localStorage.getItem('ds_conversations');
      if (!raw) return [];
      return (JSON.parse(raw) as any[]).map(c => ({
        ...c,
        createdAt: new Date(c.createdAt),
        messages: c.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
      }));
    } catch { return []; }
  }

  private saveConversations() {
    localStorage.setItem('ds_conversations', JSON.stringify(this.conversations()));
  }

  private loadDocuments(): ManagedFile[] {
    try {
      const raw = localStorage.getItem('ds_documents');
      if (!raw) return [];
      return (JSON.parse(raw) as any[]).map(d => ({
        ...d, file: null as any, objectUrl: '', safeUrl: '' as any
      }));
    } catch { return []; }
  }

  private saveDocuments() {
    const serializable = this.allDocuments().map(({ file, objectUrl, safeUrl, ...rest }) => rest);
    localStorage.setItem('ds_documents', JSON.stringify(serializable));
  }

  // ── Chat state ──
  conversations = signal<Conversation[]>(this.loadConversations());
  activeConvId = signal<string | null>(null);
  prompt = signal('');
  loading = signal(false);

  activeConversation = computed(() =>
    this.conversations().find(c => c.id === this.activeConvId()) ?? null
  );
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
  toggleProfile(event: MouseEvent) { event.stopPropagation(); this.profileOpen.update(v => !v); }
  closeProfile() { this.profileOpen.set(false); }

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

  onEditKeydown(event: KeyboardEvent, id: string) {
    if (event.key === 'Enter')  { event.preventDefault(); this.commitEdit(id); }
    if (event.key === 'Escape') { this.cancelEdit(); }
  }

  // ── File manager ──
  showUploadModal    = signal(false);
  showManageModal    = signal(false);
  stagedFiles        = signal<ManagedFile[]>([]);
  allDocuments       = signal<ManagedFile[]>(this.loadDocuments());
  pendingAttachments = signal<{ id: string; name: string }[]>([]);
  viewingFile        = signal<ManagedFile | null>(null);
  isDragging         = signal(false);
  docCount           = computed(() => this.allDocuments().length);
  manageTab          = signal<'upload' | 'documents'>('documents');

  // ── Delete confirmations ──
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

  ngAfterViewInit() {
    const convs = this.conversations();
    if (convs.length > 0 && !this.activeConvId()) {
      this.activeConvId.set(convs[0].id);
    }
  }

  logout() {
    localStorage.removeItem('ds_current_user');
    localStorage.removeItem('ds_token');
    localStorage.removeItem('ds_user_id');
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
        user_id: userId
      }
    };

    const cacheKey = `${convId}:${text.toLowerCase()}`;
    if (this.queryCache.has(cacheKey)) {
      setTimeout(() => {
        const cachedRes = this.queryCache.get(cacheKey);
        const answerText = cachedRes.responseData?.answer?.[0]?.Text
          ?? cachedRes.responseData?.standalone_query
          ?? 'No answer returned.';
        const assistantMsg: Message = { role: 'assistant', content: answerText, timestamp: new Date() };
        this.conversations.update(convs => convs.map(c =>
          c.id === this.activeConvId() ? { ...c, messages: [...c.messages, assistantMsg] } : c
        ));
        this.saveConversations();
        this.loading.set(false);
        setTimeout(() => this.scrollToBottom());
      }, 400);
      return;
    }

    this.api.query(payload).subscribe({
      next: (res) => {
        this.queryCache.set(cacheKey, res);
        const answerText = res.responseData?.answer?.[0]?.Text
          ?? res.responseData?.standalone_query
          ?? 'No answer returned.';
        const assistantMsg: Message = { role: 'assistant', content: answerText, timestamp: new Date() };
        this.conversations.update(convs => convs.map(c =>
          c.id === this.activeConvId() ? { ...c, messages: [...c.messages, assistantMsg] } : c
        ));
        this.saveConversations();
        this.loading.set(false);
        setTimeout(() => this.scrollToBottom());
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
  openManageModal()  { this.showManageModal.set(true); }
  closeManageModal() { this.showManageModal.set(false); this.manageTab.set('documents'); }

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

  // Save one staged file → move to allDocuments, remove from staged
  saveFile(id: string) {
    const f = this.stagedFiles().find(f => f.id === id);
    if (!f) return;
    const sessionTitle = this.activeConversation()?.title ?? 'General';
    this.allDocuments.update(docs => [...docs, { ...f, saved: true, sessionTitle }]);
    this.stagedFiles.update(files => files.filter(x => x.id !== id));
    this.pendingAttachments.update(p => [...p, { id: f.id, name: f.name }]);
    this.saveDocuments();

    const username = localStorage.getItem('ds_current_user') ?? 'anonymous';
    const folderId = this.activeConvId() ?? 'default';
    this.api.uploadDocument(f.file, folderId, username).subscribe({
      next: () => {},
      error: (err) => console.error('Upload failed for', f.name, err)
    });
  }

  // Save all staged files → move all to allDocuments, clear staged
  saveAllFiles() {
    const sessionTitle = this.activeConversation()?.title ?? 'General';
    const unsaved = this.stagedFiles();
    if (unsaved.length === 0) return;
    this.allDocuments.update(docs => [...docs, ...unsaved.map(f => ({ ...f, saved: true, sessionTitle }))]);
    this.stagedFiles.set([]);
    this.pendingAttachments.update(p => [...p, ...unsaved.map(f => ({ id: f.id, name: f.name }))]);
    this.saveDocuments();

    const username = localStorage.getItem('ds_current_user') ?? 'anonymous';
    const folderId = this.activeConvId() ?? 'default';
    unsaved.forEach(f => {
      this.api.uploadDocument(f.file, folderId, username).subscribe({
        next: () => {},
        error: (err) => console.error('Upload failed for', f.name, err)
      });
    });
  }

  removePending(id: string) {
    this.pendingAttachments.update(p => p.filter(f => f.id !== id));
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
}
