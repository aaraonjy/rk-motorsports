"use client";

import { useState } from "react";
import Link from "next/link";
import { Order, OrderFile, OrderItem, Product, User } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

type OrderWithRelations = Order & {
  user?: User;
  files: OrderFile[];
  items: (OrderItem & { product: Product })[];
  engineModel?: string | null;
  engineCapacity?: string | number | null;
  cancelledBy?: "CUSTOMER" | "ADMIN" | null;
  cancelReason?: string | null;
};

type UploadModalState = {
  action: "admin-upload" | "customer-upload-payment" | "customer-replace-payment";
  orderId: string;
} | null;

function getStatusBadge(status: string) {
  switch (status) {
    case "AWAITING_PAYMENT":
      return "inline-flex items-center justify-center min-w-[120px] text-center rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300";
    case "READY_FOR_DOWNLOAD":
      return "inline-flex items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300";
    case "CANCELLED":
      return "inline-flex items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300";
    case "FILE_RECEIVED":
      return "inline-flex items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-300";
    case "IN_PROGRESS":
      return "inline-flex items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-300";
    case "COMPLETED":
      return "inline-flex items-center justify-center rounded-full border border-green-500/30 bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-300";
    case "PAID":
      return "inline-flex items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300";
    default:
      return "inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "FILE_RECEIVED":
      return "Received";
    case "IN_PROGRESS":
      return "In Progress";
    case "AWAITING_PAYMENT":
      return "Pending Payment";
    case "READY_FOR_DOWNLOAD":
      return "Completed";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PAID":
      return "Paid";
    default:
      return status.replaceAll("_", " ");
  }
}

function VehicleDetails({
  order,
}: {
  order: OrderWithRelations;
}) {
  return (
    <div className="space-y-1 text-sm leading-6">
      <div>
        <span className="text-white/45">Brand:</span>{" "}
        <span className="text-white/90">{order.vehicleBrand || "-"}</span>
      </div>
      <div>
        <span className="text-white/45">Model:</span>{" "}
        <span className="text-white/90">{order.vehicleModel || "-"}</span>
      </div>
      <div>
        <span className="text-white/45">Engine:</span>{" "}
        <span className="text-white/90">{order.engineModel || "-"}</span>
      </div>
      {order.engineCapacity ? (
        <div>
          <span className="text-white/45">Capacity:</span>{" "}
          <span className="text-white/90">{order.engineCapacity}cc</span>
        </div>
      ) : null}
      <div>
        <span className="text-white/45">Year:</span>{" "}
        <span className="text-white/90">{order.vehicleYear || "-"}</span>
      </div>
      <div>
        <span className="text-white/45">ECU/TCU:</span>{" "}
        <span className="text-white/90">{order.ecuType || "-"}</span>
      </div>
    </div>
  );
}

function RequestDetailsModal({
  isOpen,
  onClose,
  details,
}: {
  isOpen: boolean;
  onClose: () => void;
  details: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Request Details</h3>
            <p className="mt-1 text-sm text-white/50">
              Submitted tuning requirements
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/40 p-4 text-sm leading-7 text-white/85 whitespace-pre-wrap">
          {details.trim() || "No request details provided."}
        </div>
      </div>
    </div>
  );
}

