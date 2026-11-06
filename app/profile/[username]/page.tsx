import { permanentRedirect } from 'next/navigation';

function decodeUsername(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return '';
  }
}

export default async function PublicProfilePage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  permanentRedirect(`/users/${encodeURIComponent(decodeUsername(params.username) || params.username)}`);
}
