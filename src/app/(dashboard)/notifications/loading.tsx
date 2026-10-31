import { NotificationsRouteLoading } from "@/components/notifications/notification-center-workspace";

/**
 * UI-06 - Notifications is a single list of rows: the loading screen keeps the page header and shows
 * the same row-shaped skeleton the feed shows, instead of the generic stat-and-table page skeleton.
 */
export default function Loading() {
  return <NotificationsRouteLoading />;
}
