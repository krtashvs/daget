export function Watermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-1 right-1.5 z-[1] select-none font-mono text-[9px] tracking-widest text-white"
      style={{ opacity: 0.02 }}
    >
      krtashvs
    </div>
  );
}
