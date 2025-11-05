import { SimonGame } from "@/components/SimonGame";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-black px-6 py-16 text-zinc-900 sm:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_45%)]" />
      <div className="relative z-10 w-full max-w-5xl rounded-[40px] border border-white/10 bg-white/60 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
        <SimonGame />
      </div>
    </main>
  );
}
