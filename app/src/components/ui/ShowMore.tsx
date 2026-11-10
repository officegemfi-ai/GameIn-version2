import type { MoreToShow } from '@/lib/paging';
import { Button } from './Button';

/** Under a list read a page at a time: asks for the next page. Nothing when everything is on show. */
export function ShowMore({ list, label = 'show more' }: { list: MoreToShow; label?: string }) {
  if (!list.hasNextPage) return null;
  return (
    <div className="g-showmore">
      <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
        {label}
      </Button>
    </div>
  );
}
