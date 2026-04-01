"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Order,
  OrderFile,
  OrderItem,
  OrderRevision,
  Product,
  User,
} from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

export type OrderWithRelations = Order & {
  user?: User;
  files: OrderFile[];
  revisions: (OrderRevision & { orderFile: OrderFile })[];
  items: (OrderItem & { product: Product })[];
  engineModel?: string | null;
  engineCapacity?: string | number | null;
  cancelledBy?: "CUSTOMER" | "ADMIN" | null;
  cancelReason?: string | null;
};

type UploadModalState =
  | {
      action:
        | "admin-upload-ecu"
        | "admin-upload-tcu"
        | "admin-upload-revision-ecu"
        | "admin-upload-revision-tcu"
        | "customer-upload-payment"
        | "customer-replace-payment";
      orderId: string;
    }
  | null;

function getStatusBadge(status: string) {
  switch (status) {
    case "AWAITING_PAYMENT":
      return "inline-flex min-w-[122px] items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-center text-xs font-semibold text-amber-300";
    case "READY_FOR_DOWNLOAD":
      return "inline-flex min-w-[122px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300";
    case "CANCELLED":
      return "inline-flex min-w-[122px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300";
    case "FILE_RECEIVED":
      return "inline-flex min-w-[122px] items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1 text-center text-xs font-semibold text-sky-300";
    case "IN_PROGRESS":
      return "inline-flex min-w-[122px] items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-1 text-center text-xs font-semibold text-violet-300";
    case "COMPLETED":
      return "inline-flex min-w-[122px] items-center justify-center rounded-full border border-green-500/30 bg-green-500/15 px-3 py-1 text-center text-xs font-semibold text-green-300";
    case "PAID":
      return "inline-flex min-w-[122px] items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-center text-xs font-semibold text-cyan-300";
    default:
      return "inline-flex min-w-[122px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/80";
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

function getTuningTypeLabel(value?: string | null) {
  if (value === "ECU_TCU") return "ECU + TCU";
  if (value === "TCU") return "TCU";
  return "ECU";
}

function getRevisionTargetLabel(value?: string | null) {
  return (value || "ECU").toUpperCase() === "TCU" ? "TCU" : "ECU";
}

function VehicleDetails({ order }: { order: OrderWithRelations }) {
  return (
    <div className="space-y-1 text-sm leading-6">
      <div>
        <span className="text-white/45">Tuning Type:</span>{" "}
        <span className="text-white/90">{getTuningTypeLabel(order.tuningType)}</span>
      </div>

      <div>
        <span className="text-white/45">Brand:</span>{" "}
        <span className="text-white/90">{order.vehicleBrand || "-"}</span>
      </div>

      <div>
        <span className="text-white/45">Model / Generation:</span>{" "}
        <span className="text-white/90">{order.vehicleModel || "-"}</span>
      </div>

      <div>
        <span className="text-white/45">Engine / Variant:</span>{" "}
        <span className="text-white/90">{order.engineModel || "-"}</span>
      </div>

      <div>
        <span className="text-white/45">Year / Range:</span>{" "}
        <span className="text-white/90">{order.vehicleYear || "-"}</span>
      </div>

      {order.engineCapacity ? (
        <div>
          <span className="text-white/45">Capacity:</span>{" "}
          <span className="text-white/90">{order.engineCapacity}cc</span>
        </div>
      ) : null}

      {order.tuningType === "ECU" || order.tuningType === "ECU_TCU" || !order.tuningType ? (
        <>
          <div>
            <span className="text-white/45">ECU Stage:</span>{" "}
            <span className="text-white/90">{order.ecuStage || "-"}</span>
          </div>
          <div>
            <span className="text-white/45">ECU Type:</span>{" "}
            <span className="text-white/90">{order.ecuType || "-"}</span>
          </div>
          <div>
            <span className="text-white/45">ECU Read Tool:</span>{" "}
            <span className="text-white/90">{order.ecuReadTool || "-"}</span>
          </div>
        </>
      ) : null}

      {order.tuningType === "TCU" || order.tuningType === "ECU_TCU" ? (
        <>
          <div>
            <span className="text-white/45">TCU Stage:</span>{" "}
            <span className="text-white/90">{order.tcuStage || "-"}</span>
          </div>
          <div>
            <span className="text-white/45">TCU Type:</span>{" "}
            <span className="text-white/90">{order.tcuType || "-"}</span>
          </div>
          <div>
            <span className="text-white/45">TCU Read Tool:</span>{" "}
            <span className="text-white/90">{order.tcuReadTool || "-"}</span>
          </div>
          <div>
            <span className="text-white/45">TCU Version:</span>{" "}
            <span className="text-white/90">{order.tcuVersion || "-"}</span>
          </div>
        </>
      ) : null}

      <div>
        <span className="text-white/45">Fuel Grade:</span>{" "}
        <span className="text-white/90">{order.fuelGrade || "-"}</span>
      </div>

      {order.tuningType === "ECU" || order.tuningType === "ECU_TCU" || !order.tuningType ? (
        <div>
          <span className="text-white/45">Water Methanol Injection:</span>{" "}
          <span className="text-white/90">
            {order.waterMethanolInjection || "Not selected"}
          </span>
        </div>
      ) : null}
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
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
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

        <div className="mt-5 rounded-xl border border-white/10 bg-black/40 p-4">
          <pre className="whitespace-pre-wrap text-sm leading-7 text-white/85">
            {details}
          </pre>
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
              placeholder="e.g. Unsupported file, wrong file uploaded, incompatible setup"
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
            This will confirm payment and release the tuned file(s) for customer
            download.
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
  mode: NonNullable<UploadModalState>["action"] | null;
  orderId: string | null;
  onClose: () => void;
}) {
  const [remark, setRemark] = useState("");

  if (!isOpen || !mode || !orderId) return null;

  const isAdminUploadEcu = mode === "admin-upload-ecu";
  const isAdminUploadTcu = mode === "admin-upload-tcu";
  const isAdminRevisionEcu = mode === "admin-upload-revision-ecu";
  const isAdminRevisionTcu = mode === "admin-upload-revision-tcu";
  const isReplace = mode === "customer-replace-payment";

  const action =
    isAdminUploadEcu || isAdminUploadTcu
      ? `/api/admin/orders/${orderId}/upload`
      : isAdminRevisionEcu || isAdminRevisionTcu
        ? `/api/admin/orders/${orderId}/upload-revision`
        : `/api/orders/${orderId}/upload-payment`;

  const title = isAdminUploadEcu
    ? "Upload Tuned ECU File"
    : isAdminUploadTcu
      ? "Upload Tuned TCU File"
      : isAdminRevisionEcu
        ? "Upload ECU Revision"
        : isAdminRevisionTcu
          ? "Upload TCU Revision"
          : isReplace
            ? "Replace Payment Slip"
            : "Upload Payment Slip";

  const buttonLabel =
    isAdminRevisionEcu || isAdminRevisionTcu
      ? "Upload Revision"
      : isReplace
        ? "Confirm Replace"
        : "Confirm Upload";

  const target =
    isAdminUploadTcu || isAdminRevisionTcu
      ? "TCU"
      : isAdminUploadEcu || isAdminRevisionEcu
        ? "ECU"
        : "";

  return (
    <div className="fixed inset-0 z-[112] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-white/50">
            Please confirm the upload for this order.
          </p>
        </div>

        <form
          action={action}
          method="post"
          encType="multipart/form-data"
          className="mt-6 space-y-4"
        >
          {target ? <input type="hidden" name="target" value={target} /> : null}

          <div>
            <input
              type="file"
              name={
                isAdminRevisionEcu || isAdminUploadEcu
                  ? "ecuFile"
                  : isAdminRevisionTcu || isAdminUploadTcu
                    ? "tcuFile"
                    : "file"
              }
              required
              className="block w-full text-xs text-white/80 file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-black/40 file:px-3 file:py-2 file:text-white hover:file:bg-white/10"
            />
          </div>

          {isAdminRevisionEcu || isAdminRevisionTcu ? (
            <div>
              <label className="mb-2 block text-sm text-white/70">
                Internal Remark <span className="text-red-300">*</span>
              </label>
              <textarea
                name="remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                required
                placeholder="e.g. Adjusted torque request, refined shift logic, improved drivability"
                className="min-h-[110px] w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25"
              />
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setRemark("");
                onClose();
              }}
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

function FileSection({
  title,
  originalFile,
  tunedFile,
  revisions,
  admin,
  canDownloadTuned,
}: {
  title: string;
  originalFile: OrderFile | null;
  tunedFile: OrderFile | null;
  revisions: (OrderRevision & { orderFile: OrderFile })[];
  admin: boolean;
  canDownloadTuned: boolean;
}) {
  const latestRevision = revisions[0] || null;
  const history = revisions.slice(1);

  return (
    <div className="max-w-[260px] rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
        {title}
      </div>

      <div className="flex flex-col gap-2">
        {originalFile ? (
          <Link
            href={`/api/files/${originalFile.id}/download`}
            className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
          >
            Original File
          </Link>
        ) : (
          <span className="text-xs text-white/35">No original file</span>
        )}

        {tunedFile && (admin || canDownloadTuned) ? (
          <Link
            href={`/api/files/${tunedFile.id}/download`}
            className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
          >
            {admin ? "Tuned File" : "Download Tuned File"}
          </Link>
        ) : null}

        {latestRevision ? (
          <div className="flex flex-col gap-1">
            <Link
              href={`/api/files/${latestRevision.orderFile.id}/download`}
              className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
            >
              {admin ? "Latest Revision File" : "Download Latest Revision"}
            </Link>
            <span className="text-xs text-white/45">
              Rev {latestRevision.revisionNo}
            </span>
            {admin ? (
              <span className="text-xs text-white/45">
                Remark: {latestRevision.remark}
              </span>
            ) : null}
          </div>
        ) : null}

        {history.length > 0 && admin ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Revision History
            </div>
            <div className="space-y-2">
              {history.map((revision) => (
                <div
                  key={revision.id}
                  className="rounded-lg border border-white/10 bg-black/30 p-3"
                >
                  <Link
                    href={`/api/files/${revision.orderFile.id}/download`}
                    className="inline-block rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm hover:bg-white/10"
                  >
                    Download Rev {revision.revisionNo}
                  </Link>
                  <div className="mt-2 text-xs text-white/45">
                    Remark: {revision.remark}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
        <table className="w-full text-left text-sm">
          <thead className="bg-black/50 text-white/65">
            <tr>
              <th className="px-4 py-4 w-[140px]">Order</th>
              {admin ? <th className="px-4 py-4 w-[150px]">Customer</th> : null}
              <th className="px-4 py-4 min-w-[320px]">Vehicle</th>
              <th className="px-4 py-4 w-[170px]">Status</th>
              <th className="px-4 py-4 w-[110px]">Amount</th>
              <th className="px-4 py-4 w-[290px]">Files</th>
              <th className="px-4 py-4 w-[240px]">Action</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => {
              const tuningType = order.tuningType || "ECU";
              const needsEcu = tuningType === "ECU" || tuningType === "ECU_TCU";
              const needsTcu = tuningType === "TCU" || tuningType === "ECU_TCU";

              const customerOriginalLegacy = order.files.find(
                (f) => f.kind === "CUSTOMER_ORIGINAL"
              );

              const customerEcu =
                order.files.find((f) => f.kind === "CUSTOMER_ECU") ||
                (needsEcu ? customerOriginalLegacy || null : null);

              const customerTcu =
                order.files.find((f) => f.kind === "CUSTOMER_TCU") || null;

              const adminEcu =
                order.files.find((f) => f.kind === "ADMIN_ECU") ||
                order.files.find((f) => f.kind === "ADMIN_COMPLETED") ||
                null;

              const adminTcu =
                order.files.find((f) => f.kind === "ADMIN_TCU") || null;

              const paymentProof = order.files.find(
                (f) => f.kind === "CUSTOMER_PAYMENT_PROOF"
              );

              const ecuRevisions = order.revisions
                .filter(
                  (revision) =>
                    getRevisionTargetLabel(revision.revisionTarget) === "ECU"
                )
                .sort((a, b) => b.revisionNo - a.revisionNo);

              const tcuRevisions = order.revisions
                .filter(
                  (revision) =>
                    getRevisionTargetLabel(revision.revisionTarget) === "TCU"
                )
                .sort((a, b) => b.revisionNo - a.revisionNo);

              const statusLabel = getStatusLabel(order.status);
              const statusBadgeClass = getStatusBadge(order.status);

              const hasAllAdminFiles =
                (!needsEcu || !!adminEcu) && (!needsTcu || !!adminTcu);

              return (
                <tr
                  key={order.id}
                  className="border-t border-white/10 align-top transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-4">
                    <div className="font-semibold break-words">{order.orderNumber}</div>
                    <div className="text-white/45">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                  </td>

                  {admin ? (
                    <td className="px-4 py-4 break-words">{order.user?.email}</td>
                  ) : null}

                  <td className="px-4 py-4">
                    <VehicleDetails order={order} />
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex min-w-[150px] flex-col items-start gap-3">
                      <span className={statusBadgeClass}>{statusLabel}</span>

                      {admin &&
                      order.status === "AWAITING_PAYMENT" &&
                      !paymentProof ? (
                        <div className="text-sm text-amber-300/90">
                          Waiting for payment proof
                        </div>
                      ) : null}

                      {admin && order.status === "CANCELLED" && order.cancelledBy ? (
                        <div className="text-xs text-white/45">
                          Cancelled by{" "}
                          {order.cancelledBy === "ADMIN" ? "admin" : "customer"}
                          {order.cancelReason ? ` • ${order.cancelReason}` : ""}
                        </div>
                      ) : !admin &&
                        order.status === "CANCELLED" &&
                        order.cancelledBy === "CUSTOMER" ? (
                        <div className="text-xs text-white/45">
                          Cancelled by you
                        </div>
                      ) : !admin &&
                        order.status === "CANCELLED" &&
                        order.cancelledBy === "ADMIN" ? (
                        <div className="text-xs text-white/45">
                          Cancelled by RK Motorsports
                          <div className="mt-1 text-white/40">
                            This request could not be processed after review.
                            Please contact us for clarification.
                          </div>
                        </div>
                      ) : null}

                      {order.requestDetails ? (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveRequest(order.requestDetails || "")
                          }
                          className="inline-flex min-w-[122px] items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/72 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                        >
                          View Request
                        </button>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-4 py-4 whitespace-nowrap">
                    {formatCurrency(order.totalAmount)}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex w-[260px] flex-col gap-3">
                      {needsEcu ? (
                        <FileSection
                          title="ECU"
                          originalFile={customerEcu}
                          tunedFile={adminEcu}
                          revisions={ecuRevisions}
                          admin={admin}
                          canDownloadTuned={order.status === "READY_FOR_DOWNLOAD"}
                        />
                      ) : null}

                      {needsTcu ? (
                        <FileSection
                          title="TCU"
                          originalFile={customerTcu}
                          tunedFile={adminTcu}
                          revisions={tcuRevisions}
                          admin={admin}
                          canDownloadTuned={order.status === "READY_FOR_DOWNLOAD"}
                        />
                      ) : null}

                      {paymentProof ? (
                        <Link
                          href={`/api/files/${paymentProof.id}/download`}
                          className="inline-block rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                        >
                          Payment Slip
                        </Link>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    {admin ? (
                      order.status === "CANCELLED" ? (
                        <span className="text-red-400">Order Cancelled</span>
                      ) : (
                        <div className="w-[220px]">
                          <div className="flex flex-col gap-3">
                            {needsEcu && !adminEcu ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setUploadModal({
                                    action: "admin-upload-ecu",
                                    orderId: order.id,
                                  })
                                }
                                className="block w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center transition hover:bg-white/10"
                              >
                                Upload Tuned ECU
                              </button>
                            ) : null}

                            {needsTcu && !adminTcu ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setUploadModal({
                                    action: "admin-upload-tcu",
                                    orderId: order.id,
                                  })
                                }
                                className="block w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center transition hover:bg-white/10"
                              >
                                Upload Tuned TCU
                              </button>
                            ) : null}

                            {["FILE_RECEIVED", "IN_PROGRESS", "AWAITING_PAYMENT"].includes(
                              order.status
                            ) ? (
                              <button
                                type="button"
                                onClick={() => setCancelOrderId(order.id)}
                                className="block w-full rounded-xl border border-red-500/40 px-3 py-2 text-center text-red-400 transition hover:bg-red-500/10"
                              >
                                Admin Cancel Order
                              </button>
                            ) : null}

                            {order.status === "AWAITING_PAYMENT" &&
                            paymentProof &&
                            hasAllAdminFiles ? (
                              <button
                                type="button"
                                onClick={() => setReleaseOrderId(order.id)}
                                className="block w-full rounded-xl border border-emerald-500/40 px-3 py-2 text-center text-emerald-400 transition hover:bg-emerald-500/10"
                              >
                                Confirm Payment & Release
                              </button>
                            ) : null}

                            {["READY_FOR_DOWNLOAD", "COMPLETED"].includes(order.status) &&
                            needsEcu &&
                            adminEcu ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setUploadModal({
                                    action: "admin-upload-revision-ecu",
                                    orderId: order.id,
                                  })
                                }
                                className="block w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center transition hover:bg-white/10"
                              >
                                Upload ECU Revision
                              </button>
                            ) : null}

                            {["READY_FOR_DOWNLOAD", "COMPLETED"].includes(order.status) &&
                            needsTcu &&
                            adminTcu ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setUploadModal({
                                    action: "admin-upload-revision-tcu",
                                    orderId: order.id,
                                  })
                                }
                                className="block w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center transition hover:bg-white/10"
                              >
                                Upload TCU Revision
                              </button>
                            ) : null}

                            {order.status === "READY_FOR_DOWNLOAD" ? (
                              <span className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-emerald-400">
                                Download Released
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )
                    ) : order.status === "CANCELLED" ? (
                      <span className="text-red-400">Cancelled</span>
                    ) : order.status === "READY_FOR_DOWNLOAD" ? (
                      <div className="flex min-w-[230px] flex-col gap-2">
                        {needsEcu && adminEcu ? (
                          <Link
                            href={`/api/files/${adminEcu.id}/download`}
                            className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                          >
                            Download ECU
                          </Link>
                        ) : null}

                        {needsTcu && adminTcu ? (
                          <Link
                            href={`/api/files/${adminTcu.id}/download`}
                            className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 hover:bg-white/10"
                          >
                            Download TCU
                          </Link>
                        ) : null}
                      </div>
                    ) : order.status === "AWAITING_PAYMENT" && hasAllAdminFiles ? (
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