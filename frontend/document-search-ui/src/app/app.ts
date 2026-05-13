import {
  Component, signal, ElementRef, ViewChild, computed, inject, AfterViewInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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
  sessionTitle?: string; // which conversation this was saved under
}

@Component({
  selector: 'app-root',
  imports: [FormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit {
  private sanitizer = inject(DomSanitizer);

  @ViewChild('messagesEnd') messagesEnd!: ElementRef;
  @ViewChild('promptTextarea') promptTextarea!: ElementRef<HTMLTextAreaElement>;

  // ── Chat state ──
  conversations = signal<Conversation[]>([]);
  activeConvId = signal<string | null>(null);
  prompt = signal('');
  loading = signal(false);

  activeConversation = computed(() =>
    this.conversations().find(c => c.id === this.activeConvId()) ?? null
  );
  messages = computed(() => this.activeConversation()?.messages ?? []);

  // ── File manager ──
  showUploadModal = signal(false); // Upload Documents modal
  showManageModal  = signal(false); // Manage All Documents modal
  stagedFiles      = signal<ManagedFile[]>([]); // picked but not yet saved
  allDocuments     = signal<ManagedFile[]>([]); // all saved docs (across sessions)
  pendingAttachments = signal<{ id: string; name: string }[]>([]); // queued for next send
  viewingFile      = signal<ManagedFile | null>(null);
  isDragging       = signal(false);
  docCount         = computed(() => this.allDocuments().length);

  // ── Suggestion chips ──
  readonly chips = [
    'Summarize this document',
    'What are the key points?',
    'Find action items',
    'Compare these documents',
    'Extract all dates and deadlines',
  ];

  ngAfterViewInit() { }

  // ── Conversations ──
  newChat() {
    const id = crypto.randomUUID();
    const conv: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: new Date()
    };
    this.conversations.update(c => [conv, ...c]);
    this.activeConvId.set(id);
    this.prompt.set('');
  }

  selectConversation(id: string) {
    this.activeConvId.set(id);
  }

  deleteConversation(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.conversations.update(c => c.filter(x => x.id !== id));
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
  async send() {
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
        ? {
            ...c,
            title: c.messages.length === 0 ? text.slice(0, 40) : c.title,
            messages: [...c.messages, userMsg]
          }
        : c
    ));

    this.prompt.set('');
    this.pendingAttachments.set([]);  // clear pre-send chips
    this.stagedFiles.set([]);         // clear upload modal — files already in allDocuments
    this.resetTextareaHeight();
    this.loading.set(true);
    setTimeout(() => this.scrollToBottom());

    // TODO: replace with real API call to POST /query
    await new Promise(r => setTimeout(r, 1200));

    const assistantMsg: Message = {
      role: 'assistant',
      content: 'This is a placeholder response. Connect this to your Spring AI backend at POST /query.',
      timestamp: new Date()
    };

    this.conversations.update(convs => convs.map(c =>
      c.id === this.activeConvId()
        ? { ...c, messages: [...c.messages, assistantMsg] }
        : c
    ));

    this.loading.set(false);
    setTimeout(() => this.scrollToBottom());
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  onInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    this.prompt.set(ta.value);
  }

  private resetTextareaHeight() {
    if (this.promptTextarea?.nativeElement) {
      this.promptTextarea.nativeElement.style.height = 'auto';
    }
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
  closeManageModal() { this.showManageModal.set(false); }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave() { this.isDragging.set(false); }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    this.addFiles(files);
  }

  onModalFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  private addFiles(files: File[]) {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const newFiles: ManagedFile[] = files
      .filter(f => allowed.includes(f.type) || f.name.endsWith('.docx') || f.name.endsWith('.pdf'))
      .map(f => {
        const objectUrl = URL.createObjectURL(f);
        return {
          id: crypto.randomUUID(),
          file: f,
          name: f.name,
          size: this.formatSize(f.size),
          type: f.type,
          saved: false,
          objectUrl,
          safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl)
        };
      });
    this.stagedFiles.update(existing => [...existing, ...newFiles]);
  }

  // Move one staged file into allDocuments (saved to DB) — keep visible in upload modal
  saveFile(id: string) {
    const f = this.stagedFiles().find(f => f.id === id);
    if (!f || f.saved) return; // already saved
    const sessionTitle = this.activeConversation()?.title ?? 'General';
    const saved = { ...f, saved: true, sessionTitle };
    this.allDocuments.update(docs => [...docs, saved]);
    this.stagedFiles.update(files => files.map(x => x.id === id ? { ...x, saved: true } : x));
    this.pendingAttachments.update(p => [...p, { id: f.id, name: f.name }]);
  }

  // Save every staged file at once — keep visible in upload modal
  saveAllFiles() {
    const sessionTitle = this.activeConversation()?.title ?? 'General';
    const unsaved = this.stagedFiles().filter(f => !f.saved);
    if (unsaved.length === 0) return;
    const toSave = unsaved.map(f => ({ ...f, saved: true, sessionTitle }));
    this.allDocuments.update(docs => [...docs, ...toSave]);
    this.stagedFiles.update(files => files.map(f => ({ ...f, saved: true })));
    this.pendingAttachments.update(p => [...p, ...unsaved.map(f => ({ id: f.id, name: f.name }))]);
  }

  // Remove a file from the pending chips without deleting it from allDocuments
  removePending(id: string) {
    this.pendingAttachments.update(p => p.filter(f => f.id !== id));
  }

  // Remove a staged file — if already saved, also remove from allDocuments + pendingAttachments
  removeStagedFile(id: string) {
    const f = this.stagedFiles().find(f => f.id === id);
    if (!f) return;
    URL.revokeObjectURL(f.objectUrl);
    this.stagedFiles.update(files => files.filter(x => x.id !== id));
    if (f.saved) {
      this.allDocuments.update(docs => docs.filter(x => x.id !== id));
      this.pendingAttachments.update(p => p.filter(x => x.id !== id));
    }
  }

  // Delete a saved document from allDocuments (calls DB delete in future)
  deleteDocument(id: string) {
    const f = this.allDocuments().find(f => f.id === id);
    if (f) URL.revokeObjectURL(f.objectUrl);
    this.allDocuments.update(docs => docs.filter(d => d.id !== id));
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
