import Link from "next/link";
import { getProducts } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export default async function CustomTuningPage() {
  const user = await getSessionUser();
  const products = await getProducts();
  const customProduct = products.find((p) => p.slug === "custom-file-service");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-3xl">
        <h1 className="text-4xl font-bold">Custom Tuning Request</h1>

        <p className="mt-5 max-w-xl text-white/70 leading-relaxed">
          Fill in your vehicle details, tuning request, and upload your original ECU file.
          <br />
          Our team will review your request and contact you shortly after submission to confirm compatibility, pricing, and turnaround time.
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
              </code>.
            </p>
          </div>
        ) : !user ? (
          <div className="card-rk mt-10 p-6">
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
            className="card-rk mt-10 grid gap-6 p-6 md:grid-cols-2"
          >
            <input type="hidden" name="productId" value={customProduct.id} />

            <div>
              <label className="label-rk">Vehicle Brand</label>
              <input
                className="input-rk"
                name="vehicleBrand"
                placeholder="e.g. Volkswagen, Audi, BMW, Mazda"
                required
              />
            </div>

            <div>
              <label className="label-rk">Vehicle Model</label>
              <input
                className="input-rk"
                name="vehicleModel"
                placeholder="e.g. Golf GTI MK7, A4 B9, 320i, Mazda 3 MPS"
                required
              />
            </div>

            <div>
              <label className="label-rk">Engine / Variant</label>
              <input
                className="input-rk"
                name="engineModel"
                placeholder="e.g. 2.0 TSI, 1.8T, EA888 Gen 3, B58"
                required
              />
            </div>

            <div>
              <label className="label-rk">Engine Capacity (cc)</label>
              <input
                className="input-rk"
                name="engineCapacity"
                placeholder="e.g. 1984"
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="label-rk">Year</label>
              <input
                className="input-rk"
                name="vehicleYear"
                placeholder="e.g. 2011, 2018, 2022"
                required
              />
            </div>

            <div>
              <label className="label-rk">ECU / TCU</label>
              <input
                className="input-rk"
                name="ecuType"
                placeholder="e.g. Bosch MED17, MG1, DQ250, DQ381"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="label-rk">Request Details</label>
              <textarea
                className="textarea-rk"
                name="requestDetails"
                placeholder="e.g. Stage 1 / Stage 2, fuel type (RON95/98), pops & bangs on/off, launch control, gearbox tuning, any special request"
              />
            </div>

            <div className="md:col-span-2 text-sm text-white/60">
              <p>Please upload your original stock ECU file.</p>
              <p>Allowed formats: .bin, .ori, .hex, .frf, .sgo</p>
              <p>Max recommended size: 10MB</p>
              <p>If you are unsure which file to upload, contact us before submitting.</p>
              <p className="mt-1 text-white/50">Your file will be handled securely and kept confidential.</p>
            </div>

            <div className="md:col-span-2">
              <label className="label-rk">Original ECU File</label>
              <input
                className="input-rk cursor-pointer"
                name="file"
                type="file"
                required
              />
            </div>

            <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
              <p className="mb-2 font-semibold text-white">Important Notes</p>
              <ul className="space-y-1">
                <li>• Your uploaded ECU file will be handled confidentially</li>
                <li>• We do not share customer files with third parties</li>
                <li>• All tuning requests are reviewed manually before work begins</li>
                <li>• We will contact you to confirm compatibility, pricing, and turnaround time</li>
              </ul>
            </div>

            <div className="md:col-span-2 pt-2">
              <button className="btn-primary px-8 py-3 text-sm tracking-wide">
                Submit Tuning Request
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}