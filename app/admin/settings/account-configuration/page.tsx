import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountConfigurationForm } from "@/components/account-configuration-form";
import {
  DEFAULT_ACCOUNT_CONFIGURATION_ID,
  DEFAULT_CUSTOMER_ACCOUNT_FORMAT,
  DEFAULT_CUSTOMER_ACCOUNT_PREFIX,
} from "@/lib/customer-account";

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
            Configure customer account numbering for admin-created customer profiles.
          </p>
        </div>

        <div className="mt-8 card-rk p-6 text-white/75">
          <p>
            Customer A/C No. will be generated automatically when a new customer is created.
            The first letter is based on the customer name.
          </p>
        </div>

        <AccountConfigurationForm
          initialCustomerAccountPrefix={
            config?.customerAccountPrefix || DEFAULT_CUSTOMER_ACCOUNT_PREFIX
          }
          initialCustomerAccountNoFormat={
            config?.customerAccountNoFormat || DEFAULT_CUSTOMER_ACCOUNT_FORMAT
          }
        />
      </div>
    </section>
  );
}
