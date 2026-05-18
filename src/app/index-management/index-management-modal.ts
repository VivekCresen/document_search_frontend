import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, signal } from '@angular/core';

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

  expandedIndexSection = signal<string | null>(null);
  expandedIndexOperation = signal<number | null>(null);

  toggleIndexSection(title: string) {
    this.expandedIndexSection.update(current => current === title ? null : title);
  }

  selectIndexOperation(sectionTitle: string, itemNumber: number, event?: MouseEvent) {
    event?.stopPropagation();
    this.expandedIndexSection.set(sectionTitle);
    this.expandedIndexOperation.update(current => current === itemNumber ? null : itemNumber);
  }

  closeModal() {
    this.close.emit();
  }
}
