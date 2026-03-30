declare module "canvas-confetti" {
  type Options = Record<string, unknown>;
  function confetti(options?: Options): Promise<null> | null;
  export default confetti;
}
