import { redirect } from 'next/navigation';

export default function LegacyPatchNoteSearchPage() {
  redirect('/riot-account-viewer/patch-notes');
}
