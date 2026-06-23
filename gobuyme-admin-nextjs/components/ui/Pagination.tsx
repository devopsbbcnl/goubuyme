import { useTheme } from '@/context/ThemeContext';

const SIZES = [10, 20, 50, 100] as const;

interface PaginationProps {
  total: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}

export function Pagination({ total, page, perPage, onPageChange, onPerPageChange }: PaginationProps) {
  const { theme: T } = useTheme();
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else if (page <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('…');
    pages.push(totalPages);
  } else if (page >= totalPages - 3) {
    pages.push(1);
    pages.push('…');
    for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('…');
    pages.push(page - 1, page, page + 1);
    pages.push('…');
    pages.push(totalPages);
  }

  if (total === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderTop: `1px solid ${T.border}`,
      flexWrap: 'wrap', gap: 10,
    }}>
      <span style={{ fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>
        Showing {from}–{to} of {total}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Per-page selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>Per page</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {SIZES.map(size => (
              <button
                key={size}
                onClick={() => { onPerPageChange(size); onPageChange(1); }}
                style={{
                  minWidth: 36, height: 28, borderRadius: 4, fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', padding: '0 8px',
                  border: perPage === size ? `1px solid ${T.primary}` : `1px solid ${T.border}`,
                  background: perPage === size ? T.primary : T.surface2,
                  color: perPage === size ? '#fff' : T.textSec,
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              style={{
                minWidth: 28, height: 28, borderRadius: 4, fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', border: `1px solid ${T.border}`,
                background: T.surface2, color: T.textSec, padding: '0 8px',
                opacity: page === 1 ? 0.35 : 1, cursor: page === 1 ? 'default' : 'pointer',
              }}
            >
              ‹
            </button>

            {pages.map((p, i) =>
              p === '…' ? (
                <span key={`el-${i}`} style={{
                  minWidth: 28, height: 28, borderRadius: 4, fontSize: 12,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: T.textMuted,
                }}>…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPageChange(p as number)}
                  style={{
                    minWidth: 28, height: 28, borderRadius: 4, fontSize: 12, fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', padding: '0 8px',
                    border: page === p ? `1px solid ${T.primary}` : `1px solid ${T.border}`,
                    background: page === p ? T.primary : T.surface2,
                    color: page === p ? '#fff' : T.textSec,
                  }}
                >
                  {p}
                </button>
              )
            )}

            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              style={{
                minWidth: 28, height: 28, borderRadius: 4, fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', border: `1px solid ${T.border}`,
                background: T.surface2, color: T.textSec, padding: '0 8px',
                opacity: page === totalPages ? 0.35 : 1, cursor: page === totalPages ? 'default' : 'pointer',
              }}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
