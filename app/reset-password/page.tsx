type ResetPasswordPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = (await searchParams) || {};
  const token = params.token || "";

  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Reset Password</h1>

        <form
          action="/api/auth/reset-password"
          method="post"
          className="card-rk mt-8 space-y-5 p-6"
        >
          <input type="hidden" name="token" value={token} />

          <div>
            <label className="label-rk">New Password</label>
            <input
              className="input-rk"
              name="password"
              type="password"
              required
            />
          </div>

          <button className="btn-primary w-full">
            Reset Password
          </button>
        </form>
      </div>
    </section>
  );
}