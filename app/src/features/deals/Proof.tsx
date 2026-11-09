import { useEffect, useRef, useState } from 'react';
import { ActionDialog, Button, Icon, Notice, TextAreaField, TextField, useNow, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { MAX_PROOF_BYTES, proofFileName, proofFileUrl } from '@/lib/storage';
import type { DeliverableRow, ProofRow } from '@/lib/types';
import { useFinalizeRelease, useSubmitProof, useUndoApproval } from './api';

/** A link to show: "twitch.tv/videos/2299110" for "https://www.twitch.tv/videos/2299110". */
export function shortLink(url: string): string {
  try {
    const u = new URL(url);
    return (u.host.replace(/^www\./, '') + u.pathname + u.search).replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** What the creator sent as proof: the link, the file (opened through a link that expires), the note. */
export function ProofEvidence({ proof }: { proof: ProofRow }) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const openFile = async () => {
    if (!proof.file_path) return;
    // open the tab first, while the click still counts as the person's, then point it at the file
    const tab = window.open('', '_blank');
    setOpening(true);
    try {
      const url = await proofFileUrl(proof.file_path);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      toast.error(errorMessage(e));
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="g-evidence">
      {proof.link_url ? (
        <a href={proof.link_url} target="_blank" rel="noopener noreferrer nofollow" className="g-evidence__item">
          <Icon name="link" /> open the link: {shortLink(proof.link_url)}
        </a>
      ) : null}
      {proof.file_path ? (
        <button type="button" className="g-evidence__item" onClick={() => void openFile()} disabled={opening}>
          <Icon name="file" /> open the file: {proofFileName(proof.file_path)}
        </button>
      ) : null}
      {proof.note ? <p className="g-muted g-small g-pre">“{proof.note}”</p> : null}
    </div>
  );
}

/** The creator sends proof for one deliverable: a link, a file, or both. */
export function ProofDialog({ dealId, deliverable, brandName, onClose }: { dealId: string; deliverable: DeliverableRow; brandName: string; onClose: () => void }) {
  const submit = useSubmitProof();
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const send = () => {
    if (!link.trim() && !file) return setProblem('Add a link or a file as proof');
    if (link.trim() && !/^https?:\/\/\S+$/i.test(link.trim())) return setProblem('Links start with http:// or https://');
    if (file && file.size > MAX_PROOF_BYTES) return setProblem('Files can be up to 50 MB. Share a link for anything bigger.');
    setProblem(null);
    submit.mutate({ dealId, deliverableId: deliverable.id, link, file, note }, { onSuccess: onClose });
  };

  return (
    <ActionDialog
      onClose={onClose}
      pending={submit.isPending}
      title={`Proof for ${deliverable.label}`}
      description={`${brandName} reviews it; approving releases this part of the money to you.`}
      action="send proof"
      onAction={send}
    >
      {problem || submit.error ? <Notice tone="coral">{problem ?? errorMessage(submit.error)}</Notice> : null}
      <TextField label="Link" type="url" inputMode="url" placeholder="https://twitch.tv/videos/…" value={link} onChange={(e) => setLink(e.target.value)} hint="The stream, video or post." />
      <div className="g-field">
        <label className="g-field__label" htmlFor="proof-file">File (optional)</label>
        <input id="proof-file" className="g-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <span className="g-field__hint">A screenshot, a clip or a report, up to 50 MB. Only you and the brand can open it.</span>
      </div>
      <TextAreaField label="Note (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="When it went live, where to look" />
    </ActionDialog>
  );
}

/**
 * An approved proof's undo window: a countdown, and Undo for the brand. When it ends this page asks the database to
 * release (either side may; the scheduler does it too if nobody's looking, and asking twice is harmless).
 */
export function ReleaseTimer({ dealId, proof, canUndo }: { dealId: string; proof: ProofRow; canUndo: boolean }) {
  const now = useNow(250);
  const undo = useUndoApproval();
  const finalize = useFinalizeRelease();
  const asked = useRef(false);
  const at = proof.release_at ? new Date(proof.release_at).getTime() : 0;
  const left = Math.max(0, Math.ceil((at - now.getTime()) / 1000));
  const finalizeRelease = finalize.mutate;

  useEffect(() => {
    if (!at || asked.current) return;
    const t = window.setTimeout(() => {
      asked.current = true;
      finalizeRelease({ dealId, proofId: proof.id });
    }, Math.max(0, at - Date.now()) + 300);
    return () => window.clearTimeout(t);
  }, [at, dealId, proof.id, finalizeRelease]);

  return (
    <div className="g-release" role="status">
      <span className="g-spinner" aria-hidden="true" />
      <span>{left > 0 ? `Releasing in ${left}s` : 'Releasing…'}</span>
      {canUndo && left > 0 ? (
        <Button size="sm" variant="ghost" loading={undo.isPending} onClick={() => undo.mutate({ dealId, proofId: proof.id })}>undo</Button>
      ) : null}
    </div>
  );
}
