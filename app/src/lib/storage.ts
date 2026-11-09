import { supabase } from './supabase';

// Proof files live in the private `proofs` bucket, in the deal's folder. Only the deal's creator can upload there,
// nobody can overwrite or delete, and both parties open files through links that expire.

export const PROOF_BUCKET = 'proofs';
export const MAX_PROOF_BYTES = 50 * 1024 * 1024;

/** Where a file goes: `<deal id>/<time>-<safe name>`, so names never clash and the database can tell its deal. */
export function proofPath(dealId: string, fileName: string, now = Date.now()): string {
  const safe =
    fileName
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(-80) || 'proof';
  return `${dealId}/${now.toString(36)}-${safe}`;
}

/** The name a person recognises: "2299110-stream.png" → "stream.png". */
export function proofFileName(path: string): string {
  return (path.split('/').pop() ?? path).replace(/^[a-z0-9]+-/, '');
}

export async function uploadProof(dealId: string, file: File): Promise<string> {
  if (file.size > MAX_PROOF_BYTES) throw new Error('Files can be up to 50 MB. Share a link for anything bigger.');
  const path = proofPath(dealId, file.name);
  const { error } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

/** A link to a proof file that works for an hour, for the deal's two parties only. */
export async function proofFileUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}
