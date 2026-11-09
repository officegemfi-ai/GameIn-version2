import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Card, HexAvatar, Icon, Loading, Notice, SelectField } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { centsToInput, parseDollars } from '@/lib/money';
import { itemsFromJson } from '@/lib/items';
import { OFFER_HOURS, PITCH_HOURS } from '@/lib/rules';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useSeat } from '@/features/seats/SeatProvider';
import { useCreator, useCreators } from '@/features/creators/api';
import { useBrandSearch } from '@/features/brands/api';
import { useMyPackages } from '@/features/packages/api';
import { TermsForm, termsProblem, type Terms } from './TermsForm';
import { usePitchOffer, useSendOffer } from './api';

interface Party {
  id: string;
  name: string;
  sub: string;
}

/** A search box with results, to choose who the offer is for. */
function PartyPicker({ kind, onPick }: { kind: 'creator' | 'brand'; onPick: (p: Party) => void }) {
  const [text, setText] = useState('');
  const search = useDebouncedValue(text);
  const creators = useCreators(search, { enabled: kind === 'creator' });
  const brands = useBrandSearch(search, { enabled: kind === 'brand' });
  const results: Party[] =
    kind === 'creator'
      ? (creators.data?.pages[0] ?? []).slice(0, 8).map((c) => ({ id: c.id, name: c.display_name, sub: '@' + c.handle }))
      : (brands.data ?? []).slice(0, 8).map((b) => ({ id: b.id, name: b.name, sub: b.slug }));
  return (
    <div className="g-stack-sm">
      <label className="g-search">
        <Icon name="discover" />
        <span className="g-visually-hidden">{kind === 'creator' ? 'Find a creator' : 'Find a brand'}</span>
        <input className="g-input" type="search" autoFocus placeholder={kind === 'creator' ? 'Find a creator by name or handle' : 'Find a brand by name'} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="g-list" role="listbox" aria-label={kind === 'creator' ? 'Creators' : 'Brands'}>
        {results.map((p) => (
          <button key={p.id} type="button" role="option" aria-selected={false} className="g-item" onClick={() => onPick(p)}>
            <HexAvatar name={p.name} size={34} brand={kind === 'brand'} />
            <span className="g-item__main">
              <span className="g-item__title">{p.name}</span>
              <span className="g-item__sub">{p.sub}</span>
            </span>
          </button>
        ))}
        {results.length === 0 && text ? <p className="g-muted g-small">No {kind}s match.</p> : null}
      </div>
    </div>
  );
}

/** A brand's custom offer to a creator (?creator=handle), or a creator's pitch to a brand. */
export default function NewOfferPage() {
  const seat = useSeat();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const handle = params.get('creator');
  const linked = useCreator(handle ?? '');
  const [party, setParty] = useState<Party | null>(null);
  const [terms, setTerms] = useState<Terms>({ title: '', amount: '', items: [{ label: '' }], note: '' });
  const [packageId, setPackageId] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const send = useSendOffer();
  const pitch = usePitchOffer();
  const myPackages = useMyPackages(seat.side === 'creator' ? seat.id : null);
  const isBrand = seat.side === 'brand';

  // a creator's page links here with ?creator=handle
  useEffect(() => {
    if (handle && linked.data && !party) setParty({ id: linked.data.id, name: linked.data.display_name, sub: '@' + linked.data.handle });
  }, [handle, linked.data, party]);

  // a pitch can start from one of the creator's packages
  const pickPackage = (id: string) => {
    setPackageId(id);
    const p = myPackages.data?.find((x) => x.id === id);
    if (p) setTerms({ title: p.title, amount: centsToInput(p.price_cents), items: itemsFromJson(p.items), note: terms.note });
  };

  const submit = () => {
    const p = termsProblem(terms, true);
    if (p) return setProblem(p);
    if (!party) return setProblem(isBrand ? 'Choose a creator' : 'Choose a brand');
    setProblem(null);
    const amountCents = parseDollars(terms.amount)!;
    const done = { onSuccess: (offerId: string) => navigate(`/offers/${offerId}`, { replace: true }) };
    if (isBrand) send.mutate({ brandId: seat.id, creatorId: party.id, title: terms.title, amountCents, items: terms.items, note: terms.note }, done);
    else pitch.mutate({ creatorId: seat.id, brandId: party.id, packageId: packageId || undefined, title: terms.title, amountCents, items: terms.items, note: terms.note }, done);
  };

  if (handle && linked.isPending) return <Loading />;

  return (
    <div className="g-page g-page--narrow">
      <PageHeader
        back={{ to: handle ? `/c/${handle}` : '/offers', label: handle ? 'creator' : 'offers' }}
        title={isBrand ? 'New offer' : 'Pitch a brand'}
        subtitle={
          isBrand
            ? `Set your own terms. The creator has ${OFFER_HOURS} hours to accept, counter or decline.`
            : `Offer a brand your terms. They have ${PITCH_HOURS} hours to answer.`
        }
      />
      <Card title={isBrand ? 'Creator' : 'Brand'}>
        {party ? (
          <div className="g-between">
            <div className="g-row">
              <HexAvatar name={party.name} size={40} brand={!isBrand} />
              <div className="g-item__main">
                <span className="g-item__title">{party.name}</span>
                <span className="g-item__sub">{party.sub}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setParty(null)}>change</Button>
          </div>
        ) : (
          <PartyPicker kind={isBrand ? 'creator' : 'brand'} onPick={setParty} />
        )}
      </Card>
      <Card title="Terms">
        <div className="g-stack">
          {!isBrand && (myPackages.data?.length ?? 0) > 0 ? (
            <SelectField label="Start from a package (optional)" value={packageId} onChange={(e) => pickPackage(e.target.value)}>
              <option value="">custom terms</option>
              {myPackages.data!.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </SelectField>
          ) : null}
          <TermsForm value={terms} onChange={setTerms} />
        </div>
      </Card>
      {problem ? <Notice tone="coral">{problem}</Notice> : null}
      <div className="g-row-wrap">
        <Button variant="primary" size="lg" loading={send.isPending || pitch.isPending} onClick={submit}>
          {isBrand ? 'send offer' : 'send pitch'}
        </Button>
        <span className="g-small g-muted">{isBrand ? 'Nothing is charged now. You fund escrow once the creator accepts.' : 'Nothing is binding until both sides accept.'}</span>
      </div>
    </div>
  );
}
