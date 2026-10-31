import { permanentRedirect } from 'next/navigation';

export default function LegacyWoodcuttingPage() {
  permanentRedirect('/games/woodcutting');
}
