import { ButtonLink, Icon, Skeleton, type IconName } from '@/components/ui';
import { CreatorCard } from '@/features/creators/CreatorCard';
import { useFeaturedCreators } from '@/features/creators/api';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'offers', title: 'Offer', text: 'A brand books one of your packages or sends its own terms. Counter up to eight times until it’s right.' },
  { icon: 'shield', title: 'Escrow', text: 'The brand funds the deal before you start. The money waits with GameIn, not with either side.' },
  { icon: 'upload', title: 'Proof', text: 'Deliver each piece and send proof: a link to the stream or post, or the file itself.' },
  { icon: 'coin', title: 'Payout', text: 'The brand approves and that part of the money is released to your wallet. Pay out whenever you like.' },
];

export default function LandingPage() {
  const featured = useFeaturedCreators();
  return (
    <div className="g-landing">
      <section className="g-hero">
        <div className="g-hero__inner">
          <span className="g-label g-mint">Sponsorships for gaming creators</span>
          <h1 className="g-hero__title">Brands book creators. Escrow keeps it fair.</h1>
          <p className="g-hero__lead">
            Offers, counters and deals in one place. The brand’s money waits in escrow and is released the moment they approve your work.
          </p>
          <div className="g-row-wrap">
            <ButtonLink to="/sign-up?role=creator" variant="primary" size="lg">join as a creator</ButtonLink>
            <ButtonLink to="/sign-up?role=brand" size="lg">join as a brand</ButtonLink>
          </div>
        </div>
      </section>

      <section className="g-public__wide g-stack-lg" aria-labelledby="how">
        <div className="g-stack-sm">
          <span className="g-label">How it works</span>
          <h2 id="how">Four steps, both sides in view</h2>
        </div>
        <ol className="g-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="g-card g-step">
              <div className="g-row">
                <span className="g-step__n">{i + 1}</span>
                <Icon name={s.icon} />
              </div>
              <h3>{s.title}</h3>
              <p className="g-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="g-card g-card--mint g-fees">
          <div className="g-stack-sm">
            <span className="g-label">Fees</span>
            <h3>5% from each side, nothing else</h3>
          </div>
          <p className="g-text-2">
            Brands pay 5% on top of what they fund; creators get the release less 5%. Weekly payouts are free; an instant payout costs 1.5%.
          </p>
        </div>

        <div className="g-stack">
          <div className="g-between">
            <h2>Creators on GameIn</h2>
          </div>
          {featured.isPending ? (
            <div className="g-grid-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={190} />)}</div>
          ) : featured.data && featured.data.length > 0 ? (
            <div className="g-grid-3">
              {featured.data.map((c) => (
                <CreatorCard key={c.id} creator={c} />
              ))}
            </div>
          ) : (
            <p className="g-muted">The first creators are joining now.</p>
          )}
        </div>
      </section>
    </div>
  );
}
