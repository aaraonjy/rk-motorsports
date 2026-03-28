export default function ForgotPasswordPage() {
  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Forgot Password</h1>

        <form
          action="/api/auth/forgot-password"
          method="post"
          className="card-rk mt-8 space-y-5 p-6"
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
      </div>
    </section>
  );
}