// Pagination that fills the space available instead of scrolling the page.
// Items are measured once, split into pages that fit, and re-measured on resize.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { sfx } from '../audio/sfx';

function useSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onPrev)();
    },
  };
}

function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="tab" disabled={page === 0} onClick={() => { sfx('click'); setPage(page - 1); }}>◀</button>
      <span className="pixel">{page + 1}/{pages}</span>
      <button className="tab" disabled={page >= pages - 1} onClick={() => { sfx('click'); setPage(page + 1); }}>▶</button>
    </div>
  );
}

/** Variable-height items split into pages that fit the container. */
export function Paged({ items, resetKey, gap = 0, className }: { items: ReactNode[]; resetKey?: unknown; gap?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  const [starts, setStarts] = useState<number[] | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setStarts(null);
  }, [items.length, resetKey, size.w, size.h]);
  useEffect(() => setPage(0), [resetKey]);
  useLayoutEffect(() => {
    if (starts !== null || !measureRef.current || !box.current) return;
    const H = box.current.clientHeight - 34; // leave room for the pager
    const kids = Array.from(measureRef.current.children) as HTMLElement[];
    const out = [0];
    let used = 0;
    kids.forEach((k, i) => {
      const h = k.offsetHeight + gap;
      if (used + h > H && i > out[out.length - 1]) {
        out.push(i);
        used = 0;
      }
      used += h;
    });
    // everything fits without the pager row
    const total = kids.reduce((s, k) => s + k.offsetHeight + gap, 0);
    setStarts(total <= H + 34 ? [0] : out);
  });
  const pages = starts?.length ?? 1;
  const p = Math.min(page, pages - 1);
  const swipe = useSwipe(() => setPage(Math.max(0, p - 1)), () => setPage(Math.min(pages - 1, p + 1)));
  const from = starts ? starts[p] : 0;
  const to = starts ? (starts[p + 1] ?? items.length) : items.length;
  return (
    <div className={`paged ${className ?? ''}`} ref={box} {...swipe}>
      {starts === null ? (
        <div ref={measureRef} className="paged-body" style={{ visibility: 'hidden', gap }}>
          {items.map((it, i) => <div key={i}>{it}</div>)}
        </div>
      ) : (
        <div className="paged-body" style={{ gap }}>
          {items.slice(from, to).map((it, i) => <div key={from + i}>{it}</div>)}
        </div>
      )}
      <Pager page={p} pages={pages} setPage={setPage} />
    </div>
  );
}

/** A table that shows as many rows as fit, with a pager instead of scrolling. */
export function PagedTable<T>({ rows, head, row, resetKey, rowKey }: { rows: T[]; head: ReactNode; row: (r: T) => ReactNode; resetKey?: unknown; rowKey: (r: T) => string | number }) {
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLTableElement>(null);
  const size = useSize(box);
  const [perPage, setPerPage] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => setPerPage(0), [size.w, size.h, rows.length]);
  useEffect(() => setPage(0), [resetKey]);
  useLayoutEffect(() => {
    if (perPage || !probe.current || !box.current) return;
    const thead = probe.current.tHead?.offsetHeight ?? 24;
    const body = probe.current.tBodies[0];
    const rh = body && body.rows.length ? Math.max(...Array.from(body.rows).map((r) => r.offsetHeight)) : 26;
    const H = box.current.clientHeight;
    const all = Math.floor((H - thead) / rh);
    setPerPage(Math.max(1, rows.length <= all ? all : Math.floor((H - thead - 34) / rh)));
  });
  const pages = perPage ? Math.max(1, Math.ceil(rows.length / perPage)) : 1;
  const p = Math.min(page, pages - 1);
  const swipe = useSwipe(() => setPage(Math.max(0, p - 1)), () => setPage(Math.min(pages - 1, p + 1)));
  const slice = perPage ? rows.slice(p * perPage, p * perPage + perPage) : rows.slice(0, 3);
  return (
    <div className="paged" ref={box} {...swipe}>
      <div className="paged-body">
        <table className="t" ref={perPage ? undefined : probe} style={perPage ? undefined : { visibility: 'hidden' }}>
          <thead>{head}</thead>
          <tbody>{slice.map((r) => <Row key={rowKey(r)}>{row(r)}</Row>)}</tbody>
        </table>
      </div>
      <Pager page={p} pages={pages} setPage={setPage} />
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Fixed-width cards laid out in a grid; as many rows as fit, then pages. */
export function PagedGrid({ items, minWidth, resetKey, gap = 6 }: { items: ReactNode[]; minWidth: number; resetKey?: unknown; gap?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  const [perPage, setPerPage] = useState(0);
  const [page, setPage] = useState(0);
  const cols = Math.max(1, Math.floor((size.w + gap) / (minWidth + gap)));
  useEffect(() => setPerPage(0), [size.w, size.h, items.length, resetKey]);
  useEffect(() => setPage(0), [resetKey]);
  useLayoutEffect(() => {
    if (perPage || !probe.current || !box.current || !size.h) return;
    const kids = Array.from(probe.current.children) as HTMLElement[];
    const ch = Math.max(40, ...kids.map((k) => k.offsetHeight));
    const H = box.current.clientHeight;
    const rowsAll = Math.max(1, Math.floor((H + gap) / (ch + gap)));
    const rows = items.length <= rowsAll * cols ? rowsAll : Math.max(1, Math.floor((H - 34 + gap) / (ch + gap)));
    setPerPage(rows * cols);
  });
  const pages = perPage ? Math.max(1, Math.ceil(items.length / perPage)) : 1;
  const p = Math.min(page, pages - 1);
  const swipe = useSwipe(() => setPage(Math.max(0, p - 1)), () => setPage(Math.min(pages - 1, p + 1)));
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, alignContent: 'start' } as const;
  return (
    <div className="paged" ref={box} {...swipe}>
      {perPage === 0 ? (
        <div ref={probe} className="paged-body" style={{ ...grid, visibility: 'hidden' }}>{items.slice(0, cols * 2)}</div>
      ) : (
        <div className="paged-body" style={grid}>{items.slice(p * perPage, p * perPage + perPage)}</div>
      )}
      <Pager page={p} pages={pages} setPage={setPage} />
    </div>
  );
}
