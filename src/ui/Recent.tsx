import { IconClock, IconPhoneIncoming, IconPhoneOutgoing, IconPhoneX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { API, call } from './desktop.ts';

const Calls = z.object({
  calls: z.array(
    z.object({
      id: z.string(),
      direction: z.enum(['incoming', 'outgoing']),
      status: z.string(),
      customerPhone: z.string().nullable(),
      startedAt: z.coerce.date(),
      durationSec: z.number().nullable(),
    }),
  ),
});

const clock = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** Today's calls by their time, older ones by their day. */
const when = (date: Date) =>
  (date.toDateString() === new Date().toDateString() ? clock : day).format(date);

const length = (seconds: number | null) =>
  seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '';

/** Calls nobody took, shown in red. */
const UNTAKEN = new Set(['missed', 'busy', 'failed', 'voicemail']);

const KindIcon = ({ incoming, untaken }: { incoming: boolean; untaken: boolean }) => {
  if (untaken) return <IconPhoneX size={16} aria-hidden />;

  return incoming ? (
    <IconPhoneIncoming size={16} aria-hidden />
  ) : (
    <IconPhoneOutgoing size={16} aria-hidden />
  );
};

/** The member's channels' latest calls; a click puts the number on the dial pad. */
export const Recent = ({ onDial }: { onDial: (number: string) => void }) => {
  const calls = useQuery({
    queryKey: [...API, 'calls.list'],
    queryFn: async () => call('calls.list', { limit: 30 }, Calls),
  });

  if (calls.isPending) return <p role="status">Loading calls…</p>;

  if (calls.isError) return <p role="alert">{calls.error.message}</p>;

  if (calls.data.calls.length === 0)
    return (
      <div className="empty">
        <IconClock size={32} aria-hidden />
        <p role="status">No calls yet</p>
      </div>
    );

  return (
    <ul className="recent" aria-label="Recent calls">
      {calls.data.calls.map((row) => {
        const incoming = row.direction === 'incoming';
        const untaken = UNTAKEN.has(row.status);

        return (
          <li key={row.id}>
            <button
              type="button"
              disabled={!row.customerPhone}
              onClick={() => onDial(row.customerPhone ?? '')}
            >
              <span className={untaken ? 'kind missed' : 'kind'}>
                <KindIcon incoming={incoming} untaken={untaken} />
              </span>
              <span className="what">
                <strong>{row.customerPhone ?? 'Unknown number'}</strong>
                <small>
                  {incoming ? 'Incoming' : 'Outgoing'} · {row.status}
                  {row.durationSec ? ` · ${length(row.durationSec)}` : ''}
                </small>
              </span>
              <time dateTime={row.startedAt.toISOString()}>{when(row.startedAt)}</time>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
