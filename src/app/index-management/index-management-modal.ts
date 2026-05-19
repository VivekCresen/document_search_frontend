import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService, BlobInventoryItem } from '../services/api.service';

interface IndexOperationSection {
  title: string;
  accent: string;
  items: { number: number; title: string; description: string }[];
}

@Component({
  selector: 'app-index-management-modal',
  imports: [CommonModule],
  templateUrl: './index-management-modal.html'
})
export class IndexManagementModal {
  @Output() close = new EventEmitter<void>();

  readonly indexOperationSections: IndexOperationSection[] = [
    {
      title: '📥 INDEXING OPERATIONS',
      accent: 'index-accent-blue',
      items: [
        { number: 1, title: 'Create/Update Index Schema', description: 'Prepare or refresh the searchable index structure before documents are added.' },
        { number: 2, title: 'Index New Files (Incremental)', description: 'Add only newly uploaded files while keeping the existing index content intact.' },
        { number: 3, title: 'Re-index All Files (Full Refresh)', description: 'Rebuild the complete index from the available document set.' },
        { number: 4, title: 'Re-index Specific File', description: 'Refresh index entries for a single selected file.' },
      ]
    },
    {
      title: '🗑️ DELETE OPERATIONS',
      accent: 'index-accent-red',
      items: [
        { number: 5, title: 'Delete File from Index (by filename)', description: 'Remove one document from the search index by matching its filename.' },
        { number: 6, title: 'Delete All Documents (clear index)', description: 'Clear every indexed document while leaving the app available for a fresh index.' },
      ]
    },
    {
      title: '📊 INFORMATION',
      accent: 'index-accent-green',
      items: [
        { number: 7, title: 'View Index Statistics', description: 'Review document counts and index health information.' },
        { number: 8, title: 'View Indexed Files Log', description: 'Open the latest record of files currently tracked by the index.' },
        { number: 9, title: 'Validate CSV vs Index Sync', description: 'Compare the source CSV records with indexed documents to spot differences.' },
      ]
    },
    {
      title: '🔧 INDEX MANAGEMENT',
      accent: 'index-accent-amber',
      items: [
        { number: 10, title: 'List All Indexes', description: 'Show every available index in the connected search service.' },
        { number: 11, title: 'Delete Index', description: 'Remove a selected index from the search service.' },
      ]
    },
    {
      title: '🚪 EXIT',
      accent: 'index-accent-slate',
      items: [
        { number: 12, title: 'Exit', description: 'Close this admin panel and return to the current conversation.' },
      ]
    }
  ];

  expandedIndexSection   = signal<string | null>(null);
  expandedIndexOperation = signal<number | null>(null);
  runningOp              = signal<number | null>(null);
  lastRunOp              = signal<number | null>(null);
  opResult               = signal<string | null>(null);
  opError                = signal<string | null>(null);
  blobList               = signal<BlobInventoryItem[]>([]);
  indexList              = signal<string[]>([]);

  private api = inject(ApiService);

  toggleIndexSection(title: string) {
    this.expandedIndexSection.update(current => current === title ? null : title);
  }

  selectIndexOperation(sectionTitle: string, itemNumber: number, event?: MouseEvent) {
    event?.stopPropagation();
    this.expandedIndexSection.set(sectionTitle);
    this.expandedIndexOperation.update(current => current === itemNumber ? null : itemNumber);
    // Clear previous results when switching operation
    if (this.lastRunOp() !== itemNumber) {
      this.opResult.set(null);
      this.opError.set(null);
      this.blobList.set([]);
      this.indexList.set([]);
    }
  }

