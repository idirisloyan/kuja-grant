'use client';

/**
 * Phase 128 — Inline document preview.
 *
 * After upload, NGOs need to verify they sent the right file without
 * leaving the page. This component renders a thumbnail-ish preview
 * inline: PDFs in an <iframe>, images directly, text snippets, and a
 * fallback file card for everything else.
 *
 * Self-gated: returns a compact "no preview available" card for
 * unrecognized mime types — never breaks the page.
 *
 * Usage:
 *   <InlineDocPreview docId={42} filename="MOU.pdf" mimeType="application/pdf" />
 */

import { useState } from 'react';
import { FileText, FileImage, FileQuestion, Eye, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  docId: number;
  filename: string;
  mimeType?: string | null;
  fileSize?: number | null;
  /** Show preview opened by default. */
  initiallyOpen?: boolean;
  className?: string;
}

function humanSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let s = bytes;
  let i = 0;
  while (s >= 1024 && i < u.length - 1) {
    s /= 1024;
    i++;
  }
  return `${s.toFixed(s < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function InlineDocPreview({
  docId, filename, mimeType, fileSize, initiallyOpen = false, className,
}: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const src = `/api/documents/${docId}/raw`;
  const mime = (mimeType || '').toLowerCase();
  const isPdf = mime === 'application/pdf';
  const isImage = mime.startsWith('image/');
  const isText = mime === 'text/plain' || mime === 'text/csv';
  const supportsPreview = isPdf || isImage || isText;

  const Icon = isImage ? FileImage : isPdf || isText ? FileText : FileQuestion;

  return (
    <div className={cn('rounded-md border border-border bg-card', className)}>
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" title={filename}>
            {filename}
          </div>
          {(mime || fileSize) && (
            <div className="text-[11px] text-muted-foreground">
              {mime}
              {mime && fileSize ? ' · ' : ''}
              {fileSize ? humanSize(fileSize) : ''}
            </div>
          )}
        </div>
        {supportsPreview ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
            title={open ? 'Hide preview' : 'Show inline preview'}
          >
            {open ? <X className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {open ? 'Hide' : 'Preview'}
          </button>
        ) : (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        )}
      </div>

      {open && supportsPreview && (
        <div className="border-t border-border bg-muted/30 p-2">
          {isPdf && (
            <iframe
              src={src}
              title={`Preview of ${filename}`}
              className="w-full h-[400px] rounded border border-border bg-white"
            />
          )}
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={filename}
              className="max-h-[400px] w-auto rounded border border-border bg-white mx-auto"
            />
          )}
          {isText && (
            <iframe
              src={src}
              title={`Preview of ${filename}`}
              className="w-full h-[300px] rounded border border-border bg-white"
            />
          )}
        </div>
      )}
    </div>
  );
}
