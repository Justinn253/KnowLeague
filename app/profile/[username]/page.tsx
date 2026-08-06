import { permanentRedirect } from 'next/navigation';

function decodeUsername(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return '';
  }
}

export default function PublicProfilePage({ params }: { params: { username: string } }) {
  permanentRedirect(`/users/${encodeURIComponent(decodeUsername(params.username) || params.username)}`);
}
