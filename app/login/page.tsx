import Link from "next/link";

export default function LoginPage() {
  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Login</h1>

        <form
          action="/api/auth/login"
          method="post"
          className="card-rk mt-8 space-y-5 p-6"
        >
          <div>
            <label className="label-rk">Email</label>
            <input
              className="input-rk"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label-rk mb-0">Password</label>
              <Link
                href="/forgot-password"
                className="text-sm text-white/60 transition hover:text-white"
              >
                Forgot password?
              </Link>
            </div>
            <input
              className="input-rk"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn-primary w-full">Login</button>

          <p className="text-sm text-white/55">
            Demo admin: admin@rkmotorsports.com / admin123
          </p>
        </form>
      </div>
    </section>
  );
}