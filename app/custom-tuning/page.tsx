import Link from "next/link";
import { getProducts } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export default async function CustomTuningPage() {
  const user = await getSessionUser();
  const products = await getProducts();
  const customProduct =
    products.find((p) => p.slug === "custom-file-service") || products[0];

  return (
    <section className="section-pad">
      <div className="container-rk max-w-4xl">
        <h1 className="text-4xl font-bold">Custom Tuning Request</h1>
        <p className="mt-4 text-white/70">
          Upload your original ECU file, choose your platform details, and create an order.
        </p>

        {!customProduct ? (
          <div className="card-rk mt-8 p-6 text-white/70">
            Custom File Service product is not configured yet.
          </div>
        ) : !user ? (
          <div className="card-rk mt-8 p-6">
            <p className="text-white/75">
              Please log in or register before submitting your ECU file.
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
          <form
            action="/api/orders"
            method="post"
            encType="multipart/form-data"
            className="card-rk mt-8 grid gap-4 p-6 md:grid-cols-2"
          >
            <input type="hidden" name="productId" value={customProduct.id} />

            <div>
              <label className="label-rk">Vehicle Brand</label>
              <input className="input-rk" name="vehicleBrand" required />
            </div>

            <div>
              <label className="label-rk">Vehicle Model</label>
              <input className="input-rk" name="vehicleModel" required />
            </div>

            <div>
              <label className="label-rk">Year</label>
              <input className="input-rk" name="vehicleYear" required />
            </div>

            <div>
              <label className="label-rk">ECU / TCU</label>
              <input className="input-rk" name="ecuType" required />
            </div>

            <div className="md:col-span-2">
              <label className="label-rk">Request details</label>
              <textarea
                className="textarea-rk"
                name="requestDetails"
                placeholder="Stage, hardware, fuel, crackle, pops, launch control, gearbox tune, etc."
              />
            </div>

            <div className="md:col-span-2">
              <label className="label-rk">Original ECU file</label>
              <input className="input-rk" name="file" type="file" required />
            </div>

            <div className="md:col-span-2">
              <button className="btn-primary">Submit order</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}