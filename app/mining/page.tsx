import { permanentRedirect } from 'next/navigation';

/** Preserve links created before original games moved under the Games hub. */
export default function LegacyMiningPage() {
  permanentRedirect('/games/mining');
}
