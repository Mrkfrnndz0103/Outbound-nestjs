export function AmbientGlows() {
  return (
    <>
      <div
        aria-hidden
        className="absolute -top-32 left-[12%] h-[360px] w-[360px] animate-login-drift rounded-full bg-auth-accent/25 blur-[100px] motion-reduce:animate-none"
      />
      <div
        aria-hidden
        className="absolute -bottom-36 right-[8%] h-[380px] w-[380px] animate-login-drift-slow rounded-full bg-[#82a9ff]/20 blur-[110px] motion-reduce:animate-none"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:52px_52px]"
      />
    </>
  );
}
