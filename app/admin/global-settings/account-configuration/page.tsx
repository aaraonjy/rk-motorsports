import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountConfigurationForm } from "@/components/global-settings/account-configuration-form";
import {
  DEFAULT_ACCOUNT_CONFIGURATION_ID,
  DEFAULT_CUSTOMER_ACCOUNT_FORMAT,
  DEFAULT_CUSTOMER_ACCOUNT_PREFIX,
} from "@/lib/customer-account";
import {
  DEFAULT_SUPPLIER_ACCOUNT_FORMAT,
  DEFAULT_SUPPLIER_ACCOUNT_PREFIX,
} from "@/lib/supplier-account";

export default async function AdminAccountConfigurationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const config = await db.accountConfiguration.findUnique({
    where: { id: DEFAULT_ACCOUNT_CONFIGURATION_ID },
  });

  return (
    <section className="section-pad">
      <div className="container-rk max-w-5xl">
        <div>
          <h1 className="text-4xl font-bold">Account Configuration</h1>
          <p className="mt-4 text-white/70">
            Configure customer and supplier account numbering for master profiles.
          </p>
        </div>

        <div className="mt-8 card-rk p-6 text-white/75">
          <p>
            Customer and Supplier A/C No. will be generated automatically when a new profile is created.
            The first letter is based on the customer or supplier name.
          </p>
        </div>

        <AccountConfigurationForm
          initialCustomerAccountPrefix={
            config?.customerAccountPrefix || DEFAULT_CUSTOMER_ACCOUNT_PREFIX
          }
          initialCustomerAccountNoFormat={
            config?.customerAccountNoFormat || DEFAULT_CUSTOMER_ACCOUNT_FORMAT
          }
          initialSupplierAccountPrefix={
            config?.supplierAccountPrefix || DEFAULT_SUPPLIER_ACCOUNT_PREFIX
          }
          initialSupplierAccountNoFormat={
            config?.supplierAccountNoFormat || DEFAULT_SUPPLIER_ACCOUNT_FORMAT
          }
        />
      </div>
    </section>
  );
}
