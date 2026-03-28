type ForgotPasswordPageProps = {
  searchParams?: Promise<{
    sent?: string;
  }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = (await searchParams) || {};
  const sent = params.sent;

  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Forgot Password</h1>

        {sent && (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            If the email exists, a reset link has been sent.
          </div>
        )}

        {!sent && (
          <form
            action="/api/auth/forgot-password"
            method="post"
            className="card-rk mt-6 space-y-5 p-6"
          >
            <div>
              <label className="label-rk">Email</label>
              <input
                className="input-rk"
                name="email"
                type="email"
                required
              />
            </div>

            <button className="btn-primary w-full">
              Send Reset Link
            </button>
          </form>
        )}
      </div>
    </section>
  );
}