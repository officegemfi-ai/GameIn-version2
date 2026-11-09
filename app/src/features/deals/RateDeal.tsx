import { useState } from 'react';
import { Button, Card, TextAreaField } from '@/components/ui';
import type { Side } from '@/lib/types';
import { useRateDeal, type DealDetail } from './api';

function Stars({ value, onChange, label }: { value: number; onChange?: (n: number) => void; label: string }) {
  return (
    <div className="g-stars" role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? label : `${label}: ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} out of 5`} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>
            ★
          </button>
        ) : (
          <span key={n} className={n <= value ? 'on' : ''} aria-hidden="true">★</span>
        ),
      )}
    </div>
  );
}

/** After a deal completes, each side rates it once, 1 to 5. */
export function RateDeal({ deal, side }: { deal: DealDetail; side: Side }) {
  const rate = useRateDeal();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const mine = deal.ratings.find((r) => r.by_side === side);
  const theirs = deal.ratings.find((r) => r.by_side !== side);
  const otherName = side === 'brand' ? deal.creator?.display_name ?? 'The creator' : deal.brand?.name ?? 'The brand';
  return (
    <Card title="Ratings">
      <div className="g-stack">
        {mine ? (
          <div className="g-stack-sm">
            <span className="g-label">Your rating</span>
            <Stars value={mine.score} label="Your rating" />
            {mine.comment ? <p className="g-muted g-pre">“{mine.comment}”</p> : null}
          </div>
        ) : (
          <div className="g-stack-sm">
            <span className="g-label">How did it go with {otherName}?</span>
            <Stars value={score} onChange={setScore} label={`Rate ${otherName}`} />
            <TextAreaField label="A few words (optional)" value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
            <div>
              <Button variant="primary" disabled={!score} loading={rate.isPending} onClick={() => rate.mutate({ dealId: deal.id, as: side, score, comment })}>
                send rating
              </Button>
            </div>
          </div>
        )}
        {theirs ? (
          <div className="g-stack-sm">
            <span className="g-label">{otherName}’s rating</span>
            <Stars value={theirs.score} label={`${otherName}’s rating`} />
            {theirs.comment ? <p className="g-muted g-pre">“{theirs.comment}”</p> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
