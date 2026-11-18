import {
  IconClock,
  IconDialpad,
  IconHistory,
  IconInbox,
  IconLogout,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Session } from '../bridge.ts';
import { Avatar } from './Avatar.tsx';
import { API, currentSession } from './desktop.ts';
import { Phone } from './Phone.tsx';
import { Recent } from './Recent.tsx';
import { SignIn } from './SignIn.tsx';

const SESSION = ['session'];

type Tab = 'phone' | 'recent';

/** What erxes web shows and the phone doesn't, opened in the app's second window. */
const WEB_PAGES = [
  { label: 'Inbox', path: '/frontline/inbox', Icon: IconInbox },
  { label: 'History', path: '/frontline/calls/history', Icon: IconHistory },
  { label: 'Queues', path: '/frontline/calls/queues', Icon: IconUsersGroup },
];

const TABS = [
  { tab: 'phone', label: 'Phone', Icon: IconDialpad },
  { tab: 'recent', label: 'Recent', Icon: IconClock },
] as const;

const Signed = ({ session, onSignOut }: { session: Session; onSignOut: () => void }) => {
  const [tab, setTab] = useState<Tab>('phone');
  const [number, setNumber] = useState('');

  return (
    <main>
      <header>
        <Avatar name={session.name} />
        <div className="who">
          <strong>{session.name}</strong>
          <small>{session.organization ?? new URL(session.address).host}</small>
        </div>
        <button
          type="button"
          className="ghost"
          title="Sign out"
          aria-label="Sign out"
          onClick={onSignOut}
        >
          <IconLogout size={18} aria-hidden />
        </button>
      </header>
      <nav aria-label="Sections" className="tabs">
        {TABS.map(({ tab: each, label, Icon }) => (
          <button key={each} type="button" aria-pressed={tab === each} onClick={() => setTab(each)}>
            <Icon size={16} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      <div className="content">
        {/* The phone stays mounted under Recent, so its line stays signed in. */}
        <section hidden={tab !== 'phone'}>
          <Phone number={number} onNumber={setNumber} onSignedOut={onSignOut} />
        </section>
        {tab === 'recent' && (
          <Recent
            onDial={(next) => {
              setNumber(next);
              setTab('phone');
            }}
          />
        )}
      </div>
      <nav aria-label="Open in erxes" className="web">
        {WEB_PAGES.map(({ label, path, Icon }) => (
          <button key={path} type="button" onClick={() => window.desktop.openErxes(path)}>
            <Icon size={18} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
};

export const App = () => {
  const queries = useQueryClient();
  const session = useQuery({ queryKey: SESSION, queryFn: currentSession });

  if (session.isPending) return null;

  if (!session.data) return <SignIn onSignedIn={(next) => queries.setQueryData(SESSION, next)} />;

  const signOut = async () => {
    await window.desktop.signOut();
    queries.setQueryData(SESSION, null);
    // The next member starts with none of this one's answers.
    queries.removeQueries({ queryKey: API });
  };

  return <Signed session={session.data} onSignOut={() => void signOut()} />;
};
