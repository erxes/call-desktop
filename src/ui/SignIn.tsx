import { IconPhone } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { Session } from '../bridge.ts';
import { signIn as signInWithErxes } from './desktop.ts';

/** Asks where erxes is, then signs in there in the member's browser. */
export const SignIn = ({ onSignedIn }: { onSignedIn: (session: Session) => void }) => {
  const [address, setAddress] = useState('');

  const signIn = useMutation({
    mutationFn: async () => signInWithErxes(address),
    onSuccess: (result) => {
      if (result.ok) onSignedIn(result.session);
    },
  });

  const problem = signIn.data?.ok === false ? signIn.data.problem : '';

  return (
    <main className="sign-in">
      <div className="brand">
        <span className="mark">
          <IconPhone size={28} aria-hidden />
        </span>
        <h1>erxes Call</h1>
        <p>Enter the address you open erxes at in your browser.</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          signIn.mutate();
        }}
      >
        <label htmlFor="address">Address</label>
        <input
          id="address"
          value={address}
          placeholder="https://example.erxes.io"
          required
          onChange={(event) => setAddress(event.target.value)}
        />
        <p role="alert">{problem}</p>
        <button type="submit" className="primary">
          Sign in with erxes
        </button>
        {signIn.isPending && (
          <p role="status">Finish signing in in your browser, or press the button to start over.</p>
        )}
      </form>
    </main>
  );
};
