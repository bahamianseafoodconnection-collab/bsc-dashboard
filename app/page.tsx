"use client";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#f3f3f3]">
      <div className="mx-auto max-w-md bg-white min-h-screen shadow-sm">
        <div className="bg-[#4a90e2] px-6 py-8">
          <h1 className="text-4xl font-bold tracking-wide text-white">
            BSC CONTROL
          </h1>
        </div>

        <div className="px-10 py-16">
          <h2 className="text-3xl font-bold text-[#0b1533] mb-8">
            Supplier Chat Module
          </h2>

          <p className="text-xl leading-relaxed text-[#111827]">
            Module temporarily disabled for clean system rebuild.
          </p>
        </div>

        <nav className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-md items-center justify-around border-t bg-white py-3 text-sm">
          <span>🏠 Dashboard</span>
          <span>💡 Bills</span>
          <span>📦 Inventory</span>
          <span>🧾 POS</span>
          <span>💵 Cash</span>
        </nav>
      </div>
    </main>
  );
}