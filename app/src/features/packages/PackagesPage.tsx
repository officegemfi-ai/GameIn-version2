import { useState } from 'react';
import { Badge, Button, ButtonLink, Card, Dialog, Empty, ErrorState, ItemsEditor, Loading, Notice, TextAreaField, TextField } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/errors';
import { checkTerms, itemsFromJson } from '@/lib/items';
import { centsToInput, formatCents, parseDollars } from '@/lib/money';
import type { Item, PackageRow } from '@/lib/types';
import { useSeat } from '@/features/seats/SeatProvider';
import { useCreatorById } from '@/features/creators/api';
import { useMyPackages, useSavePackage, useSetPackageActive } from './api';

function PackageForm({ creatorId, editing, onClose }: { creatorId: string; editing: PackageRow | null; onClose: () => void }) {
  const save = useSavePackage();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [price, setPrice] = useState(centsToInput(editing?.price_cents));
  const [lengthLabel, setLengthLabel] = useState(editing?.length_label ?? '');
  const [items, setItems] = useState<Item[]>(editing ? itemsFromJson(editing.items) : [{ label: '' }]);
  const [shown, setShown] = useState<string | null>(null);
  const cents = parseDollars(price);
  const problem = !title.trim() ? 'Give the package a title' : title.trim().length > 120 ? 'The title is over 120 characters' : checkTerms(cents, items);

  const submit = () => {
    if (problem) return setShown(problem);
    save.mutate({ id: editing?.id, creatorId, title, code, description, priceCents: cents!, lengthLabel, items }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      busy={save.isPending}
      title={editing ? 'Edit package' : 'New package'}
      description="What a brand gets for a fixed price. They can book it in one step, or send you an offer based on it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>{editing ? 'save' : 'add package'}</Button>
        </>
      }
    >
      {shown || save.error ? <Notice tone="coral">{shown ?? errorMessage(save.error)}</Notice> : null}
      <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Stream logo placement" />
      <div className="g-grid-2">
        <TextField label="Price" prefix="$" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" error={price && cents == null ? 'Enter an amount like 250 or 249.99' : null} />
        <TextField label="Length (optional)" value={lengthLabel} maxLength={40} onChange={(e) => setLengthLabel(e.target.value)} placeholder="e.g. 3 months" />
      </div>
      <TextAreaField label="Description" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="Where it appears, how big, how often" />
      <TextField label="Code (optional)" value={code} maxLength={12} onChange={(e) => setCode(e.target.value)} hint="A short label for your own reference, e.g. SO3." />
      <ItemsEditor items={items} onChange={setItems} />
    </Dialog>
  );
}

export default function PackagesPage() {
  const seat = useSeat();
  const packages = useMyPackages(seat.side === 'creator' ? seat.id : null);
  const creator = useCreatorById(seat.side === 'creator' ? seat.id : null);
  const setActive = useSetPackageActive();
  const [editing, setEditing] = useState<PackageRow | 'new' | null>(null);

  if (seat.side !== 'creator') {
    return (
      <div className="g-page">
        <PageHeader title="Packages" />
        <Empty title="Packages belong to creator profiles">Switch to your creator profile from the top bar to manage packages.</Empty>
      </div>
    );
  }

  return (
    <div className="g-page">
      <PageHeader
        title="Packages"
        subtitle="What brands can book you for, at a set price."
        actions={
          <>
            {creator.data ? <ButtonLink to={`/c/${creator.data.handle}`} variant="ghost" icon="external">your public page</ButtonLink> : null}
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>new package</Button>
          </>
        }
      />
      {packages.isPending ? (
        <Loading />
      ) : packages.isError ? (
        <ErrorState error={errorMessage(packages.error)} retry={() => void packages.refetch()} />
      ) : packages.data.length === 0 ? (
        <Card>
          <Empty title="No packages yet" action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>add your first package</Button>}>
            A package is a ready-made deal: a title, a price and what you deliver. Brands can book it in one step.
          </Empty>
        </Card>
      ) : (
        <div className="g-grid-2">
          {packages.data.map((p) => (
            <article key={p.id} className={`g-package${p.active ? '' : ' g-package--off'}`}>
              <div className="g-between">
                <span className="g-label">{p.code ?? 'package'}</span>
                {p.active ? <Badge tone="mint">listed</Badge> : <Badge>hidden</Badge>}
              </div>
              <h3>{p.title}</h3>
              {p.description ? <p className="g-muted g-small">{p.description}</p> : null}
              <ul className="g-package__items">
                {itemsFromJson(p.items).map((it, i) => (
                  <li key={i}>
                    {it.label}
                    {it.days ? <span className="g-muted"> · {it.days} days</span> : null}
                  </li>
                ))}
              </ul>
              <div className="g-between g-package__foot">
                <span className="g-package__price">{formatCents(p.price_cents)}</span>
                <div className="g-row">
                  <Button size="sm" variant="ghost" onClick={() => setActive.mutate({ id: p.id, creatorId: seat.id, active: !p.active })} disabled={setActive.isPending}>
                    {p.active ? 'hide' : 'list'}
                  </Button>
                  <Button size="sm" onClick={() => setEditing(p)}>edit</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing ? <PackageForm creatorId={seat.id} editing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
