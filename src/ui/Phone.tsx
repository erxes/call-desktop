import {
  IconArrowForwardUp,
  IconBackspace,
  IconDialpad,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhone,
  IconPhoneOff,
  IconPlayerPause,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Avatar } from './Avatar.tsx';
import { AgentStatus, CallNote, Transfer, useCurrentCall } from './CallTools.tsx';
import { API, ApiProblem, call as callApi } from './desktop.ts';
import { DialPad } from './DialPad.tsx';
import { useRinging } from './useRinging.ts';
import { Line, useSip } from './useSip.ts';
import type { Phone as SipPhone, PhoneCall, PhoneStatus } from './useSip.ts';

const STATUS: Record<PhoneStatus, string> = {
  connecting: 'Connecting…',
  ready: 'Ready',
  offline: 'Offline',
};

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** How long the call has lasted, ticking each second. */
const Timer = ({ since }: { since: Date }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(tick);
  }, []);

  return <time>{clock(Math.max(0, Math.floor((now - since.getTime()) / 1000)))}</time>;
};

const callState = (call: PhoneCall) => {
  if (call.talking && call.since) return <Timer since={call.since} />;

  return call.direction === 'incoming' ? 'Incoming call' : 'Calling…';
};

type RoundProps = { label: string; kind: 'go' | 'stop'; onClick?: () => void; disabled?: boolean };

/**
 * A round call button with its name under it: answer, decline and hang up, or, without
 * `onClick`, the submit button of the dialer's form.
 */
const Round = ({ label, kind, onClick, disabled }: RoundProps) => (
  <div className="round">
    <button
      type={onClick ? 'button' : 'submit'}
      className={kind}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {kind === 'go' ? <IconPhone size={28} aria-hidden /> : <IconPhoneOff size={28} aria-hidden />}
    </button>
    <span aria-hidden>{label}</span>
  </div>
);

/** The call on the line: answer or decline while it rings, then mute, hold, keys and hang up. */
type OnCallProps = { call: PhoneCall; phone: SipPhone; accountId: string; name: string | null };

type Tool = 'keys' | 'transfer' | null;

const OnCall = ({ call, phone, accountId, name }: OnCallProps) => {
  const [tool, setTool] = useState<Tool>(null);
  const ringing = call.direction === 'incoming' && !call.talking;

  const toggle = (next: Tool) => setTool(tool === next ? null : next);

  return (
    <div className={ringing ? 'call ringing' : 'call'}>
      <Avatar name={name} />
      <strong>{name ?? call.number}</strong>
      {name && <small>{call.number}</small>}
      <p role="status">{callState(call)}</p>
      {call.talking && (
        <div className="controls">
          <button type="button" aria-pressed={call.muted} onClick={phone.toggleMute}>
            {call.muted ? <IconMicrophoneOff aria-hidden /> : <IconMicrophone aria-hidden />}
            Mute
          </button>
          <button type="button" aria-pressed={call.held} onClick={phone.toggleHold}>
            {call.held ? <IconPlayerPlay aria-hidden /> : <IconPlayerPause aria-hidden />}
            Hold
          </button>
          <button type="button" aria-pressed={tool === 'keys'} onClick={() => toggle('keys')}>
            <IconDialpad aria-hidden />
            Keypad
          </button>
          <button
            type="button"
            aria-pressed={tool === 'transfer'}
            onClick={() => toggle('transfer')}
          >
            <IconArrowForwardUp aria-hidden />
            Transfer
          </button>
        </div>
      )}
      {call.talking && tool === 'keys' && <DialPad onKey={phone.press} />}
      {call.talking && tool === 'transfer' && <Transfer accountId={accountId} />}
      <div className="answer">
        {ringing && <Round label="Answer" kind="go" onClick={phone.answer} />}
        <Round label={ringing ? 'Decline' : 'Hang up'} kind="stop" onClick={phone.hangUp} />
      </div>
    </div>
  );
};

type DialProps = { number: string; onNumber: (number: string) => void };

