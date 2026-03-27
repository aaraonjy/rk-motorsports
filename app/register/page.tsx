export default function RegisterPage() {
  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Register</h1>
        <form action="/api/auth/register" method="post" className="card-rk mt-8 space-y-4 p-6">
          <div>
            <label className="label-rk">Name</label>
            <input className="input-rk" name="name" required />
          </div>
          <div>
            <label className="label-rk">Email</label>
            <input className="input-rk" name="email" type="email" required />
          </div>
          <div>
            <label className="label-rk">Password</label>
            <input className="input-rk" name="password" type="password" required />
          </div>
          <button className="btn-primary w-full">Create account</button>
        </form>
      </div>
    </section>
  );
}