  async runOperation(opNumber: number, event?: MouseEvent) {
    event?.stopPropagation();
    if (this.runningOp() !== null) return;
    this.runningOp.set(opNumber);
    this.lastRunOp.set(opNumber);
    this.opResult.set(null);
    this.opError.set(null);
    this.blobList.set([]);
    this.indexList.set([]);
    try {
      switch (opNumber) {
        case 1: {
          const res = await firstValueFrom(this.api.createOrUpdateIndexSchema());
          this.opResult.set(`Index schema created/updated. Index: "${res['index'] ?? 'done'}".`);
          break;
        }
        case 2: {
          const scan = await firstValueFrom(this.api.scanAndQueue());
          const proc = await firstValueFrom(this.api.processJobs());
          this.opResult.set(
            `Scanned ${scan.scanned} blobs, queued ${scan.queuedForIngestion} for ingestion. ` +
            `Processed ${proc.processed} job(s): ${proc.succeeded} succeeded, ${proc.failed} failed.`
          );
          break;
        }
        case 3: {
          const requeue = await firstValueFrom(this.api.requeueStableFiles());
          const proc    = await firstValueFrom(this.api.processJobs());
          this.opResult.set(
            `Reset ${requeue.queued} stable file(s) for re-indexing. ` +
            `Processed ${proc.processed} job(s): ${proc.succeeded} succeeded, ${proc.failed} failed.`
          );
          break;
        }
        case 4: {
          const blobs = await firstValueFrom(this.api.listIndexableBlobs());
          this.blobList.set(blobs);
          this.opResult.set(`${blobs.length} file${blobs.length !== 1 ? 's' : ''} available. Click the re-index action next to a file.`);
          break;
        }
        case 5: {
          const blobs = await firstValueFrom(this.api.listIndexableBlobs());
          this.blobList.set(blobs);
          this.opResult.set(`${blobs.length} file${blobs.length !== 1 ? 's' : ''} available. File-level delete is handled by removing the source blob, then running incremental indexing.`);
          break;
        }
        case 6: {
          const res = await firstValueFrom(this.api.clearIndexDocuments());
          this.opResult.set(`Cleared ${res['deletedDocuments'] ?? 0} document(s) from index "${res['index'] ?? 'configured index'}".`);
          break;
        }
        case 7: {
          const [pend, stable, failed] = await Promise.all([
            firstValueFrom(this.api.countJobs('to_be_ingested')),
            firstValueFrom(this.api.countJobs('stable')),
            firstValueFrom(this.api.countJobs('failed')),
          ]);
          this.opResult.set(
            `Pending: ${pend['to_be_ingested'] ?? pend['count'] ?? 0}  |  ` +
            `Stable: ${stable['stable'] ?? stable['count'] ?? 0}  |  ` +
            `Failed: ${failed['failed'] ?? failed['count'] ?? 0}`
          );
          break;
        }
        case 8: {
          const blobs = await firstValueFrom(this.api.listIndexableBlobs());
          this.blobList.set(blobs);
          this.opResult.set(`${blobs.length} indexable blob${blobs.length !== 1 ? 's' : ''} found.`);
          break;
        }
        case 9: {
          const [blobs, pend, stable, failed] = await Promise.all([
            firstValueFrom(this.api.listIndexableBlobs()),
            firstValueFrom(this.api.countJobs('to_be_ingested')),
            firstValueFrom(this.api.countJobs('stable')),
            firstValueFrom(this.api.countJobs('failed')),
          ]);
          this.blobList.set(blobs);
          this.opResult.set(
            `Validated ${blobs.length} source blob${blobs.length !== 1 ? 's' : ''}. ` +
            `Pending: ${pend['to_be_ingested'] ?? pend['count'] ?? 0}, ` +
            `stable: ${stable['stable'] ?? stable['count'] ?? 0}, ` +
            `failed: ${failed['failed'] ?? failed['count'] ?? 0}.`
          );
          break;
        }
        case 10: {
          const res = await firstValueFrom(this.api.listIndexes());
          this.indexList.set(res.indexes ?? []);
          this.opResult.set(`${this.indexList().length} index${this.indexList().length !== 1 ? 'es' : ''} found.`);
          break;
        }
        case 11: {
          const res = await firstValueFrom(this.api.deleteConfiguredIndex());
          this.opResult.set(`Deleted index "${res['index'] ?? 'configured index'}".`);
          break;
        }
        case 12: {
          this.closeModal();
          break;
        }
      }
    } catch (err: any) {
      const message = err?.status === 401
        ? 'Admin session expired. Please log in again.'
        : err?.status === 403
          ? 'Admin role is required for this action.'
          : err?.error?.message ?? err?.message ?? 'Operation failed. Check that the indexing service is running on port 8086.';
      this.opError.set(message);
    } finally {
      this.runningOp.set(null);
    }
  }

  async triggerSingleBlob(blob: BlobInventoryItem, event: MouseEvent) {
    event.stopPropagation();
    try {
      const res = await firstValueFrom(this.api.triggerBlobIndexing({
        blobUri: blob.blobUri,
        blobName: blob.blobName,
        fileName: blob.fileName
      }));
      const queued = res['queued'] !== false;
      this.opResult.set(`"${blob.fileName}": ${queued ? 'Queued for re-indexing.' : 'Already queued or stable.'}`);
    } catch (err: any) {
      this.opError.set(`Trigger failed for "${blob.fileName}": ${err?.error?.message ?? err?.message}`);
    }
  }

  formatSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  closeModal() {
    this.close.emit();
  }
}
