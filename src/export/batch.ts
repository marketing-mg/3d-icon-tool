import { zipSync } from 'fflate';
import type { IconRef } from '../icons/phosphor';

/** PNGs are already compressed, so store them without deflate (level 0). */
export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) entries[f.name] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  return new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

export type BatchItem = IconRef;
