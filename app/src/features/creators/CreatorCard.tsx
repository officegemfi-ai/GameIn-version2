import { Link } from 'react-router';
import { HexAvatar } from '@/components/ui';
import { formatCents } from '@/lib/money';
import type { Json } from '@/lib/types';
import { fromPrice, platformsOf, type CreatorCardRow } from './api';

export function PlatformChips({ platforms }: { platforms: Json | null | undefined }) {
  const list = platformsOf(platforms);
  if (list.length === 0) return null;
  return (
    <ul className="g-row-wrap" aria-label="Platforms">
      {list.map((p) => (
        <li key={p.platform} className="g-chip">
          <span className="g-label">{p.platform}</span>
          {p.followers ? <span className="g-strong">{p.followers}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function CreatorCard({ creator }: { creator: CreatorCardRow }) {
  const price = fromPrice(creator.packages);
  const count = creator.packages.filter((p) => p.active).length;
  return (
    <Link to={`/c/${creator.handle}`} className="g-card g-creatorcard">
      <div className="g-row">
        <HexAvatar name={creator.display_name} size={48} />
        <div className="g-item__main">
          <span className="g-item__title">{creator.display_name}</span>
          <span className="g-item__sub">@{creator.handle}</span>
        </div>
      </div>
      {creator.bio ? <p className="g-creatorcard__bio g-muted g-small">{creator.bio}</p> : null}
      <PlatformChips platforms={creator.platforms} />
      <div className="g-between g-small">
        <span className="g-muted">{count ? `${count} package${count === 1 ? '' : 's'}` : 'No packages yet'}</span>
        {price != null ? <span className="g-strong">from {formatCents(price)}</span> : null}
      </div>
    </Link>
  );
}