function AdminCancelModal({
  isOpen,
  orderId,
  onClose,
}: {
  isOpen: boolean;
  orderId: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !orderId) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div>
          <h3 className="text-lg font-semibold text-white">Cancel Order</h3>
          <p className="mt-1 text-sm text-white/50">
            This will mark the order as cancelled and stop further processing.
          </p>
        </div>

        <form
          action={`/api/admin/orders/${orderId}/cancel`}
          method="post"
          className="mt-5 space-y-4"
          onSubmit={() => setIsSubmitting(true)}
        >
          <div>
            <label className="mb-2 block text-sm text-white/70">
              Cancellation Reason <span className="text-white/40">(optional)</span>
            </label>
            <textarea
              name="cancelReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Unsupported ECU, unreadable file, wrong file uploaded"
              className="min-h-[110px] w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keep Order
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Cancelling..." : "Confirm Cancel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomerCancelModal({
  isOpen,
  orderId,
  onClose,
}: {
  isOpen: boolean;
  orderId: string | null;
  onClose: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !orderId) return null;

  return (
    <div className="fixed inset-0 z-[111] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div>
          <h3 className="text-lg font-semibold text-white">Cancel Order</h3>
          <p className="mt-1 text-sm text-white/50">
            Are you sure you want to cancel this order?
          </p>
        </div>

        <form
          action={`/api/orders/${orderId}/cancel`}
          method="post"
          className="mt-6"
          onSubmit={() => setIsSubmitting(true)}
        >
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keep Order
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Cancelling..." : "Confirm Cancel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReleaseOrderModal({
  isOpen,
  orderId,
  onClose,
}: {
  isOpen: boolean;
  orderId: string | null;
  onClose: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !orderId) return null;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Confirm Payment & Release
          </h3>
          <p className="mt-1 text-sm text-white/50">
            This will confirm payment and release the tuned file for customer download.
          </p>
        </div>

        <form
          action={`/api/admin/orders/${orderId}/complete`}
          method="post"
          className="mt-6"
          onSubmit={() => setIsSubmitting(true)}
        >
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl border border-emerald-500/40 px-4 py-2.5 text-sm text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Releasing..." : "Confirm & Release"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UploadConfirmModal({
  isOpen,
  mode,
  orderId,
  onClose,
}: {
  isOpen: boolean;
  mode: "admin-upload" | "customer-upload-payment" | "customer-replace-payment" | null;
  orderId: string | null;
  onClose: () => void;
}) {
  if (!isOpen || !mode || !orderId) return null;

  const isAdminUpload = mode === "admin-upload";
  const isReplace = mode === "customer-replace-payment";

  const action =
    mode === "admin-upload"
      ? `/api/admin/orders/${orderId}/upload`
      : `/api/orders/${orderId}/upload-payment`;

  const title = isAdminUpload
    ? "Upload Tuned File"
    : isReplace
      ? "Replace Payment Slip"
      : "Upload Payment Slip";

  const description = isAdminUpload
    ? "Please confirm you want to upload this tuned file for the selected order."
    : isReplace
      ? "Please confirm you want to replace the current payment slip."
      : "Please confirm you want to upload this payment slip.";

  const buttonLabel = isAdminUpload
    ? "Confirm Upload"
    : isReplace
      ? "Confirm Replace"
      : "Confirm Upload";

  return (
    <div className="fixed inset-0 z-[112] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-white/50">{description}</p>
        </div>

        <form
          action={action}
          method="post"
          encType="multipart/form-data"
          className="mt-6 space-y-4"
        >
          <div>
            <input
              type="file"
              name="file"
              required
              className="block w-full text-xs text-white/80 file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-black/40 file:px-3 file:py-2 file:text-white hover:file:bg-white/10"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white transition hover:bg-white/10"
            >
              {buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OrderTable({
  orders,
  admin = false,
}: {
  orders: OrderWithRelations[];
  admin?: boolean;
}) {
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [customerCancelOrderId, setCustomerCancelOrderId] = useState<string | null>(null);
  const [releaseOrderId, setReleaseOrderId] = useState<string | null>(null);
  const [uploadModal, setUploadModal] = useState<UploadModalState>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-3xl border border-white/20 bg-black/60 shadow-xl shadow-black/40 backdrop-blur-md">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/50 text-white/65">
            <tr>
              <th className="px-4 py-4">Order</th>
              {admin ? <th className="px-4 py-4">Customer</th> : null}
              <th className="px-4 py-4">Vehicle</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Amount</th>
              <th className="px-4 py-4">Files</th>
              <th className="px-4 py-4">Action</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => {
              const customerOriginal = order.files.find(
                (f) => f.kind === "CUSTOMER_ORIGINAL"
              );
              const adminCompleted = order.files.find(
                (f) => f.kind === "ADMIN_COMPLETED"
              );
              const paymentProof = order.files.find(
                (f) => f.kind === "CUSTOMER_PAYMENT_PROOF"
              );

              const statusLabel = getStatusLabel(order.status);
              const statusBadgeClass = getStatusBadge(order.status);

              return (
                <tr
                  key={order.id}
                  className="border-t border-white/10 align-top"
                >
                  <td className="px-4 py-4">
                    <div className="font-semibold">{order.orderNumber}</div>
                    <div className="text-white/45">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                  </td>

                  {admin ? (
                    <td className="px-4 py-4">{order.user?.email}</td>
                  ) : null}

                  <td className="px-4 py-4">
                    <VehicleDetails order={order} />
                  </td>

                  <td className="px-4 py-4">
                    <span className={statusBadgeClass}>{statusLabel}</span>

                    {admin && order.status === "CANCELLED" && order.cancelledBy ? (
                      <div className="mt-2 text-xs text-white/45">
                        Cancelled by{" "}
                        {order.cancelledBy === "ADMIN" ? "admin" : "customer"}
                        {order.cancelReason ? ` • ${order.cancelReason}` : ""}
                      </div>
                    ) : !admin &&
                      order.status === "CANCELLED" &&
                      order.cancelledBy === "CUSTOMER" ? (
                      <div className="mt-2 text-xs text-white/45">
                        Cancelled by you
                      </div>
                    ) : !admin &&
                      order.status === "CANCELLED" &&
                      order.cancelledBy === "ADMIN" ? (
                      <div className="mt-2 text-xs text-white/45">
                        Cancelled by RK Motorsports
                        <div className="mt-1 text-white/40">
                          This request could not be processed after review. Please
                          contact us for clarification.
                        </div>
                      </div>
                    ) : null}

                    {order.requestDetails ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveRequest(order.requestDetails || "")
                          }
                          className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
                        >
                          View Request
                        </button>
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-4">
                    {formatCurrency(order.totalAmount)}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex min-w-[270px] flex-col gap-2">
                      {customerOriginal ? (
                        <Link
                          href={`/api/files/${customerOriginal.id}/download`}
                          className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                        >
                          Original File
                        </Link>
                      ) : (
                        <span className="text-white/40">No original file</span>
                      )}

                      {admin ? (
                        adminCompleted ? (
                          <Link
                            href={`/api/files/${adminCompleted.id}/download`}
                            className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                          >
                            Tuned File
                          </Link>
                        ) : (
                          <span className="text-white/40">
                            {order.status === "IN_PROGRESS" ||
                            order.status === "FILE_RECEIVED"
                              ? "Tuning in progress"
                              : "No tuned file"}
                          </span>
                        )
                      ) : order.status === "READY_FOR_DOWNLOAD" && adminCompleted ? (
                        <Link
                          href={`/api/files/${adminCompleted.id}/download`}
                          className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                        >
                          Tuned File
                        </Link>
                      ) : order.status === "AWAITING_PAYMENT" && adminCompleted ? (
                        <span className="text-amber-300/90">
                          Tuned file locked until payment is confirmed
                        </span>
                      ) : (
                        <span className="text-white/40">
                          {order.status === "IN_PROGRESS" ||
                          order.status === "FILE_RECEIVED"
                            ? "Tuning in progress"
                            : "No tuned file"}
                        </span>
                      )}

                      {paymentProof ? (
                        <Link
                          href={`/api/files/${paymentProof.id}/download`}
                          className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                        >
                          Payment Slip
                        </Link>
                      ) : admin ? (
                        <span className="text-white/40">No payment proof</span>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    {admin ? (
                      order.status === "CANCELLED" ? (
                        <span className="text-red-400">Order Cancelled</span>
                      ) : (
                        <div className="flex min-w-[280px] flex-col gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setUploadModal({
                                action: "admin-upload",
                                orderId: order.id,
                              })
                            }
                            className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                          >
                            Upload Tuned File
                          </button>

                          {["FILE_RECEIVED", "IN_PROGRESS", "AWAITING_PAYMENT"].includes(
                            order.status
                          ) ? (
                            <button
                              type="button"
                              onClick={() => setCancelOrderId(order.id)}
                              className="rounded-xl border border-red-500/40 px-3 py-2 text-red-400 hover:bg-red-500/10"
                            >
                              Admin Cancel Order
                            </button>
                          ) : null}

                          {order.status === "AWAITING_PAYMENT" && paymentProof ? (
                            <button
                              type="button"
                              onClick={() => setReleaseOrderId(order.id)}
                              className="rounded-xl border border-emerald-500/40 px-3 py-2 text-emerald-400 hover:bg-emerald-500/10"
                            >
                              Confirm Payment & Release
                            </button>
                          ) : order.status === "AWAITING_PAYMENT" ? (
                            <span className="text-amber-300/90">
                              Waiting for payment proof
                            </span>
                          ) : order.status === "READY_FOR_DOWNLOAD" ? (
                            <span className="text-emerald-400">
                              Download Released
                            </span>
                          ) : null}
                        </div>
                      )
                    ) : order.status === "CANCELLED" ? (
                      <span className="text-red-400">Cancelled</span>
                    ) : order.status === "READY_FOR_DOWNLOAD" && adminCompleted ? (
                      <Link
                        href={`/api/files/${adminCompleted.id}/download`}
                        className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                      >
                        Download
                      </Link>
                    ) : order.status === "AWAITING_PAYMENT" && adminCompleted ? (
                      <div className="flex min-w-[230px] flex-col gap-2">
                        <span className="text-amber-300/90">
                          Pending Payment
                        </span>

                        {paymentProof ? (
                          <>
                            <span className="text-emerald-300/90">
                              Payment Slip Uploaded
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setUploadModal({
                                  action: "customer-replace-payment",
                                  orderId: order.id,
                                })
                              }
                              className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white/80 hover:bg-white/10"
                            >
                              Replace Payment Slip
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setUploadModal({
                                action: "customer-upload-payment",
                                orderId: order.id,
                              })
                            }
                            className="rounded-xl border border-amber-500/40 px-3 py-2 text-amber-300 hover:bg-amber-500/10"
                          >
                            Upload Payment Slip
                          </button>
                        )}
                      </div>
                    ) : order.status === "FILE_RECEIVED" ||
                      order.status === "IN_PROGRESS" ? (
                      <button
                        type="button"
                        onClick={() => setCustomerCancelOrderId(order.id)}
                        className="rounded-xl border border-red-500/40 px-3 py-2 text-red-400 hover:bg-red-500/10"
                      >
                        Cancel Order
                      </button>
                    ) : (
                      <span className="text-white/40">Waiting for file</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RequestDetailsModal
        isOpen={activeRequest !== null}
        onClose={() => setActiveRequest(null)}
        details={activeRequest || ""}
      />

      <AdminCancelModal
        isOpen={cancelOrderId !== null}
        orderId={cancelOrderId}
        onClose={() => setCancelOrderId(null)}
      />

      <CustomerCancelModal
        isOpen={customerCancelOrderId !== null}
        orderId={customerCancelOrderId}
        onClose={() => setCustomerCancelOrderId(null)}
      />

      <ReleaseOrderModal
        isOpen={releaseOrderId !== null}
        orderId={releaseOrderId}
        onClose={() => setReleaseOrderId(null)}
      />

      <UploadConfirmModal
        isOpen={uploadModal !== null}
        mode={uploadModal?.action || null}
        orderId={uploadModal?.orderId || null}
        onClose={() => setUploadModal(null)}
      />
    </>
  );
}