"use client";

import { useEffect, useState } from "react";

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

const REFRESH_INTERVAL_MS = 20_000;

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

export function CustomerNotificationPanel() {
  const [loading, setLoading] = useState(true);
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
      console.error("Failed to load customer notifications:", error);
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function markAsRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
      });

      setData((prev) => ({
        unreadCount: Math.max(0, prev.unreadCount - 1),
        notifications: prev.notifications.map((item) =>
          item.id === id ? { ...item, isRead: true } : item
        ),
      }));
    } catch (error) {
      console.error("Failed to mark customer notification as read:", error);
    }
  }

  useEffect(() => {
    loadNotifications(true);

    const interval = window.setInterval(() => {
      loadNotifications(false);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="card-rk p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Order Updates</h2>
          <p className="mt-2 text-sm text-white/70">
            Track the latest progress for your tuning orders.
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60">
          {data.unreadCount} unread
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="text-sm text-white/55">Loading updates...</div>
        ) : data.notifications.length === 0 ? (
          <div className="text-sm text-white/55">No updates yet.</div>
        ) : (
          <div className="space-y-3">
            {data.notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.isRead) markAsRead(item.id);
                }}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  item.isRead
                    ? "border-white/10 bg-white/[0.03]"
                    : "border-emerald-500/20 bg-emerald-500/[0.08]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${
                        item.isRead
                          ? "font-medium text-white/85"
                          : "font-semibold text-white"
                      }`}
                    >
                      {item.title}
                    </p>

                    <p className="mt-1 text-sm text-white/65">{item.message}</p>

                    {item.orderNumber ? (
                      <p className="mt-2 text-xs text-white/40">
                        Order: {item.orderNumber}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!item.isRead ? (
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    ) : null}

                    <span className="text-xs text-white/35">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}