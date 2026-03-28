import Link from "next/link";

export default function RegisterPage() {
  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Register</h1>

        <form
          action="/api/auth/register"
          method="post"
          className="card-rk mt-8 space-y-4 p-6"
        >
          <div>
            <label className="label-rk">Name</label>
            <input
              className="input-rk"
              name="name"
              autoComplete="name"
              required
            />
          </div>

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
            <label className="label-rk">Password</label>
            <input
              className="input-rk"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full">
            Create account
          </button>

          <p className="text-center text-sm text-white/70">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-white transition hover:text-white/80"
            >
              Login
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}