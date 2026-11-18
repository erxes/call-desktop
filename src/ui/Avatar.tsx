import { IconUser } from '@tabler/icons-react';

/** A name's first letters ("Bat Erdene" → "BE"), or a person's outline without a name. */
export const Avatar = ({ name }: { name: string | null }) => {
  const letters = (name ?? '')
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

  return (
    <span className="avatar" aria-hidden>
      {letters || <IconUser size={20} />}
    </span>
  );
};
