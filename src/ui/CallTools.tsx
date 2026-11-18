import {
  IconExternalLink,
  IconNote,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { API, call } from './desktop.ts';

const Extensions = z.array(z.object({ extension: z.string(), name: z.string() }));

const Current = z
  .object({ conversationId: z.string(), customerId: z.string(), customerPhone: z.string() })
  .nullable();

const Caller = z.object({ name: z.string().nullable() });

const Agents = z.array(
  z.object({ accountId: z.string(), status: z.enum(['unavailable', 'available', 'paused']) }),
);

const Anything = z.unknown();

/** How often the phone asks for a call the PBX has not reported yet. */
const ASK_AGAIN_MS = 3000;

/**
 * The call as erxes knows it, once the PBX has reported it: its inbox conversation and its
 * customer, with their name when core has one. Kept under `callCount`, so it outlasts the
 * call for the note and a new call starts empty.
 */
export const useCurrentCall = (accountId: string, callCount: number, onCall: boolean) => {
  const current = useQuery({
    queryKey: [...API, 'calls.phone.current', accountId, callCount],
    queryFn: async () => call('calls.phone.current', { accountId }, Current),
    enabled: onCall,
    refetchInterval: (query) => (query.state.data ? false : ASK_AGAIN_MS),
  });

  const customerId = current.data?.customerId;

  const caller = useQuery({
    queryKey: [...API, 'calls.phone.caller', customerId],
    queryFn: async () => call('calls.phone.caller', { customerId }, Caller),
    enabled: customerId !== undefined,
    retry: false,
  });

  return { conversationId: current.data?.conversationId, name: caller.data?.name ?? null };
};

/** Hands the call on to another of the PBX's extensions. */
export const Transfer = ({ accountId }: { accountId: string }) => {
  const [extension, setExtension] = useState('');

  const extensions = useQuery({
    queryKey: [...API, 'calls.phone.extensions', accountId],
    queryFn: async () => call('calls.phone.extensions', { accountId }, Extensions),
  });

  const transfer = useMutation({
    mutationFn: async () => call('calls.phone.transfer', { accountId, extension }, Anything),
  });

  return (
    <form
      className="card transfer"
      onSubmit={(event) => {
        event.preventDefault();
        transfer.mutate();
      }}
    >
      <div className="row">
        <select
          aria-label="Transfer to"
          value={extension}
          onChange={(event) => setExtension(event.target.value)}
        >
          <option value="">Pick an extension…</option>
          {extensions.data?.map((row) => (
            <option key={row.extension} value={row.extension}>
              {row.extension} {row.name}
            </option>
          ))}
        </select>
        <button type="submit" className="primary" disabled={!extension || transfer.isPending}>
          Transfer
        </button>
      </div>
      <p role="alert">{transfer.error?.message ?? extensions.error?.message}</p>
    </form>
  );
};

type NoteProps = { conversationId: string; onClose: () => void };

/**
 * An internal note on the call's conversation, while the call lasts and after it, until the
 * member closes it.
 */
export const CallNote = ({ conversationId, onClose }: NoteProps) => {
  const [content, setContent] = useState('');

  const save = useMutation({
    mutationFn: async () =>
      call(
        'conversations.messages.create',
        { conversationId, content: content.trim(), internal: true },
        Anything,
      ),
    onSuccess: () => setContent(''),
  });

  return (
    <form
      className="card note"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2>
        <IconNote size={16} aria-hidden />
        Call note
      </h2>
      <textarea
        aria-label="Call note"
        rows={3}
        value={content}
        placeholder="What the caller needs"
        onChange={(event) => setContent(event.target.value)}
      />
      <p role="alert">{save.error?.message}</p>
      {save.isSuccess && content === '' && <p role="status">Note saved on the call</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={!content.trim() || save.isPending}>
          Save note
        </button>
        <button
          type="button"
          className="ghost"
          title="Open conversation"
          aria-label="Open conversation"
          onClick={() =>
            window.desktop.openErxes(`/frontline/inbox/conversations/${conversationId}`)
          }
        >
          <IconExternalLink size={18} aria-hidden />
        </button>
        <button type="button" className="ghost" title="Close" aria-label="Close" onClick={onClose}>
          <IconX size={18} aria-hidden />
        </button>
      </div>
    </form>
  );
};

/**
 * The member's own state in the PBX's queues: Pause stops queue calls reaching their
 * extension, Resume lets them in again. Nothing for a member who answers no queue.
 */
export const AgentStatus = ({ accountId }: { accountId: string }) => {
  const queries = useQueryClient();
  const queryKey = [...API, 'calls.agents.mine'];

  const agents = useQuery({
    queryKey,
    queryFn: async () => call('calls.agents.mine', {}, Agents),
  });

  const agent = agents.data?.find((each) => each.accountId === accountId);
  const paused = agent?.status === 'paused';

  const setStatus = useMutation({
    mutationFn: async () =>
      call(
        'calls.agents.setStatus',
        { accountId, status: paused ? 'available' : 'paused' },
        Anything,
      ),
    onSuccess: async () => queries.invalidateQueries({ queryKey }),
  });

  if (!agent) return null;

  return (
    <div className="agent">
      <span>{paused ? 'Queue calls paused' : 'Taking queue calls'}</span>
      <button
        type="button"
        aria-pressed={paused}
        aria-label={paused ? 'Resume queue calls' : 'Pause queue calls'}
        disabled={setStatus.isPending}
        onClick={() => setStatus.mutate()}
      >
        {paused ? (
          <IconPlayerPlay size={16} aria-hidden />
        ) : (
          <IconPlayerPause size={16} aria-hidden />
        )}
        {paused ? 'Resume' : 'Pause'}
      </button>
      <p role="alert">{setStatus.error?.message}</p>
    </div>
  );
};
