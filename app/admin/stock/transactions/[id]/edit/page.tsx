import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminStockTransactionEditClient } from "@/components/admin-stock-transaction-edit-client";

type Params = { params: Promise<{ id: string }> };

function getTypeLabel(type: string) {
  switch (type) {
    case "OB": return "Opening Stock";
    case "SR": return "Stock Receive";
    case "SI": return "Stock Issue";
    case "SA": return "Stock Adjustment";
    case "ST": return "Stock Transfer";
    case "AS": return "Stock Assembly";
    default: return "Stock Transaction";
  }
}

export default async function AdminStockTransactionEditPage({ params }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const transaction = await db.stockTransaction.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
          location: { select: { id: true, code: true, name: true } },
          fromLocation: { select: { id: true, code: true, name: true } },
          toLocation: { select: { id: true, code: true, name: true } },
          serialEntries: { orderBy: [{ serialNo: "asc" }], select: { id: true, serialNo: true } },
        },
      },
    },
  });

  if (!transaction) {
    return <section className="section-pad"><div className="container-rk max-w-4xl"><p className="text-white/70">Stock transaction not found.</p></div></section>;
  }

  if (transaction.status === "CANCELLED") {
    redirect(`/admin/stock/transactions/${transaction.id}`);
  }

  const [products, locations] = await Promise.all([
    db.inventoryProduct.findMany({
      where: { isActive: true, trackInventory: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, description: true, baseUom: true, unitCost: true, batchTracking: true, serialNumberTracking: true },
    }),
    db.stockLocation.findMany({ orderBy: [{ isActive: "desc" }, { code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
  ]);

  const title = getTypeLabel(transaction.transactionType);
  const intro = "Editing will safely reverse the original posted transaction, validate the new data, and repost it as a new stock transaction while keeping the audit trail.";

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <AdminStockTransactionEditClient
          transactionId={transaction.id}
          transactionType={transaction.transactionType}
          title={title}
          intro={intro}
          initialTransaction={transaction as any}
          initialProducts={products.map((product) => ({
            id: product.id,
            code: product.code,
            description: product.description,
            baseUom: product.baseUom,
            unitCost: Number(product.unitCost ?? 0),
            batchTracking: product.batchTracking,
            serialNumberTracking: product.serialNumberTracking,
          }))}
          initialLocations={locations}
        />
      </div>
    </section>
  );
}
