import { redirect } from 'next/navigation';

export default function LegacyMasterSitePage() {
  redirect('/master/marketplace/catalog');
}
