import Link from "next/link";
import { getProducts } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { CustomTuningForm } from "@/components/custom-tuning-form";
import { db } from "@/lib/db";

export default async function CustomTuningPage() {
  const user = await getSessionUser();
  const [products, taxConfig, taxCodes] = await Promise.all([
    getProducts(),
    db.taxConfiguration.findUnique({ where: { id: "default" } }),
    db.taxCode.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        rate: true,
        calculationMethod: true,
      },
    }),
  ]);
  const customProduct = products.find((p) => p.slug === "custom-file-service");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <h1 className="text-4xl font-bold">Custom Tuning Request</h1>

        <p className="mt-5 max-w-3xl text-white/70 leading-relaxed">
	  Enter your vehicle details, choose ECU only, TCU only, or ECU + TCU tuning, and upload your stock file(s).
        </p>
	<p className="mt-3 max-w-3xl text-white/70 leading-relaxed">
	  Our team will review your request and confirm compatibility, pricing, and turnaround time after submission.
        </p>

        {!customProduct ? (
          <div className="card-rk mt-10 p-6 text-white/70">
            <p className="font-medium text-white">
              Custom File Service product is not configured yet.
            </p>
            <p className="mt-3 text-white/65">
              Please run the database seed or create the product record with slug{" "}
              <code className="rounded bg-black/40 px-2 py-1">
                custom-file-service
              </code>
              .
            </p>
          </div>
        ) : !user ? (
          <div className="card-rk mt-10 p-6">
            <p className="text-white/75">
              Please log in or register before submitting your tuning request.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link href="/login" className="btn-primary">
                Login
              </Link>
              <Link href="/register" className="btn-secondary">
                Register
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-10">
            <CustomTuningForm
              productId={customProduct.id}
              taxConfig={{
                taxModuleEnabled: taxConfig?.taxModuleEnabled ?? false,
                defaultPortalTaxCodeId: taxConfig?.defaultPortalTaxCodeId ?? "",
                taxCodes: taxCodes.map((item) => ({
                  ...item,
                  rate: Number(item.rate),
                })),
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}