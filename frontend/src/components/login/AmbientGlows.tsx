export function AmbientGlows() {
  return (
    <>
      <div
        aria-hidden
        className="absolute left-[8%] top-[4%] size-[34rem] animate-login-drift rounded-full bg-blue-300/20 blur-[100px] motion-reduce:animate-none"
      />
      <div
        aria-hidden
        className="absolute bottom-[2%] right-[8%] size-[32rem] animate-login-drift-slow rounded-full bg-indigo-300/20 blur-[110px] motion-reduce:animate-none"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(at_15%_15%,rgb(219_234_254_/_75%)_0px,transparent_50%),radial-gradient(at_85%_20%,rgb(224_231_255_/_60%)_0px,transparent_45%),radial-gradient(at_50%_90%,rgb(238_242_255_/_80%)_0px,transparent_55%)]"
      />
    </>
  );
}
