import { UA, WebSocketInterface } from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession.js';
import type { RTCSessionEvent } from 'jssip/lib/UA.js';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { z } from 'zod';

/** A SIP line Frontline hands the member (`calls.phone.lines`). */
export const Line = z.object({
  accountId: z.string(),
  name: z.string(),
  extension: z.string(),
  password: z.string(),
  webSocketUrl: z.string(),
  iceServers: z.array(
    z.object({
      urls: z.string(),
      username: z.string().optional(),
      credential: z.string().optional(),
    }),
  ),
});

export type Line = z.infer<typeof Line>;

/** Signing in to the PBX, signed in and taking calls, or cut off from it. */
export type PhoneStatus = 'connecting' | 'ready' | 'offline';

/** The call the phone is on: ringing until either side answers, then talking. */
export type PhoneCall = {
  session: RTCSession;
  number: string;
  direction: 'incoming' | 'outgoing';
  talking: boolean;
  since: Date | null;
  muted: boolean;
  held: boolean;
};

const AUDIO_ONLY = { audio: true, video: false };

type SetCall = Dispatch<SetStateAction<PhoneCall | null>>;

/** The remote side's audio, as soon as the peer connection carries it. */
const playRemote = (session: RTCSession, audio: RefObject<HTMLAudioElement | null>) => {
  const listen = (connection: RTCPeerConnection) => {
    connection.addEventListener('track', ({ streams }) => {
      const [stream] = streams;

      if (audio.current && stream) {
        audio.current.srcObject = stream;
        void audio.current.play().catch(() => undefined);
      }
    });
  };

  // An outgoing call has its connection already; an incoming one makes it on answer.
  if (session.connection) listen(session.connection);
  else session.on('peerconnection', ({ peerconnection }) => listen(peerconnection));
};

type Follow = {
  setCall: SetCall;
  onNew: () => void;
  setProblem: (problem: string) => void;
  audio: RefObject<HTMLAudioElement | null>;
  busy: RefObject<boolean>;
};

/** Shows `session` as the phone's call until it ends; `busy` holds while it lasts. */
const follow = (session: RTCSession, { setCall, onNew, setProblem, audio, busy }: Follow) => {
  const { direction }: { direction: PhoneCall['direction'] } = session;

  const update = (patch: Partial<PhoneCall>) => {
    setCall((current) => (current?.session === session ? { ...current, ...patch } : current));
  };

  const end = () => {
    busy.current = false;
    setCall((current) => (current?.session === session ? null : current));
  };

  busy.current = true;
  onNew();
  setProblem('');
  setCall({
    session,
    number: session.remote_identity.uri.user,
    direction,
    talking: false,
    since: null,
    muted: false,
    held: false,
  });
  playRemote(session, audio);
  session.on('confirmed', () => update({ talking: true, since: new Date() }));
  session.on('ended', end);
  session.on('failed', (event) => {
    const { cause, originator }: { cause: string; originator: string } = event;

    end();

    // A call the member made says why it went nowhere: busy, unavailable, rejected.
    if (direction === 'outgoing' && originator !== 'local') setProblem(cause);
  });
  session.on('getusermediafailed', () => setProblem('The phone got no microphone'));
};

/**
 * A SIP phone signed in to the line's PBX over WebRTC (JsSIP), for as long as it is mounted. It
 * takes one call at a time: a second incoming call gets busy.
 */
export const useSip = (line: Line, audio: RefObject<HTMLAudioElement | null>) => {
  const [status, setStatus] = useState<PhoneStatus>('connecting');
  const [call, setCall] = useState<PhoneCall | null>(null);
  const [problem, setProblem] = useState('');
  // How many calls the phone has had: what belongs to one call is kept under its number.
  const [callCount, setCallCount] = useState(0);
  const agent = useRef<UA | null>(null);
  const busy = useRef(false);
  const host = new URL(line.webSocketUrl).hostname;
  const pcConfig = { iceServers: line.iceServers };

  useEffect(() => {
    const ua = new UA({
      sockets: [new WebSocketInterface(line.webSocketUrl)],
      uri: `sip:${line.extension}@${new URL(line.webSocketUrl).hostname}`,
      password: line.password,
      session_timers: false,
    });

    const ready = () => setStatus('ready');
    const offline = () => setStatus('offline');
    const connecting = () => setStatus('connecting');

    const onNew = () => setCallCount((count) => count + 1);

    const session = ({ session: next }: RTCSessionEvent) => {
      if (busy.current) next.terminate({ status_code: 486 });
      else follow(next, { setCall, onNew, setProblem, audio, busy });
    };

    ua.on('registered', ready);
    ua.on('registrationFailed', offline);
    ua.on('unregistered', offline);
    ua.on('disconnected', offline);
    ua.on('connecting', connecting);
    ua.on('newRTCSession', session);
    ua.start();
    agent.current = ua;

    return () => {
      ua.off('registered', ready);
      ua.off('registrationFailed', offline);
      ua.off('unregistered', offline);
      ua.off('disconnected', offline);
      ua.off('connecting', connecting);
      ua.off('newRTCSession', session);
      ua.stop();
      agent.current = null;
      busy.current = false;
    };
  }, [line.webSocketUrl, line.extension, line.password, audio]);

  const update = (patch: Partial<PhoneCall>) => {
    setCall((current) => current && { ...current, ...patch });
  };

  return {
    status,
    call,
    callCount,
    problem,
    dial: (number: string) => {
      agent.current?.call(`sip:${number}@${host}`, { mediaConstraints: AUDIO_ONLY, pcConfig });
    },
    answer: () => call?.session.answer({ mediaConstraints: AUDIO_ONLY, pcConfig }),
    hangUp: () => call?.session.terminate(),
    press: (digit: string) => call?.session.sendDTMF(digit),
    toggleMute: () => {
      if (!call) return;

      if (call.muted) call.session.unmute({ audio: true });
      else call.session.mute({ audio: true });

      update({ muted: !call.muted });
    },
    toggleHold: () => {
      if (!call) return;

      if (call.held) call.session.unhold();
      else call.session.hold();

      update({ held: !call.held });
    },
  };
};

export type Phone = ReturnType<typeof useSip>;
