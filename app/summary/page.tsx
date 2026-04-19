import { redirect } from 'next/navigation'

// Legacy URL — preserved so old bookmarks land somewhere useful.
export default function SummaryRedirect() {
  redirect('/insights')
}
