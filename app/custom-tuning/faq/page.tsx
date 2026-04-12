const faqs = [
  ["How does the custom file workflow work?", "Customer uploads an original file, admin tunes it offline, and customer downloads the completed file later."],
  ["Can I track my order?", "Yes. The dashboard shows order status and downloadable completed files."],
  ["Can admin manage uploaded files?", "Yes. Admin can view orders, review uploaded files, and mark jobs ready for download."],
];

export default function FaqPage() {
  return (
    <section className="section-pad">
      <div className="container-rk max-w-4xl">
        <h1 className="text-4xl font-bold">FAQ</h1>
        <div className="mt-8 space-y-4">
          {faqs.map(([q, a]) => (
            <div key={q} className="card-rk p-6">
              <h2 className="text-xl font-semibold">{q}</h2>
              <p className="mt-3 text-white/70">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