type DialerProps = DialProps & { ready: boolean; problem: string; onDial: () => void };

/** The number to call, its keys and the call button. */
const Dialer = ({ number, onNumber, ready, problem, onDial }: DialerProps) => (
  <form
    className="dial"
    onSubmit={(event) => {
      event.preventDefault();
      onDial();
    }}
  >
    <div className="number">
      <input
        aria-label="Number"
        inputMode="tel"
        value={number}
        placeholder="Enter a number"
        onChange={(event) => onNumber(event.target.value)}
      />
      {number !== '' && (
        <button
          type="button"
          className="ghost"
          aria-label="Delete"
          onClick={() => onNumber(number.slice(0, -1))}
        >
          <IconBackspace size={20} aria-hidden />
        </button>
      )}
    </div>
    <p role="alert">{problem}</p>
    <DialPad onKey={(key) => onNumber(number + key)} />
    <Round label="Call" kind="go" disabled={!ready || number.trim() === ''} />
  </form>
);

/** One line's phone: its status, then the dial pad or the call it is on. */
const LinePhone = ({ line, number, onNumber }: DialProps & { line: Line }) => {
  const audio = useRef<HTMLAudioElement>(null);
  const phone = useSip(line, audio);
  const { call, callCount } = phone;
  const [noteClosedAt, setNoteClosedAt] = useState(0);
  const current = useCurrentCall(line.accountId, callCount, Boolean(call));

  useRinging(call?.direction === 'incoming' && !call.talking ? call.number : undefined);

  return (
    <>
      <div className="line">
        <span>
          {line.name} · {line.extension}
        </span>
        <span role="status" className={`status ${phone.status}`}>
          {STATUS[phone.status]}
        </span>
      </div>
      {call ? (
        <OnCall call={call} phone={phone} accountId={line.accountId} name={current.name} />
      ) : (
        <Dialer
          number={number}
          onNumber={onNumber}
          ready={phone.status === 'ready'}
          problem={phone.problem}
          onDial={() => phone.dial(number)}
        />
      )}
      {current.conversationId && noteClosedAt !== callCount && (
        <CallNote
          conversationId={current.conversationId}
          onClose={() => setNoteClosedAt(callCount)}
        />
      )}
      {!call && <AgentStatus accountId={line.accountId} />}
      <audio ref={audio} hidden>
        <track kind="captions" />
      </audio>
    </>
  );
};

type Props = DialProps & { onSignedOut: () => void };

/** The member's phone, on the first of their lines unless they pick another. */
export const Phone = ({ number, onNumber, onSignedOut }: Props) => {
  const [picked, setPicked] = useState<string>();

  // A refetch would sign the phone in again, so the lines last as long as the window.
  const lines = useQuery({
    queryKey: [...API, 'calls.phone.lines'],
    queryFn: async () => callApi('calls.phone.lines', {}, z.array(Line)),
    retry: false,
    staleTime: Infinity,
  });

  const signedOut = lines.error instanceof ApiProblem && lines.error.status === 401;

  useEffect(() => {
    if (signedOut) onSignedOut();
  }, [signedOut, onSignedOut]);

  if (lines.isPending) return <p role="status">Loading your line…</p>;

  if (lines.isError) return <p role="alert">{lines.error.message}</p>;

  const line = lines.data.find((each) => each.accountId === picked) ?? lines.data.at(0);

  if (!line)
    return (
      <p role="status">
        You have no phone line yet. An admin gives your extension a SIP password in erxes, under
        Settings › Integrations.
      </p>
    );

  return (
    <>
      {lines.data.length > 1 && (
        <select
          aria-label="Line"
          value={line.accountId}
          onChange={(event) => setPicked(event.target.value)}
        >
          {lines.data.map((each) => (
            <option key={each.accountId} value={each.accountId}>
              {each.name} · {each.extension}
            </option>
          ))}
        </select>
      )}
      <LinePhone key={line.accountId} line={line} number={number} onNumber={onNumber} />
    </>
  );
};
