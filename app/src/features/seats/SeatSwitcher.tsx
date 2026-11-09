import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { HexAvatar, Icon } from '@/components/ui';
import { useSignOut } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSeats } from './SeatProvider';

/** The current seat, and a menu to switch seats, add one, or sign out. */
export function SeatSwitcher() {
  const { seats, seat, setSeat, creatorSeat } = useSeats();
  const { user } = useAuth();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!seat) return null;
  return (
    <div className="g-seat" ref={box}>
      <button type="button" className="g-seat__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`Acting as ${seat.name} (${seat.side}). Switch seat`}>
        <HexAvatar name={seat.name} size={30} brand={seat.side === 'brand'} />
        <span className="g-seat__text">
          <span className="g-seat__name">{seat.name}</span>
          <span className="g-seat__side">{seat.side}</span>
        </span>
        <Icon name="chevronDown" width={16} height={16} />
      </button>
      {open ? (
        <div className="g-menu" role="menu" aria-label="Seats">
          <div className="g-menu__label g-label">Act as</div>
          {seats.map((s) => (
            <button
              key={`${s.side}:${s.id}`}
              type="button"
              role="menuitemradio"
              aria-checked={s.side === seat.side && s.id === seat.id}
              className="g-menu__item"
              onClick={() => {
                setSeat(s);
                setOpen(false);
                navigate('/dashboard');
              }}
            >
              <HexAvatar name={s.name} size={26} brand={s.side === 'brand'} />
              <span className="g-item__main">
                <span className="g-ellipsis">{s.name}</span>
                <span className="g-tiny g-muted">{s.side === 'brand' ? `brand · ${s.role}` : 'creator'}</span>
              </span>
            </button>
          ))}
          <div className="g-menu__sep" />
          <Link role="menuitem" className="g-menu__item" to={creatorSeat ? '/onboarding?role=brand' : '/onboarding'} onClick={() => setOpen(false)}>
            <Icon name="plus" /> {creatorSeat ? 'Add a brand' : 'Add a creator profile or brand'}
          </Link>
          <Link role="menuitem" className="g-menu__item" to="/settings" onClick={() => setOpen(false)}>
            <Icon name="settings" /> Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className="g-menu__item"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            <Icon name="logout" /> Sign out
          </button>
          {user?.email ? <div className="g-menu__label g-tiny g-faint g-ellipsis">{user.email}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
