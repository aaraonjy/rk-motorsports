export default function LoginPage() {
  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Login</h1>
        <form action="/api/auth/login" method="post" className="card-rk mt-8 space-y-4 p-6">
          <div>
            <label className="label-rk">Email</label>
            <input className="input-rk" name="email" type="email" required />
          </div>
          <div>
            <label className="label-rk">Password</label>
            <input className="input-rk" name="password" type="password" required />
          </div>
          <button className="btn-primary w-full">Login</button>
          <p className="text-sm text-white/55">Demo admin: admin@rkmotorsports.com / admin123</p>
        </form>
      </div>
    </section>
  );
}
