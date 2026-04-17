"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  orderId: string | null;
  orderNumber: string | null;
  href: string;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

//const REFRESH_INTERVAL_MS = 20_000;
  const REFRESH_INTERVAL_MS = 180_000;

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

export function AdminNotificationBell() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [data, setData] = useState<NotificationsResponse>({
    notifications: [],
    unreadCount: 0,
  });

  async function loadNotifications(showLoader = false) {
    try {
      if (showLoader) setLoading(true);

      const res = await fetch("/api/notifications", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) return;

      const json = (await res.json()) as NotificationsResponse;
      setData(json);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications(true);

    const interval = window.setInterval(() => {
      loadNotifications(false);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const hasNotifications = useMemo(
    () => data.notifications.length > 0,
    [data.notifications.length]
  );

  async function handleNotificationClick(item: NotificationItem) {
    try {
      setSubmittingId(item.id);

      if (!item.isRead) {
        const res = await fetch(`/api/notifications/${item.id}/read`, {
          method: "POST",
          cache: "no-store",
        });

        if (res.ok) {
          setData((prev) => ({
            unreadCount: Math.max(0, prev.unreadCount - (item.isRead ? 0 : 1)),
            notifications: prev.notifications.map((notification) =>
              notification.id === item.id
                ? { ...notification, isRead: true }
                : notification
            ),
          }));
        }
      }

      setOpen(false);
      router.push(item.href);
      router.refresh();
    } catch (error) {
      console.error("Failed to open notification:", error);
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleMarkAllAsRead() {
    try {
      setMarkingAll(true);

      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        cache: "no-store",
      });

      if (!res.ok) return;

      setData((prev) => ({
        unreadCount: 0,
        notifications: prev.notifications.map((notification) => ({
          ...notification,
          isRead: true,
        })),
      }));
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/85 transition hover:bg-white/10"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M12 2a6 6 0 0 0-6 6v3.764c0 .424-.135.838-.384 1.18L4.2 14.9A1 1 0 0 0 5 16h14a1 1 0 0 0 .8-1.6l-1.416-1.956a2 2 0 0 1-.384-1.18V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.816-2H9.184A3 3 0 0 0 12 22Z" />
        </svg>

        {data.unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">
            {data.unreadCount > 99 ? "99+" : data.unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-[70] w-[380px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0c]/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Notifications</p>
              <p className="text-xs text-white/45">{data.unreadCount} unread</p>
            </div>

            <div className="flex items-center gap-3">
              {data.unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll}
                  className="text-xs text-white/55 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {markingAll ? "Marking..." : "Mark all as read"}
                </button>
              ) : null}

              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="text-xs text-white/55 transition hover:text-white"
              >
                View Dashboard
              </Link>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-sm text-white/55">
                Loading notifications...
              </div>
            ) : !hasNotifications ? (
              <div className="px-4 py-6 text-sm text-white/55">
                No notifications yet.
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {data.notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(item)}
                      disabled={submittingId === item.id || markingAll}
                      className={`w-full px-4 py-4 text-left transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70 ${
                        item.isRead ? "bg-transparent" : "bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${
                              item.isRead
                                ? "font-medium text-white/80"
                                : "font-semibold text-white"
                            }`}
                          >
                            {item.title}
                          </p>

                          <p className="mt-1 text-sm text-white/55">
                            {item.message}
                          </p>

                          {item.orderNumber ? (
                            <p className="mt-2 text-xs text-white/40">
                              Order: {item.orderNumber}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {!item.isRead ? (
                            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                          ) : null}

                          <span className="text-xs text-white/35">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
