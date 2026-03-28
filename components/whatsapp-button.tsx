export function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/60123106132"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-green-500 px-5 py-3 text-white shadow-lg transition hover:bg-green-600"
    >
      <span className="text-lg">💬</span>
      <span className="hidden md:block font-medium">WhatsApp</span>
    </a>
  );
}