import Link from "next/link";
import { getProducts } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { CustomTuningForm } from "@/components/custom-tuning-form";

export default async function CustomTuningPage() {
  const user = await getSessionUser();
  const products = await getProducts();
  const customProduct = products.find((p) => p.slug === "custom-file-service");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <h1 className="text-4xl font-bold">Custom Tuning Request</h1>

        <p className="mt-5 max-w-3xl text-white/70 leading-relaxed">
          Fill in your vehicle details, choose ECU only, TCU only, or ECU + TCU
          tuning, select any additional options, and upload your stock file(s).
          <br />
          Our team will review your request and contact you shortly after
          submission to confirm compatibility, pricing, and turnaround time.
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
            <CustomTuningForm productId={customProduct.id} />
          </div>
        )}
      </div>
    </section>
  );
}